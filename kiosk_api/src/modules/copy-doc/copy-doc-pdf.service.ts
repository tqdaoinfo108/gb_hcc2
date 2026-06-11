import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma.service';
import { CopyDocUploadService } from './copy-doc-upload.service';

@Injectable()
export class CopyDocPdfService {
  private readonly pdfDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: CopyDocUploadService,
  ) {
    this.pdfDir = process.env.PDF_DIR ?? path.join(process.cwd(), 'uploads', 'pdfs');
    if (!fs.existsSync(this.pdfDir)) {
      fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  /**
   * Generate an electronic copy PDF for the given request.
   * Uses a plain SVG-based approach (no heavy PDF library required).
   * In production, replace with PDFKit / pdfmake / Puppeteer rendering.
   */
  async generateCopy(requestId: string): Promise<{ pdfPath: string; pdfUrl: string }> {
    const request = await this.prisma.copyDocRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { category: true },
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const svgContent = this.buildSvgPdf({
      requestCode: request.requestCode,
      receiptCode: request.receiptCode ?? 'N/A',
      categoryName: request.category?.name ?? 'Tài liệu',
      quantity: request.quantity,
      totalFee: Number(request.totalFee),
      dateStr,
      timeStr,
    });

    // Save SVG as the "PDF" (demo — real impl would use PDF library)
    const filename = `${requestId}_${Date.now()}.svg`;
    const fullPath = path.join(this.pdfDir, filename);
    fs.writeFileSync(fullPath, svgContent, 'utf8');

    const storagePath = `pdfs/${filename}`;
    const pdfUrl = `/uploads/${storagePath}`;

    await this.upload.savePdfPath(requestId, storagePath);

    // Advance status
    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { status: 'PRINT_QUEUED' },
    });

    return { pdfPath: storagePath, pdfUrl };
  }

  private buildSvgPdf(params: {
    requestCode: string;
    receiptCode: string;
    categoryName: string;
    quantity: number;
    totalFee: number;
    dateStr: string;
    timeStr: string;
  }) {
    const feeStr = params.totalFee.toLocaleString('vi-VN') + ' ₫';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" width="794" height="1123">
  <rect width="794" height="1123" fill="#fff"/>
  <!-- Watermark -->
  <text x="397" y="560" font-family="sans-serif" font-size="72" font-weight="bold"
        fill="#e5e7eb" text-anchor="middle" transform="rotate(-35,397,560)">SAO Y BẢN GỐC</text>
  <!-- Header -->
  <rect x="0" y="0" width="794" height="90" fill="#1d4ed8"/>
  <text x="397" y="38" font-family="sans-serif" font-size="13" fill="#93c5fd" text-anchor="middle">
    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM — Độc lập - Tự do - Hạnh phúc
  </text>
  <text x="397" y="68" font-family="sans-serif" font-size="22" font-weight="bold" fill="#fff" text-anchor="middle">
    BẢN SAO ĐIỆN TỬ CÓ GIÁ TRỊ PHÁP LÝ
  </text>
  <!-- Content -->
  <text x="80" y="140" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Loại tài liệu:</text>
  <text x="280" y="140" font-family="sans-serif" font-size="16" fill="#111827">${params.categoryName}</text>
  <text x="80" y="175" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Mã yêu cầu:</text>
  <text x="280" y="175" font-family="sans-serif" font-size="16" fill="#111827">${params.requestCode}</text>
  <text x="80" y="210" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Số bản sao:</text>
  <text x="280" y="210" font-family="sans-serif" font-size="16" fill="#111827">${params.quantity} bản</text>
  <text x="80" y="245" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Lệ phí:</text>
  <text x="280" y="245" font-family="sans-serif" font-size="16" fill="#111827">${feeStr}</text>
  <text x="80" y="280" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Ngày cấp:</text>
  <text x="280" y="280" font-family="sans-serif" font-size="16" fill="#111827">${params.dateStr} ${params.timeStr}</text>
  <!-- Divider -->
  <line x1="60" y1="310" x2="734" y2="310" stroke="#e5e7eb" stroke-width="1.5"/>
  <!-- Receipt -->
  <text x="397" y="360" font-family="sans-serif" font-size="13" fill="#6b7280" text-anchor="middle">
    Mã biên lai: ${params.receiptCode}
  </text>
  <!-- Footer -->
  <rect x="0" y="1073" width="794" height="50" fill="#f8fafc"/>
  <text x="397" y="1103" font-family="sans-serif" font-size="12" fill="#9ca3af" text-anchor="middle">
    Tài liệu này được tạo bởi Hệ thống Kiosk Chính phủ Thông minh — ${params.dateStr}
  </text>
</svg>`;
  }
}
