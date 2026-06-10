import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreateCopyDocCategoryDto, UpdateCopyDocCategoryDto, CreateFeeRuleDto } from './copy-doc.dto';

@Injectable()
export class CopyDocCategoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.copyDocCategory.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      include: {
        feeRules: { where: { isActive: true }, orderBy: { minQuantity: 'asc' } },
        _count: { select: { requests: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const cat = await this.prisma.copyDocCategory.findFirst({
      where: { deletedAt: null, OR: [{ id }, { code: id }] },
      include: {
        feeRules: { orderBy: { minQuantity: 'asc' } },
        _count: { select: { requests: true } },
      },
    });
    if (!cat) throw new NotFoundException('Document category not found');
    return cat;
  }

  async create(dto: CreateCopyDocCategoryDto) {
    const exists = await this.prisma.copyDocCategory.findFirst({
      where: { code: dto.code.trim().toUpperCase(), deletedAt: null },
    });
    if (exists) throw new ConflictException(`Category code "${dto.code}" already exists`);
    return this.prisma.copyDocCategory.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        nameEn: dto.nameEn?.trim(),
        description: dto.description?.trim(),
        icon: dto.icon?.trim(),
        colorHex: dto.colorHex?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        pricePerCopy: dto.pricePerCopy,
        processingFeeRate: dto.processingFeeRate ?? 0.1,
        maxCopiesPerRequest: dto.maxCopiesPerRequest ?? 10,
        legalBasis: dto.legalBasis?.trim(),
        validityDays: dto.validityDays ?? 0,
        requiresStamp: dto.requiresStamp ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCopyDocCategoryDto) {
    const cat = await this.findById(id);
    return this.prisma.copyDocCategory.update({
      where: { id: cat.id },
      data: {
        name: dto.name?.trim(),
        nameEn: dto.nameEn?.trim(),
        description: dto.description?.trim(),
        icon: dto.icon?.trim(),
        colorHex: dto.colorHex?.trim(),
        sortOrder: dto.sortOrder,
        pricePerCopy: dto.pricePerCopy as any,
        processingFeeRate: dto.processingFeeRate as any,
        maxCopiesPerRequest: dto.maxCopiesPerRequest,
        legalBasis: dto.legalBasis?.trim(),
        validityDays: dto.validityDays,
        requiresStamp: dto.requiresStamp,
        isActive: dto.isActive,
      },
      include: { feeRules: { orderBy: { minQuantity: 'asc' } } },
    });
  }

  async remove(id: string) {
    const cat = await this.findById(id);
    await this.prisma.copyDocCategory.update({
      where: { id: cat.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { deleted: true };
  }

  // ─── Fee Rules ───────────────────────────────────────────────────────────────

  async addFeeRule(categoryId: string, dto: CreateFeeRuleDto) {
    const cat = await this.findById(categoryId);
    return this.prisma.copyDocFeeRule.create({
      data: {
        categoryId: cat.id,
        ruleName: dto.ruleName.trim(),
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity ?? null,
        pricePerCopy: dto.pricePerCopy,
        feeType: (dto.feeType as any) ?? 'FIXED',
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
  }

  async removeFeeRule(ruleId: string) {
    const rule = await this.prisma.copyDocFeeRule.findFirst({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Fee rule not found');
    await this.prisma.copyDocFeeRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });
    return { deleted: true };
  }

  /** Resolve the effective price for a category at a given quantity */
  async resolvePrice(categoryId: string, quantity: number) {
    const cat = await this.findById(categoryId);

    // Find applicable fee rule (sorted by most specific first)
    const now = new Date();
    const rules = await this.prisma.copyDocFeeRule.findMany({
      where: {
        categoryId: cat.id,
        isActive: true,
        minQuantity: { lte: quantity },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: [{ minQuantity: 'desc' }],
    });

    const matchingRule = rules.find(r => r.maxQuantity === null || r.maxQuantity >= quantity);
    const pricePerCopy = matchingRule
      ? Number(matchingRule.pricePerCopy)
      : Number(cat.pricePerCopy);

    const baseFee = pricePerCopy * quantity;
    const processingFee = Math.round(baseFee * Number(cat.processingFeeRate));
    const totalFee = baseFee + processingFee;

    return { pricePerCopy, baseFee, processingFee, totalFee, feeType: matchingRule?.feeType ?? 'FIXED' };
  }
}
