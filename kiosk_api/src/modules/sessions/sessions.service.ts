import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { KioskDeviceStatus, SessionStatus } from '@prisma/client';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async create(deviceId: string, citizenId?: string, language = 'vi') {
    const deviceRef = deviceId.trim();
    let device = await this.prisma.kioskDevice.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: deviceRef }, { deviceId: deviceRef }, { serialNumber: deviceRef }],
      },
      select: { id: true, isEnabled: true, status: true, maintenanceMessage: true },
    });

    if (!device) {
      const location = await this.prisma.kioskLocation.upsert({
        where: { code: 'CUA_NAM_HOAN_KIEM' },
        update: {
          name: 'UBND Phường Cửa Nam',
          address: 'Phường Cửa Nam',
          district: 'Quận Hoàn Kiếm',
          province: 'Hà Nội',
          isActive: true,
          deletedAt: null,
        },
        create: {
          code: 'CUA_NAM_HOAN_KIEM',
          name: 'UBND Phường Cửa Nam',
          address: 'Phường Cửa Nam',
          district: 'Quận Hoàn Kiếm',
          province: 'Hà Nội',
        },
        select: { id: true },
      });
      device = await this.prisma.kioskDevice.upsert({
        where: { serialNumber: deviceRef },
        update: {
          status: KioskDeviceStatus.ONLINE,
          lastHeartbeat: new Date(),
          deletedAt: null,
        },
        create: {
          deviceId: deviceRef,
          locationId: location.id,
          serialNumber: deviceRef,
          name: `Kiosk ${deviceRef}`,
          placement: 'Chưa cấu hình',
          model: 'Smart Kiosk',
          status: KioskDeviceStatus.ONLINE,
          lastHeartbeat: new Date(),
          installedAt: new Date(),
          metadata: { autoRegistered: true },
        },
        select: { id: true, isEnabled: true, status: true, maintenanceMessage: true },
      });
    }

    if (!device.isEnabled || device.status === KioskDeviceStatus.MAINTENANCE) {
      throw new HttpException(
        device.maintenanceMessage || 'Kiosk đang tạm ngưng để bảo trì',
        HttpStatus.LOCKED,
      );
    }

    return this.prisma.kioskSession.create({
      data: {
        deviceId: device.id,
        citizenId,
        language: language.trim().toLowerCase() || 'vi',
        currentScreen: 'home',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.kioskSession.findUnique({
      where: { id },
      include: { device: true, citizen: true },
    });
  }

  async updateScreen(id: string, screen: string) {
    return this.prisma.kioskSession.update({
      where: { id },
      data: { currentScreen: screen, lastActivityAt: new Date() },
    });
  }

  async complete(id: string) {
    return this.prisma.kioskSession.update({
      where: { id },
      data: { status: SessionStatus.COMPLETED, endTime: new Date() },
    });
  }

  async expire(id: string) {
    return this.prisma.kioskSession.update({
      where: { id },
      data: {
        status: SessionStatus.EXPIRED,
        endTime: new Date(),
        securityCleaned: true,
        cleanedAt: new Date(),
      },
    });
  }

  async logEvent(sessionId: string, eventType: string, screen?: string, eventData?: object) {
    return this.prisma.kioskSessionEvent.create({
      data: { sessionId, eventType, screen, eventData },
    });
  }

  async logTimeout(sessionId: string, timeoutType: string, secondsElapsed: number, actionTaken?: string) {
    return this.prisma.kioskSessionTimeoutLog.create({
      data: { sessionId, timeoutType, secondsElapsed, actionTaken },
    });
  }

  async getActiveSessions(deviceId?: string) {
    return this.prisma.kioskSession.findMany({
      where: { status: SessionStatus.ACTIVE, ...(deviceId ? { deviceId } : {}) },
      include: { device: true },
      orderBy: { startTime: 'desc' },
    });
  }
}
