import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ApplicationStatus } from '@prisma/client';
import { generateTrackingCode, generateReceiptNumber } from '../../common/tracking.util';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { sessionId: string; citizenId: string; procedureId: string }) {
    const trackingCode = generateTrackingCode();
    return this.prisma.application.create({
      data: { ...data, trackingCode },
    });
  }

  async findById(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id, deletedAt: null },
      include: {
        citizen: true,
        procedure: { include: { category: true } },
        documents: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        receipts: true,
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async findByTrackingCode(trackingCode: string) {
    const app = await this.prisma.application.findUnique({
      where: { trackingCode, deletedAt: null },
      include: { citizen: true, procedure: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async findByCitizen(citizenId: string) {
    return this.prisma.application.findMany({
      where: { citizenId, deletedAt: null },
      include: { procedure: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submit(id: string) {
    const app = await this.findById(id);
    await this.prisma.applicationStatusHistory.create({
      data: { applicationId: id, fromStatus: app.status, toStatus: ApplicationStatus.SUBMITTED },
    });
    const updated = await this.prisma.application.update({
      where: { id },
      data: { status: ApplicationStatus.SUBMITTED, submittedAt: new Date() },
    });
    const receipt = await this.prisma.submissionReceipt.create({
      data: {
        applicationId: id,
        receiptNumber: generateReceiptNumber(),
        receiptData: {
          trackingCode: updated.trackingCode,
          submittedAt: updated.submittedAt,
          procedure: app.procedure?.name,
        },
      },
    });
    return { application: updated, receipt };
  }

  async updateStatus(id: string, toStatus: ApplicationStatus, changedBy?: string, note?: string) {
    const app = await this.findById(id);
    await this.prisma.applicationStatusHistory.create({
      data: { applicationId: id, fromStatus: app.status, toStatus, changedBy, note },
    });
    return this.prisma.application.update({
      where: { id },
      data: { status: toStatus, ...(toStatus === ApplicationStatus.COMPLETED ? { completedAt: new Date() } : {}) },
    });
  }

  async addDocument(applicationId: string, doc: { documentId?: string; fileName?: string; storagePath?: string; bucketName?: string; mimeType?: string; sizeBytes?: number }) {
    return this.prisma.applicationDocument.create({
      data: { applicationId, ...doc },
    });
  }
}
