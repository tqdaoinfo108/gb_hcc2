import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    adminId?: string | null;
    actorName?: string | null;
    locationId?: string | null;
    action: string;
    module: string;
    method?: string;
    path?: string;
    statusCode?: number;
    targetId?: string;
    targetType?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId ?? null,
        actorName: input.actorName ?? null,
        locationId: input.locationId ?? null,
        action: input.action,
        module: input.module,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        targetId: input.targetId,
        targetType: input.targetType,
        before: input.before as Prisma.InputJsonValue | undefined,
        after: input.after as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  /** Paginated audit log query, scoped by location. */
  async list(params: { locationId?: string | null; module?: string; action?: string; limit?: number }) {
    const { locationId, module, action, limit = 200 } = params;
    return this.prisma.adminAuditLog.findMany({
      where: {
        ...(locationId === null || locationId === undefined ? {} : { locationId }),
        ...(module ? { module } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
