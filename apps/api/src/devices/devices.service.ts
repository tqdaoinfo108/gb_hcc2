import { Injectable } from "@nestjs/common";
import type { DeviceHeartbeatPayload } from "@smart-kiosk/shared-types";
import { PrismaService } from "../prisma.service";

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const devices = await this.prisma.device.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        statuses: {
          take: 1,
          orderBy: { lastHeartbeat: "desc" }
        }
      }
    });

    return devices.map((device) => ({
      ...device,
      latestStatus: device.statuses[0] ?? null,
      statuses: undefined
    }));
  }

  async get(deviceId: string) {
    return this.prisma.device.findUnique({
      where: { deviceId },
      include: {
        statuses: { take: 20, orderBy: { lastHeartbeat: "desc" } },
        commands: { take: 20, orderBy: { issuedAt: "desc" } },
        deployments: { take: 20, orderBy: { startedAt: "desc" }, include: { otaPackage: true } }
      }
    });
  }

  async dashboard() {
    const [total, locked, latestStatus, errors] = await Promise.all([
      this.prisma.device.count(),
      this.prisma.device.count({ where: { isLocked: true } }),
      this.prisma.deviceStatus.findMany({
        distinct: ["deviceId"],
        orderBy: [{ deviceId: "asc" }, { lastHeartbeat: "desc" }]
      }),
      this.prisma.automationSession.count({ where: { status: "FAILED" } })
    ]);

    const online = latestStatus.filter((status) => status.online).length;
    return {
      total,
      online,
      offline: Math.max(total - online, 0),
      locked,
      errors
    };
  }

  async recordHeartbeat(payload: DeviceHeartbeatPayload) {
    const device = await this.prisma.device.upsert({
      where: { deviceId: payload.deviceId },
      update: {
        location: payload.location,
        version: payload.version,
        ip: payload.ip,
        status: payload.status,
        lastSeenAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        deviceId: payload.deviceId,
        location: payload.location,
        version: payload.version,
        ip: payload.ip,
        status: payload.status,
        lastSeenAt: new Date()
      }
    });

    const status = await this.prisma.deviceStatus.create({
      data: {
        deviceId: device.id,
        online: payload.status === "online",
        cpuPercent: payload.cpuPercent,
        ramPercent: payload.ramPercent,
        diskPercent: payload.diskPercent,
        temperatureC: payload.temperatureC,
        network: payload.network,
        currentUrl: payload.currentUrl,
        currentStep: payload.currentStep
      }
    });

    return { device, status };
  }

  async markOffline(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      return null;
    }
    await this.prisma.device.update({
      where: { deviceId },
      data: { status: "offline", updatedAt: new Date() }
    });
    return this.prisma.deviceStatus.create({
      data: {
        deviceId: device.id,
        online: false
      }
    });
  }
}
