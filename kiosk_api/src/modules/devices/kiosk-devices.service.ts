import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KioskDeviceStatus, Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { CreateLocationDto, HeartbeatDto, UpdateKioskConfigDto, UpdateLocationDto } from './kiosk-devices.dto';

const DEFAULT_LOCATION = {
  code: 'CUA_NAM_HOAN_KIEM',
  name: 'UBND Phường Cửa Nam',
  address: 'Phường Cửa Nam',
  district: 'Quận Hoàn Kiếm',
  province: 'Hà Nội',
};

@Injectable()
export class KioskDevicesService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async findAll() {
    return this.prisma.kioskDevice.findMany({
      where: { deletedAt: null },
      include: {
        location: true,
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ isEnabled: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findById(id: string) {
    const device = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id }, { deviceId: id }, { serialNumber: id }] },
      include: {
        location: true,
        components: { where: { deletedAt: null } },
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
        actions: { orderBy: { performedAt: 'desc' }, take: 30 },
        sessions: { orderBy: { startTime: 'desc' }, take: 20 },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async getRuntimeConfig(deviceId: string) {
    const device = await this.findById(deviceId);
    return this.toRuntimeConfig(device);
  }

  async heartbeat(deviceId: string, health: HeartbeatDto, requestIp?: string) {
    const device = await this.resolveOrRegister(deviceId, health);
    const ipAddress = this.normalizeIp(requestIp);
    const status = device.isEnabled ? KioskDeviceStatus.ONLINE : KioskDeviceStatus.MAINTENANCE;
    const metadata = {
      reportedName: health.name,
      hostname: health.hostname,
      os: health.os,
      browser: health.browser,
      appVersion: health.appVersion,
      screenResolution: health.screenResolution,
      userAgent: health.userAgent,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.kioskDevice.update({
        where: { id: device.id },
        data: {
          status,
          lastHeartbeat: new Date(),
          ipAddress: ipAddress ?? device.ipAddress,
          model: health.model?.trim() || device.model,
          firmwareVersion: health.firmwareVersion?.trim() || device.firmwareVersion,
          macAddress: health.macAddress?.trim() || device.macAddress,
          appVersion: health.appVersion?.trim() || device.appVersion,
          metadata: metadata as Prisma.InputJsonValue,
        },
        include: { location: true },
      });
      await tx.kioskHealthLog.create({
        data: {
          deviceId: device.id,
          status,
          cpuUsage: health.cpuUsage,
          memoryUsage: health.memoryUsage,
          diskUsage: health.diskUsage,
          temperatureC: health.temperatureC,
          networkLatency: health.networkLatency,
          ipAddress,
          hostname: health.hostname,
          os: health.os,
          browser: health.browser,
          appVersion: health.appVersion,
          screenResolution: health.screenResolution,
          userAgent: health.userAgent,
          currentScreen: health.currentScreen,
          sessionId: health.sessionId,
          components: health.components as Prisma.InputJsonValue | undefined,
        },
      });
      return current;
    });

    // Push a live health snapshot to the CMS so the remote-debug console and
    // dashboards update without polling.
    this.realtime.emitToCms('device:health', {
      id: updated.id,
      deviceId: updated.deviceId,
      serialNumber: updated.serialNumber,
      locationId: updated.locationId,
      status,
      online: status === KioskDeviceStatus.ONLINE,
      lastHeartbeat: new Date().toISOString(),
      appVersion: health.appVersion ?? null,
      ipAddress: ipAddress ?? updated.ipAddress ?? null,
      metrics: {
        cpu: health.cpuUsage ?? null,
        memory: health.memoryUsage ?? null,
        disk: health.diskUsage ?? null,
        temperature: health.temperatureC ?? null,
        latency: health.networkLatency ?? null,
        currentScreen: health.currentScreen ?? null,
      },
      components: health.components ?? null,
    });

    return this.toRuntimeConfig(updated);
  }

  async updateConfig(id: string, data: UpdateKioskConfigDto) {
    const device = await this.findById(id);
    const isEnabled = data.isEnabled ?? device.isEnabled;
    const status = isEnabled
      ? device.status === KioskDeviceStatus.MAINTENANCE
        ? KioskDeviceStatus.OFFLINE
        : device.status
      : KioskDeviceStatus.MAINTENANCE;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.kioskDevice.update({
        where: { id: device.id },
        data: {
          locationId: data.locationId,
          name: data.name?.trim(),
          placement: data.placement?.trim(),
          isEnabled,
          maintenanceMessage: data.maintenanceMessage?.trim() || null,
          tickerText: data.tickerText?.trim() || null,
          model: data.model?.trim(),
          firmwareVersion: data.firmwareVersion?.trim(),
          status,
        },
        include: { location: true },
      });

      if (!isEnabled) {
        await tx.kioskSession.updateMany({
          where: { deviceId: device.id, status: SessionStatus.ACTIVE },
          data: {
            status: SessionStatus.TERMINATED,
            endTime: new Date(),
            securityCleaned: true,
            cleanedAt: new Date(),
          },
        });
      }
      await tx.kioskAction.create({
        data: {
          deviceId: device.id,
          action: isEnabled ? 'ENABLE_KIOSK' : 'DISABLE_FOR_MAINTENANCE',
          payload: data as Prisma.InputJsonValue,
          result: 'SUCCESS',
        },
      });
      return updated;
    });

