import { Injectable } from "@nestjs/common";
import { OtaComponent, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const componentMap: Record<string, OtaComponent> = {
  kiosk_app: OtaComponent.KIOSK_APP,
  automation_engine: OtaComponent.AUTOMATION_ENGINE,
  workflow: OtaComponent.WORKFLOW,
  browser_engine: OtaComponent.BROWSER_ENGINE,
  config: OtaComponent.CONFIG
};

@Injectable()
export class OtaService {
  constructor(private readonly prisma: PrismaService) {}

  packages() {
    return this.prisma.otaPackage.findMany({
      orderBy: { createdAt: "desc" },
      include: { deployments: { include: { device: true } } }
    });
  }

  createPackage(input: {
    component: string;
    version: string;
    packageUrl: string;
    sha256: string;
    signature: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.otaPackage.create({
      data: {
        component: componentMap[input.component],
        version: input.version,
        packageUrl: input.packageUrl,
        sha256: input.sha256,
        signature: input.signature,
        status: "SIGNED",
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  async deploy(input: { packageId: string; deviceIds: string[] }) {
    const devices = await this.prisma.device.findMany({
      where: { deviceId: { in: input.deviceIds } }
    });

    await this.prisma.otaDeployment.createMany({
      data: devices.map((device) => ({
        packageId: input.packageId,
        deviceId: device.id,
        status: "PENDING"
      })),
      skipDuplicates: true
    });

    return this.prisma.otaDeployment.findMany({
      where: {
        packageId: input.packageId,
        deviceId: { in: devices.map((device) => device.id) }
      },
      include: { device: true, otaPackage: true }
    });
  }

  checkUpdate(deviceId: string) {
    return this.prisma.otaDeployment.findMany({
      where: {
        device: { deviceId },
        status: { in: ["PENDING", "FAILED", "ROLLED_BACK"] }
      },
      orderBy: { startedAt: "desc" },
      include: { otaPackage: true }
    });
  }
}
