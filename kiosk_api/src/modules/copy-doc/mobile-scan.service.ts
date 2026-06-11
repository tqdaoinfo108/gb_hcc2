import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ScanSessionStatus, CopyRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { MobileUploadDto } from './copy-doc.dto';

const QR_EXPIRY_MINUTES = 10;

@Injectable()
export class MobileScanService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

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

    // Emit to kiosk device — phone has opened the page
    const deviceSocketId = await this.getDeviceSocketId(session.requestId);
    if (deviceSocketId) {
      this.realtime.sendToDevice(deviceSocketId, 'copydoc:scan_connected', {
        token,
        sessionId: updated.id,
      });
    }

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

    // Emit to kiosk device — images received, processing started
    const deviceSocketId = await this.getDeviceSocketId(session.requestId);
    if (deviceSocketId) {
      this.realtime.sendToDevice(deviceSocketId, 'copydoc:scan_uploaded', {
        requestId: session.requestId,
        imageCount: dto.imagePaths.length,
      });
    }

    return updated;
  }

  /** Emit the AI detection result to the kiosk device */
  async emitAiResult(
    requestId: string,
    data: {
      corners: { x: number; y: number }[];
      categoryId: string | null;
      label: string;
      confidence: number;
      price: number;
      imageUrl?: string;
      pages?: { pageIndex: number; url: string }[];
    },
  ) {
    const deviceSocketId = await this.getDeviceSocketId(requestId);
    if (deviceSocketId) {
      this.realtime.sendToDevice(deviceSocketId, 'copydoc:ai_result', data);
    }
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

  /** Resolve the Socket.IO key for a copy-doc request's kiosk device */
  private async getDeviceSocketId(requestId: string): Promise<string | null> {
    const request = await this.prisma.copyDocRequest.findUnique({
      where: { id: requestId },
    });
    if (!request?.kioskDeviceId) return null;

    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: request.kioskDeviceId },
      select: { deviceId: true },
    });
    return device?.deviceId ?? null;
  }
}
