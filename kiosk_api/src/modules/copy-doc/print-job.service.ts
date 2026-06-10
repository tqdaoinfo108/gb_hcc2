import { Injectable, NotFoundException } from '@nestjs/common';
import { PrintStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreatePrintJobDto, UpdatePrintJobDto } from './copy-doc.dto';

@Injectable()
export class PrintJobService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter?: { status?: PrintStatus; kioskDeviceId?: string; limit?: number }) {
    return this.prisma.printJob.findMany({
      where: {
        status: filter?.status,
        kioskDeviceId: filter?.kioskDeviceId,
      },
      include: {
        copyRequest: { select: { id: true, requestCode: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
    });
  }

  async findById(id: string) {
    const job = await this.prisma.printJob.findFirst({
      where: { id },
      include: { copyRequest: true },
    });
    if (!job) throw new NotFoundException('Print job not found');
    return job;
  }

  async create(dto: CreatePrintJobDto) {
    return this.prisma.printJob.create({
      data: {
        copyRequestId: dto.copyRequestId,
        kioskDeviceId: dto.kioskDeviceId,
        sessionId: dto.sessionId,
        jobType: (dto.jobType as any) ?? 'DOCUMENT_COPY',
        filePath: dto.filePath,
        copies: dto.copies ?? 1,
        printerName: dto.printerName,
        status: PrintStatus.QUEUED,
      },
    });
  }

  async update(id: string, dto: UpdatePrintJobDto) {
    const job = await this.findById(id);
    const now = new Date();

    const data: Prisma.PrintJobUpdateInput = {
      status: dto.status as PrintStatus | undefined,
      printerStatus: dto.printerStatus,
      failReason: dto.failReason,
      outputPageCount: dto.outputPageCount,
    };
    if (dto.status === 'PRINTING' && !job.startedAt) data.startedAt = now;
    if (dto.status === 'COMPLETED') data.completedAt = now;

    const updated = await this.prisma.printJob.update({ where: { id: job.id }, data });

    // Auto-advance copy request on completion
    if (dto.status === 'COMPLETED' && job.copyRequestId) {
      await this.prisma.copyDocRequest.update({
        where: { id: job.copyRequestId },
        data: { status: 'COMPLETED', completedAt: now },
      });
    }

    return updated;
  }

  async retry(id: string) {
    const job = await this.findById(id);
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintStatus.QUEUED,
        failReason: null,
        startedAt: null,
        completedAt: null,
        retryCount: { increment: 1 },
      },
    });
  }

  /** Queue summary for a kiosk — helps the kiosk poll its own print queue */
  async queueSummary(kioskDeviceId: string) {
    const [queued, printing, completed] = await Promise.all([
      this.prisma.printJob.count({ where: { kioskDeviceId, status: PrintStatus.QUEUED } }),
      this.prisma.printJob.count({ where: { kioskDeviceId, status: PrintStatus.PRINTING } }),
      this.prisma.printJob.count({ where: { kioskDeviceId, status: PrintStatus.COMPLETED } }),
    ]);
    const next = await this.prisma.printJob.findFirst({
      where: { kioskDeviceId, status: { in: [PrintStatus.QUEUED, PrintStatus.READY_TO_PRINT] } },
      orderBy: { createdAt: 'asc' },
    });
    return { queued, printing, completed, next };
  }
}
