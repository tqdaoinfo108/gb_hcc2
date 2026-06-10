import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ScanSessionStatus, CopyRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { MobileUploadDto } from './copy-doc.dto';

const QR_EXPIRY_MINUTES = 10;

@Injectable()
export class MobileScanService {
  constructor(private prisma: PrismaService) {}

  async createScanSession(requestId: string, baseUrl: string) {
    // Invalidate any existing pending sessions
    await this.prisma.mobileScanSession.updateMany({
      where: { requestId, status: { in: [ScanSessionStatus.PENDING, ScanSessionStatus.CONNECTED] } },
      data: { status: ScanSessionStatus.EXPIRED },
    });

    const expiresAt = new Date(Date.now() + QR_EXPIRY_MINUTES * 60_000);
    const session = await this.prisma.mobileScanSession.create({
      data: {
        requestId,
        expiresAt,
        qrPayload: '', // filled in after we know the token
      },
    });

    const qrPayload = `${baseUrl}/mobile/scan/${session.sessionToken}`;
    const updated = await this.prisma.mobileScanSession.update({
      where: { id: session.id },
      data: { qrPayload },
    });

    // Update request status → waiting for scan
    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { status: CopyRequestStatus.SCAN_PENDING },
    });

    return updated;
  }

  async connectMobile(token: string, mobileUA?: string, mobileIp?: string) {
    const session = await this.findByToken(token);
    if (session.status === ScanSessionStatus.EXPIRED) {
      throw new BadRequestException('QR code đã hết hạn. Vui lòng quét lại mã mới tại kiosk.');
    }
    if (session.expiresAt < new Date()) {
      await this.prisma.mobileScanSession.update({
        where: { id: session.id },
        data: { status: ScanSessionStatus.EXPIRED },
      });
      throw new BadRequestException('QR code đã hết hạn. Vui lòng quét lại mã mới tại kiosk.');
    }

    const updated = await this.prisma.mobileScanSession.update({
      where: { id: session.id },
      data: {
        status: ScanSessionStatus.CONNECTED,
        connectedAt: new Date(),
        mobileUA,
        mobileIp,
      },
    });

    await this.prisma.copyDocRequest.update({
      where: { id: session.requestId },
      data: { status: CopyRequestStatus.SCAN_IN_PROGRESS },
    });

    return updated;
  }

  async uploadImages(token: string, dto: MobileUploadDto) {
    const session = await this.findByToken(token);
    if (!([ScanSessionStatus.CONNECTED, ScanSessionStatus.UPLOADING] as string[]).includes(session.status)) {
      throw new BadRequestException('Phiên quét không hợp lệ hoặc đã hết hạn.');
    }

    const scanImages = dto.imagePaths.map((path, idx) => ({
      url: path,
      side: idx === 0 ? 'front' : idx === 1 ? 'back' : `page_${idx + 1}`,
      uploadedAt: new Date().toISOString(),
    }));

    const updated = await this.prisma.mobileScanSession.update({
      where: { id: session.id },
      data: {
        status: ScanSessionStatus.COMPLETE,
        uploadedAt: new Date(),
        scanImages: scanImages as any,
        rawImagePaths: dto.imagePaths,
      },
    });

    // Update request → scan complete, trigger AI
    await this.prisma.copyDocRequest.update({
      where: { id: session.requestId },
      data: { status: CopyRequestStatus.SCAN_COMPLETE },
    });

    // Create AI processing jobs (one per image)
    for (const imagePath of dto.imagePaths) {
      await this.prisma.docAIProcessingJob.create({
        data: {
          requestId: session.requestId,
          jobType: 'DOCUMENT_ANALYZE',
          inputImagePath: imagePath,
        },
      });
    }

    // Advance to AI_PROCESSING
    await this.prisma.copyDocRequest.update({
      where: { id: session.requestId },
      data: { status: CopyRequestStatus.AI_PROCESSING },
    });

    return updated;
  }

  async findByToken(token: string) {
    const session = await this.prisma.mobileScanSession.findFirst({
      where: { sessionToken: token },
    });
    if (!session) throw new NotFoundException('Scan session not found');
    return session;
  }

  async findByRequest(requestId: string) {
    return this.prisma.mobileScanSession.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
