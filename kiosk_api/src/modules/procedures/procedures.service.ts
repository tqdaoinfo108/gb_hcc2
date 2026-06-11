import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProceduresService {
  constructor(private prisma: PrismaService) {}

  async findAll(categoryId?: string, search?: string) {
    return this.prisma.procedure.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { code: { equals: search.toUpperCase() } },
          ],
        } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const p = await this.prisma.procedure.findUnique({
      where: { id, deletedAt: null },
      include: { category: true, requirements: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, workflows: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!p) throw new NotFoundException('Procedure not found');
    return p;
  }

  async getCategories() {
    return this.prisma.procedureCategory.findMany({
      where: { deletedAt: null, isActive: true },
      include: { _count: { select: { procedures: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Categories with their procedures, plus an `online` flag indicating whether
   * the procedure has a published Selenium workflow (can be submitted at kiosk).
   * Powers the kiosk discovery accordion.
   */
  async getGroupedByCategory() {
    const [categories, templates] = await Promise.all([
      this.prisma.procedureCategory.findMany({
        where: { deletedAt: null, isActive: true },
        include: {
          procedures: {
            where: { deletedAt: null, isActive: true },
            orderBy: { name: 'asc' },
            select: {
              id: true, code: true, name: true, nameEn: true,
              slaWorkDays: true, fee: true, feeNote: true, processingAgency: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.workflowTemplate.findMany({
        where: { deletedAt: null, isActive: true, isPublished: true, procedureId: { not: null } },
        select: { procedureId: true },
      }),
    ]);

    const onlineIds = new Set(templates.map((t) => t.procedureId));

    return categories
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        nameEn: c.nameEn,
        icon: c.icon,
        colorHex: c.colorHex,
        procedures: c.procedures.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          nameEn: p.nameEn,
          slaWorkDays: p.slaWorkDays,
          fee: p.fee ? Number(p.fee) : 0,
          feeNote: p.feeNote,
          agency: p.processingAgency,
          online: onlineIds.has(p.id),
        })),
      }))
      .filter((c) => c.procedures.length > 0);
  }
}
