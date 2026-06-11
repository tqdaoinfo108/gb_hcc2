import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateProcedureDto, UpdateProcedureDto, CreateCategoryDto, UpdateCategoryDto } from './procedures.dto';

@Injectable()
export class ProceduresService {
  constructor(private prisma: PrismaService) {}

  async findAll(categoryId?: string, search?: string, includeInactive = false) {
    return this.prisma.procedure.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { code: { equals: search.toUpperCase() } },
          ],
        } : {}),
      },
      include: {
        category: true,
        _count: { select: { applications: true, requirements: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProcedureDto) {
    return this.prisma.procedure.create({
      data: {
        categoryId: dto.categoryId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        nameEn: dto.nameEn,
        description: dto.description,
        legalBasis: dto.legalBasis,
        processingAgency: dto.processingAgency,
        slaWorkDays: dto.slaWorkDays ?? 5,
        fee: dto.fee,
        feeNote: dto.feeNote,
        isOnline: dto.isOnline ?? true,
        isActive: dto.isActive ?? true,
      },
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateProcedureDto) {
    await this.findById(id);
    return this.prisma.procedure.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.legalBasis !== undefined && { legalBasis: dto.legalBasis }),
        ...(dto.processingAgency !== undefined && { processingAgency: dto.processingAgency }),
        ...(dto.slaWorkDays !== undefined && { slaWorkDays: dto.slaWorkDays }),
        ...(dto.fee !== undefined && { fee: dto.fee }),
        ...(dto.feeNote !== undefined && { feeNote: dto.feeNote }),
        ...(dto.isOnline !== undefined && { isOnline: dto.isOnline }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { category: true },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.procedure.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.procedureCategory.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        nameEn: dto.nameEn,
        icon: dto.icon,
        colorHex: dto.colorHex,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        parentId: dto.parentId,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.procedureCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.procedureCategory.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.colorHex !== undefined && { colorHex: dto.colorHex }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });
  }

  async removeCategory(id: string) {
    const cat = await this.prisma.procedureCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.prisma.procedureCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
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

  async getCategories(includeInactive = false) {
    return this.prisma.procedureCategory.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { procedures: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
