import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OtaReleaseStatus, OtaUpdateStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  CreateReleaseDto, OtaReportDto, SetReleaseStatusDto, UpdateReleaseDto,
} from './ota.dto';

const OTA_DIR = path.join(process.cwd(), 'uploads', 'ota');
const MIN_SAMPLE_FOR_AUTOSTOP = 5;

/** Compare semver-ish version strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Deterministic 0-99 bucket for a (device, release) pair so a growing rollout
 *  percentage always *includes* the previously-targeted devices (stable canary). */
function rolloutBucket(deviceId: string, releaseId: string): number {
  const h = createHash('md5').update(`${deviceId}:${releaseId}`).digest();
  return h[0] % 100;
}

@Injectable()
export class OtaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /* ─────────────── Locations (for CMS dropdown) ─────────────── */
  listLocations() {
    return this.prisma.kioskLocation.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  /* ─────────────── Releases (admin) ─────────────── */
  async listReleases() {
    const releases = await this.prisma.otaRelease.findMany({
      where: { deletedAt: null },
      include: {
        targetLocation: { select: { id: true, name: true } },
        _count: { select: { updates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const stats = await this.prisma.otaUpdate.groupBy({
      by: ['releaseId', 'status'],
      _count: { _all: true },
    });
    return releases.map((r) => {
      const byStatus: Record<string, number> = {};
      for (const s of stats) if (s.releaseId === r.id) byStatus[s.status] = s._count._all;
      return { ...r, stats: byStatus };
    });
  }

  async releaseDetail(id: string) {
    const release = await this.prisma.otaRelease.findFirst({
      where: { id, deletedAt: null },
      include: { targetLocation: true },
    });
    if (!release) throw new NotFoundException('Release not found');
    const updates = await this.prisma.otaUpdate.findMany({
      where: { releaseId: id },
      include: { device: { select: { id: true, name: true, serialNumber: true, appVersion: true, location: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    return { ...release, hasPackage: !!release.fileName, updates };
  }

  createRelease(dto: CreateReleaseDto, actor?: { id?: string; name?: string }) {
    return this.prisma.otaRelease.create({
      data: {
        version: dto.version.trim(),
        channel: dto.channel ?? 'STABLE',
        notes: dto.notes?.trim(),
        isMandatory: dto.isMandatory ?? false,
        rolloutPercent: dto.rolloutPercent ?? 100,
        targetLocationId: dto.targetLocationId || null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        autoRollback: dto.autoRollback ?? true,
        failureThreshold: dto.failureThreshold ?? 20,
        status: 'DRAFT',
        createdById: actor?.id ?? null,
        createdByName: actor?.name ?? null,
      },
    });
  }

  async updateRelease(id: string, dto: UpdateReleaseDto) {
    await this.ensureRelease(id);
    return this.prisma.otaRelease.update({
      where: { id },
      data: {
        notes: dto.notes?.trim(),
        isMandatory: dto.isMandatory,
        rolloutPercent: dto.rolloutPercent,
        targetLocationId: dto.targetLocationId === undefined ? undefined : (dto.targetLocationId || null),
        scheduledAt: dto.scheduledAt === undefined ? undefined : (dto.scheduledAt ? new Date(dto.scheduledAt) : null),
        autoRollback: dto.autoRollback,
        failureThreshold: dto.failureThreshold,
      },
    });
  }

  async uploadPackage(id: string, file: { buffer: Buffer; originalname: string }) {
    const release = await this.ensureRelease(id);
    const pkg = await this.storePackage(release.id, file);
    return this.prisma.otaRelease.update({ where: { id: release.id }, data: pkg });
  }

  private async storePackage(releaseId: string, file: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Không có tệp cài đặt được tải lên.');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(OTA_DIR, releaseId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeName);
    await fs.writeFile(filePath, file.buffer);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    return { fileName: safeName, filePath, fileSize: file.buffer.length, sha256 };
  }

  /**
   * One-shot deploy used by the CI/CD pipeline: create (or refresh) a release by
   * version, store the package, and publish it — all guarded by a shared token.
   */
  async deploy(
    file: { buffer: Buffer; originalname: string },
    body: Record<string, string>,
    token?: string,
  ) {
    const expected = process.env.OTA_DEPLOY_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException('OTA_DEPLOY_TOKEN chưa được cấu hình trên máy chủ.');
    }
    if (!token || token !== expected) throw new UnauthorizedException('Deploy token không hợp lệ.');
    const version = (body.version ?? '').trim();
    if (!version) throw new BadRequestException('Thiếu version.');
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu gói cài đặt (field "file").');

    const publish = String(body.publish ?? 'true') !== 'false';
    const isMandatory = String(body.isMandatory ?? '') === 'true';
    const rolloutPercent =
      body.rolloutPercent != null && body.rolloutPercent !== ''
        ? Math.max(0, Math.min(100, parseInt(body.rolloutPercent, 10) || 0))
        : undefined;
    const channel = body.channel === 'BETA' ? 'BETA' : 'STABLE';

    const existing = await this.prisma.otaRelease.findFirst({ where: { version, deletedAt: null } });
    const release =
      existing ??
      (await this.prisma.otaRelease.create({
        data: {
          version,
          channel,
          notes: body.notes ?? null,
          isMandatory,
          rolloutPercent: rolloutPercent ?? 100,
          targetLocationId: body.targetLocationId || null,
          status: 'DRAFT',
          createdByName: body.createdByName || 'CI/CD',
        },
      }));

    const pkg = await this.storePackage(release.id, file);
    const updated = await this.prisma.otaRelease.update({
      where: { id: release.id },
      data: {
        ...pkg,
        ...(rolloutPercent != null ? { rolloutPercent } : {}),
        ...(body.notes ? { notes: body.notes } : {}),
        ...(body.channel ? { channel } : {}),
        status: publish ? 'ROLLING' : 'DRAFT',
      },
    });

    this.realtime.emitToCms('ota:release_updated', { id: updated.id, status: updated.status, at: new Date().toISOString() });
    return {
      id: updated.id, version: updated.version, status: updated.status,
      sha256: updated.sha256, fileSize: updated.fileSize, fileName: updated.fileName,
      reused: !!existing,
    };
  }

  async setStatus(id: string, dto: SetReleaseStatusDto) {
    const release = await this.ensureRelease(id);
    if (dto.status === 'ROLLING' && !release.fileName) {
      throw new BadRequestException('Chưa có gói cài đặt — hãy tải lên trước khi phát hành.');
    }
    const updated = await this.prisma.otaRelease.update({ where: { id }, data: { status: dto.status as OtaReleaseStatus } });
    this.realtime.emitToCms('ota:release_updated', { id, status: updated.status, at: new Date().toISOString() });
    return updated;
  }

  async removeRelease(id: string) {
    await this.ensureRelease(id);
    await this.prisma.otaRelease.update({ where: { id }, data: { deletedAt: new Date(), status: 'ROLLED_BACK' } });
    return { ok: true };
  }

  private async ensureRelease(id: string) {
    const r = await this.prisma.otaRelease.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException('Release not found');
    return r;
  }

  /* ─────────────── Device version matrix (CMS) ─────────────── */
  async deviceMatrix(locationIds: string[] | null) {
    const devices = await this.prisma.kioskDevice.findMany({
      where: { deletedAt: null, ...(locationIds === null ? {} : { locationId: { in: locationIds } }) },
      select: {
        id: true, name: true, serialNumber: true, appVersion: true, lastHeartbeat: true,
        location: { select: { id: true, name: true } },
        otaUpdates: { orderBy: { updatedAt: 'desc' }, take: 1, include: { release: { select: { version: true } } } },
      },
      orderBy: { serialNumber: 'asc' },
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      serialNumber: d.serialNumber,
      appVersion: d.appVersion,
      lastHeartbeat: d.lastHeartbeat,
      location: d.location,
      latestUpdate: d.otaUpdates[0]
        ? { status: d.otaUpdates[0].status, toVersion: d.otaUpdates[0].release?.version, progress: d.otaUpdates[0].progress }
        : null,
    }));
  }

  /* ─────────────── Kiosk endpoints ─────────────── */

  async check(deviceIdParam: string, currentVersion?: string) {
    const device = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id: deviceIdParam }, { deviceId: deviceIdParam }, { serialNumber: deviceIdParam }] },
    });
    if (!device) return { updateAvailable: false as const };

    const version = currentVersion || device.appVersion || '0.0.0';
    const now = new Date();

    const inflight = await this.prisma.otaUpdate.findMany({
      where: { deviceId: device.id, status: { in: ['NOTIFIED', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING'] } },
      include: { release: true },
    });
    for (const u of inflight) {
      if (u.release && compareVersions(version, u.release.version) >= 0) {
        await this.prisma.otaUpdate.update({ where: { id: u.id }, data: { status: 'INSTALLED', progress: 100, completedAt: now } });
        await this.prisma.kioskDevice.update({ where: { id: device.id }, data: { appVersion: version } });
      }
    }

    const rolling = await this.prisma.otaRelease.findMany({
      where: {
        deletedAt: null,
        status: 'ROLLING',
        fileName: { not: null },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Target by location: a release with targetLocationId only applies to that location's devices.
    const applicable = rolling
      .filter((r) => !r.targetLocationId || r.targetLocationId === device.locationId)
      .filter((r) => compareVersions(r.version, version) > 0)
      .filter((r) => rolloutBucket(device.id, r.id) < r.rolloutPercent)
      .sort((a, b) => compareVersions(b.version, a.version))[0];

    if (!applicable) return { updateAvailable: false as const };

    await this.prisma.otaUpdate.upsert({
      where: { deviceId_releaseId: { deviceId: device.id, releaseId: applicable.id } },
      create: {
        deviceId: device.id, releaseId: applicable.id, status: 'NOTIFIED',
        fromVersion: version, toVersion: applicable.version, notifiedAt: now,
      },
      update: { notifiedAt: now },
    });

    return {
      updateAvailable: true as const,
      release: {
        id: applicable.id,
        version: applicable.version,
        notes: applicable.notes,
        mandatory: applicable.isMandatory,
        fileName: applicable.fileName,
        fileSize: applicable.fileSize,
        sha256: applicable.sha256,
        downloadUrl: `/ota/download/${applicable.id}`,
      },
    };
  }

  async report(dto: OtaReportDto) {
    const device = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id: dto.deviceId }, { deviceId: dto.deviceId }, { serialNumber: dto.deviceId }] },
    });
    if (!device) throw new NotFoundException('Device not found');
    const release = await this.prisma.otaRelease.findFirst({ where: { id: dto.releaseId } });
    if (!release) throw new NotFoundException('Release not found');

    const now = new Date();
    const status = dto.status as OtaUpdateStatus;
    const data: Prisma.OtaUpdateUncheckedUpdateInput = {
      status,
      progress: dto.progress ?? undefined,
      error: dto.error ?? null,
      toVersion: release.version,
    };
    if (status === 'DOWNLOADING') data.startedAt = now;
    if (status === 'INSTALLED') data.completedAt = now;
    if (status === 'FAILED') data.attempts = { increment: 1 };

    const update = await this.prisma.otaUpdate.upsert({
      where: { deviceId_releaseId: { deviceId: device.id, releaseId: release.id } },
      create: {
        deviceId: device.id, releaseId: release.id, status,
        fromVersion: device.appVersion, toVersion: release.version,
        progress: dto.progress ?? 0, error: dto.error ?? null,
        startedAt: status === 'DOWNLOADING' ? now : undefined,
        completedAt: status === 'INSTALLED' ? now : undefined,
        attempts: status === 'FAILED' ? 1 : 0,
      },
      update: data,
    });

    if (status === 'INSTALLED') {
      await this.prisma.kioskDevice.update({ where: { id: device.id }, data: { appVersion: release.version } });
    }

    this.realtime.emitToCms('ota:update_progress', {
      deviceId: device.id, releaseId: release.id, status, progress: update.progress, at: now.toISOString(),
    });

    if (status === 'FAILED') await this.maybeAutoStop(release.id);
    return { ok: true };
  }

  private async maybeAutoStop(releaseId: string) {
    const release = await this.prisma.otaRelease.findFirst({ where: { id: releaseId } });
    if (!release || !release.autoRollback || release.status !== 'ROLLING') return;
    const [attempted, failed] = await Promise.all([
      this.prisma.otaUpdate.count({ where: { releaseId, status: { in: ['DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'INSTALLED', 'FAILED'] } } }),
      this.prisma.otaUpdate.count({ where: { releaseId, status: 'FAILED' } }),
    ]);
    if (attempted < MIN_SAMPLE_FOR_AUTOSTOP) return;
    const failureRate = (failed / attempted) * 100;
    if (failureRate >= release.failureThreshold) {
      await this.prisma.otaRelease.update({ where: { id: releaseId }, data: { status: 'PAUSED' } });
      this.realtime.emitToCms('ota:auto_stopped', {
        releaseId, version: release.version, failed, attempted,
        failureRate: Math.round(failureRate), at: new Date().toISOString(),
      });
    }
  }

  async resolvePackage(releaseId: string) {
    const release = await this.prisma.otaRelease.findFirst({ where: { id: releaseId, deletedAt: null } });
    if (!release || !release.filePath || !release.fileName) throw new NotFoundException('Package not found');
    return { filePath: release.filePath, fileName: release.fileName, sha256: release.sha256 };
  }
}