    const runtimeConfig = this.toRuntimeConfig(updated);
    const delivered = this.realtime.sendToDevice(
      device.deviceId,
      'device:config_updated',
      runtimeConfig,
    );
    this.realtime.emitToCms('device:config_updated', {
      ...runtimeConfig,
      delivered,
      updatedAt: new Date().toISOString(),
    });
    return { ...runtimeConfig, realtimeDelivered: delivered };
  }

  async getLocations() {
    return this.prisma.kioskLocation.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { devices: true },
        },
      },
      orderBy: [{ province: 'asc' }, { district: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertLocation(data: CreateLocationDto) {
    return this.prisma.kioskLocation.upsert({
      where: { code: data.code.trim().toUpperCase() },
      update: {
        name: data.name.trim(),
        address: data.address.trim(),
        district: data.district?.trim(),
        province: data.province?.trim(),
        isActive: true,
        deletedAt: null,
      },
      create: {
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        address: data.address.trim(),
        district: data.district?.trim(),
        province: data.province?.trim(),
      },
    });
  }

  async updateLocation(id: string, data: UpdateLocationDto) {
    const location = await this.prisma.kioskLocation.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
    });
    if (!location) throw new NotFoundException('Kiosk location not found');
    if (data.isActive === false && location._count.devices > 0) {
      throw new BadRequestException('Không thể ngừng địa điểm đang có thiết bị kiosk sử dụng');
    }

    return this.prisma.kioskLocation.update({
      where: { id },
      data: {
        code: data.code?.trim().toUpperCase(),
        name: data.name?.trim(),
        address: data.address?.trim(),
        district: data.district?.trim() || null,
        province: data.province?.trim() || null,
        isActive: data.isActive,
      },
      include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
    });
  }

  private async resolveOrRegister(deviceId: string, health: HeartbeatDto) {
    const fixedId = deviceId.trim();
    const existing = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id: fixedId }, { deviceId: fixedId }, { serialNumber: fixedId }] },
      include: { location: true },
    });
    if (existing) {
      if (existing.location.code === 'AUTO_REGISTERED') {
        const location = await this.prisma.kioskLocation.upsert({
          where: { code: DEFAULT_LOCATION.code },
          update: { ...DEFAULT_LOCATION, isActive: true, deletedAt: null },
          create: DEFAULT_LOCATION,
        });
        return this.prisma.kioskDevice.update({
          where: { id: existing.id },
          data: {
            locationId: location.id,
            placement: existing.placement || 'Chưa cấu hình',
          },
        });
      }
      return existing;
    }

    const location = await this.prisma.kioskLocation.upsert({
      where: { code: DEFAULT_LOCATION.code },
      update: { ...DEFAULT_LOCATION, isActive: true, deletedAt: null },
      create: DEFAULT_LOCATION,
    });
    return this.prisma.kioskDevice.create({
      data: {
        deviceId: fixedId,
        serialNumber: health.serialNumber?.trim() || fixedId,
        name: health.name?.trim() || `Kiosk ${fixedId}`,
        placement: 'Chưa cấu hình',
        locationId: location.id,
        model: health.model?.trim() || 'Smart Government Kiosk',
        firmwareVersion: health.firmwareVersion?.trim(),
        macAddress: health.macAddress?.trim(),
        status: KioskDeviceStatus.ONLINE,
        lastHeartbeat: new Date(),
        installedAt: new Date(),
        metadata: { autoRegistered: true },
      },
    });
  }

  private toRuntimeConfig(device: any) {
    return {
      id: device.id,
      deviceId: device.deviceId,
      serialNumber: device.serialNumber,
      locationId: device.locationId,
      name: device.name,
      placement: device.placement,
      isEnabled: device.isEnabled,
      status: device.status,
      maintenanceMessage: device.maintenanceMessage,
      tickerText: device.tickerText,
      model: device.model,
      firmwareVersion: device.firmwareVersion,
      lastHeartbeat: device.lastHeartbeat,
      location: device.location,
    };
  }

  private normalizeIp(ip?: string) {
    if (!ip) return undefined;
    return ip.replace(/^::ffff:/, '');
  }
}
