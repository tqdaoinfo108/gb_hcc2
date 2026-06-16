import { Injectable } from '@nestjs/common';
import { AdminAuditLog, Prisma } from '@prisma/client';
import { PaginatedResult } from '../common/base.dto';
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
    const data = {
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
    };
    try {
      return await this.prisma.adminAuditLog.create({ data });
    } catch {
      // adminId may reference a non-existent user (stale token) → keep the log
      // but drop the FK link rather than losing the audit entry.
      return this.prisma.adminAuditLog.create({ data: { ...data, adminId: null } });
    }
  }

  /** Paginated audit log query, scoped by location. */
  async list(params: {
    locationId?: string | null;
    module?: string;
    action?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminAuditLog>> {
    const { locationId, module, action } = params;
    const page = clampInt(params.page, 1, 1, 10_000);
    const limit = clampInt(params.limit, 50, 1, 100);
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(locationId === null || locationId === undefined ? {} : { locationId }),
      ...(module ? { module } : {}),
      ...(action ? { action } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
}
