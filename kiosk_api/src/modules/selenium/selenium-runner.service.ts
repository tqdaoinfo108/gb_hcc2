import { Injectable, NotFoundException } from '@nestjs/common';
import { RunnerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RegisterRunnerDto, RunnerHeartbeatDto } from './selenium.dto';

const RUNNER_OFFLINE_THRESHOLD_MS = 45_000; // 45 s

@Injectable()
export class SeleniumRunnerService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.seleniumRunner.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { sessions: true, jobs: true } } },
      orderBy: [{ status: 'asc' }, { runnerId: 'asc' }],
    });
  }

  async findById(id: string) {
    const runner = await this.prisma.seleniumRunner.findFirst({
      where: { deletedAt: null, OR: [{ id }, { runnerId: id }] },
      include: {
        jobs: { where: { status: { in: ['RUNNING', 'QUEUED'] } }, take: 20 },
        _count: { select: { sessions: true } },
      },
    });
    if (!runner) throw new NotFoundException('Selenium runner not found');
    return runner;
  }

  async register(dto: RegisterRunnerDto) {
    const runnerId = dto.runnerId.trim();

    // A fresh runner process has no in-flight work. Reconcile DB state: any
    // jobs left RUNNING/QUEUED by a previous (now-dead) instance are orphans —
    // fail them so kiosks stop waiting on frames that will never arrive, and
    // reset the live session counter.
    const existing = await this.prisma.seleniumRunner.findUnique({ where: { runnerId } });
    if (existing) {
      await this.prisma.seleniumJob.updateMany({
        where: { runnerId: existing.id, status: { in: ['RUNNING', 'QUEUED', 'PAUSED'] } },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failReason: 'Runner restarted — phiên trước bị gián đoạn.',
        },
      });
    }

    return this.prisma.seleniumRunner.upsert({
      where: { runnerId },
      update: {
        name: dto.name.trim(),
        host: dto.host.trim(),
        port: dto.port ?? 4444,
        capacity: dto.capacity ?? 5,
        browserType: dto.browserType,
        version: dto.version?.trim(),
        status: RunnerStatus.ONLINE,
        activeSessions: 0,
        lastHeartbeatAt: new Date(),
        deletedAt: null,
        metadata: dto.metadata as any,
      },
      create: {
        runnerId: dto.runnerId.trim(),
        name: dto.name.trim(),
        host: dto.host.trim(),
        port: dto.port ?? 4444,
        capacity: dto.capacity ?? 5,
        browserType: dto.browserType ?? 'CHROMIUM',
        version: dto.version?.trim(),
        status: RunnerStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        metadata: dto.metadata as any,
      },
    });
  }

  async heartbeat(runnerId: string, dto: RunnerHeartbeatDto) {
    const runner = await this.findById(runnerId);
    const activeSessions = dto.activeSessions ?? runner.activeSessions;
    const status = activeSessions >= runner.capacity
      ? RunnerStatus.BUSY
      : RunnerStatus.ONLINE;

    return this.prisma.seleniumRunner.update({
      where: { id: runner.id },
      data: {
        status,
        activeSessions,
        lastHeartbeatAt: new Date(),
        metadata: dto.metadata ? dto.metadata as any : runner.metadata,
      },
    });
  }

  async markOfflineStaleRunners() {
    const threshold = new Date(Date.now() - RUNNER_OFFLINE_THRESHOLD_MS);
    const updated = await this.prisma.seleniumRunner.updateMany({
      where: {
        deletedAt: null,
        status: { in: [RunnerStatus.ONLINE, RunnerStatus.BUSY] },
        lastHeartbeatAt: { lt: threshold },
      },
      data: { status: RunnerStatus.OFFLINE },
    });
    return updated.count;
  }

  /** Find the best available runner for a new job */
  async pickRunner() {
    return this.prisma.seleniumRunner.findFirst({
      where: {
        deletedAt: null,
        status: { in: [RunnerStatus.ONLINE, RunnerStatus.BUSY] },
      },
      orderBy: [{ activeSessions: 'asc' }, { lastHeartbeatAt: 'desc' }],
    });
  }

  async drain(runnerId: string) {
    const runner = await this.findById(runnerId);
    return this.prisma.seleniumRunner.update({
      where: { id: runner.id },
      data: { status: RunnerStatus.DRAINING },
    });
  }

  async remove(runnerId: string) {
    const runner = await this.findById(runnerId);
    await this.prisma.seleniumRunner.update({
      where: { id: runner.id },
      data: { deletedAt: new Date(), status: RunnerStatus.OFFLINE },
    });
    return { deleted: true };
  }
}
