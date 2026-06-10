import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    adminId: string;
    action: string;
    module: string;
    targetId?: string;
    targetType?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        module: input.module,
        targetId: input.targetId,
        targetType: input.targetType,
        before: input.before as Prisma.InputJsonValue | undefined,
        after: input.after as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress,
      },
    });
  }
}
