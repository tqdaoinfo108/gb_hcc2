import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CopyRequestStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CopyDocCategoryService } from './copy-doc-category.service';
import { InitiateCopyDocDto, ConfirmQuantityDto, ConfirmFeeDto, AdjustCornersDto } from './copy-doc.dto';

function genCode(prefix: string, digits = 5) {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, '0');
  return `${prefix}-${year}-${seq}`;
}

@Injectable()
export class CopyDocRequestService {
  constructor(
    private prisma: PrismaService,
    private categories: CopyDocCategoryService,
  ) {}

  async findAll(filter?: { sessionId?: string; status?: CopyRequestStatus; limit?: number }) {
    return this.prisma.copyDocRequest.findMany({
      where: {
        deletedAt: null,
        sessionId: filter?.sessionId,
        status: filter?.status,
      },
      include: {
        category: { select: { id: true, code: true, name: true, icon: true } },
        _count: { select: { scanSessions: true, aiJobs: true, printJobs: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
    });
  }

  async findById(id: string) {
    const req = await this.prisma.copyDocRequest.findFirst({
      where: { deletedAt: null, OR: [{ id }, { requestCode: id }] },
      include: {
        category: true,
        scanSessions: { orderBy: { createdAt: 'desc' } },
        aiJobs: { orderBy: { createdAt: 'desc' } },
        printJobs: { orderBy: { createdAt: 'desc' } },
        feeTransaction: true,
      },
    });
    if (!req) throw new NotFoundException('Copy document request not found');
    return req;
  }

  async initiate(sessionId: string, kioskDeviceId?: string): Promise<any>;
  async initiate(dto: InitiateCopyDocDto): Promise<any>;
  async initiate(dtoOrSessionId: InitiateCopyDocDto | string, kioskDeviceId?: string) {
    if (typeof dtoOrSessionId === 'string') {
      const requestCode = genCode('SY');
      return this.prisma.copyDocRequest.create({
        data: {
          sessionId: dtoOrSessionId,
          kioskDeviceId,
          requestCode,
          categoryId: null,  // Set after OCR
          status: CopyRequestStatus.INITIATED,
        },
      });
    }
    const dto = dtoOrSessionId;
    if (dto.categoryId) {
      await this.categories.findById(dto.categoryId); // validate category exists
    }
    const requestCode = genCode('SY');
    return this.prisma.copyDocRequest.create({
      data: {
        categoryId: dto.categoryId ?? null,
        sessionId: dto.sessionId,
        citizenId: dto.citizenId,
        kioskDeviceId: dto.kioskDeviceId,
        requestCode,
        quantity: dto.quantity ?? 1,
        status: CopyRequestStatus.INITIATED,
      },
      include: { category: true },
    });
  }

  async applyAiResult(
    requestId: string,
    result: {
      categoryId: string;
      detectedTypeLabel: string;
      detectedTypeConfidence: number;
      ocrText?: string;
      ocrOrientation?: number;
    },
  ) {
    return this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: {
        categoryId: result.categoryId,
        detectedCategoryId: result.categoryId,
        detectedTypeLabel: result.detectedTypeLabel,
        detectedTypeConfidence: result.detectedTypeConfidence,
        ...(result.ocrText !== undefined ? { ocrText: result.ocrText } : {}),
        ...(result.ocrOrientation !== undefined ? { ocrOrientation: result.ocrOrientation } : {}),
        status: CopyRequestStatus.PREVIEW_READY,
      },
      include: { category: true },
    });
  }

  async updateStatus(id: string, status: CopyRequestStatus) {
    const req = await this.findById(id);
    const now = new Date();
    return this.prisma.copyDocRequest.update({
      where: { id: req.id },
      data: {
        status,
        completedAt: ([CopyRequestStatus.COMPLETED, CopyRequestStatus.FAILED, CopyRequestStatus.CANCELLED] as string[]).includes(status)
          ? now
          : undefined,
      },
    });
  }

  async confirmQuantity(id: string, dto: ConfirmQuantityDto) {
    const req = await this.findById(id);
    if (!req.categoryId) {
      throw new BadRequestException('Category not yet set. Run OCR/AI detection first.');
    }
    const { baseFee, processingFee, totalFee } = await this.categories.resolvePrice(
      req.categoryId,
      dto.quantity,
    );
    return this.prisma.copyDocRequest.update({
      where: { id: req.id },
      data: {
        quantity: dto.quantity,
        baseFee,
        processingFee,
        totalFee,
        status: CopyRequestStatus.FEE_PENDING,
      },
    });
  }

  async adjustCorners(id: string, dto: AdjustCornersDto) {
    const req = await this.findById(id);
    if (dto.corners.length !== 4) {
      throw new BadRequestException('Exactly 4 corners required');
    }
    // Store corners in the most recent AI job
    const aiJob = await this.prisma.docAIProcessingJob.findFirst({
      where: { requestId: req.id },
      orderBy: { createdAt: 'desc' },
    });
    if (aiJob) {
      await this.prisma.docAIProcessingJob.update({
        where: { id: aiJob.id },
        data: { boundaryPoints: dto.corners as Prisma.InputJsonValue },
      });
    }
    return this.prisma.copyDocRequest.update({
      where: { id: req.id },
      data: { status: CopyRequestStatus.ADJUSTED },
    });
  }

  async confirmFee(id: string, dto: ConfirmFeeDto) {
    const req = await this.findById(id);
    const receiptCode = genCode('RC', 6);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.copyDocRequest.update({
        where: { id: req.id },
        data: {
          status: CopyRequestStatus.FEE_CONFIRMED,
          feeConfirmedAt: new Date(),
          paymentRef: dto.paymentRef,
          receiptCode,
        },
      });
      await tx.feeTransaction.create({
        data: {
          copyRequestId: req.id,
          citizenId: req.citizenId ?? undefined,
          amount: req.totalFee,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          status: dto.paymentMethod === 'CASH' ? 'PENDING' : 'CONFIRMED',
          receiptNumber: receiptCode,
        },
      });
      return updated;
    });
  }

  async cancel(id: string) {
    return this.updateStatus(id, CopyRequestStatus.CANCELLED);
  }
}
