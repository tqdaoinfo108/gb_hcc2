import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(input: { deviceId: string; command: string; payload?: Record<string, unknown>; adminId?: string }) {
    return this.prisma.kioskAction.create({
      data: {
        deviceId: input.deviceId,
        adminId: input.adminId,
        action: input.command,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
