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
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
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
}
