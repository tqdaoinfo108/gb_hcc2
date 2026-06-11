import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp = require('sharp');
import { PrismaService } from '../../prisma.service';

@Injectable()
export class CopyDocUploadService {
  private readonly uploadDir: string;

  constructor(private readonly prisma: PrismaService) {
    this.uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads', 'copy-doc');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Save uploaded image — always normalise EXIF rotation so the stored
   * file matches exactly what the browser displayed to the user.
   * Corners sent by the kiosk are relative to this normalised image.
   */
  async saveImage(
    requestId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ storagePath: string; url: string }> {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedMimes.includes(mimeType)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, HEIC images are accepted');
    }

    const filename = `${requestId}_${Date.now()}.jpg`;
    const fullPath = path.join(this.uploadDir, filename);

    // .rotate() with no args reads the EXIF Orientation tag and physically
    // rotates / flips the pixels, then strips the tag — so what's on disk
    // is always "right-side-up" regardless of how the phone was held.
    await sharp(buffer)
      .rotate()                    // apply EXIF orientation
      .jpeg({ quality: 90 })
      .toFile(fullPath);

    const storagePath = `copy-doc/${filename}`;
    const url = `/uploads/${storagePath}`;

    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { rawImagePath: storagePath, status: 'SCAN_COMPLETE' },
    });

    return { storagePath, url };
  }

  /** Return public URL for a stored path */
  getUrl(storagePath: string): string {
    return `/uploads/${storagePath}`;
  }

  /**
   * Save a single page's raw image (already upright from the client) and
   * upsert the corresponding CopyDocPage row. Page 0 also mirrors onto the
   * request's rawImagePath for backward compatibility.
   */
  async savePageImage(
    requestId: string,
    pageIndex: number,
    buffer: Buffer,
    mimeType: string,
    meta?: { ocrText?: string; ocrOrientation?: number },
  ): Promise<{ storagePath: string; url: string; pageId: string }> {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedMimes.includes(mimeType)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, HEIC images are accepted');
    }

    const filename = `${requestId}_p${pageIndex}_${Date.now()}.jpg`;
    const fullPath = path.join(this.uploadDir, filename);
    await sharp(buffer).rotate().jpeg({ quality: 90 }).toFile(fullPath);

    const storagePath = `copy-doc/${filename}`;

    const page = await this.prisma.copyDocPage.upsert({
      where: { requestId_pageIndex: { requestId, pageIndex } },
      create: {
        requestId, pageIndex, rawImagePath: storagePath,
        ocrText: meta?.ocrText ?? null,
        ocrOrientation: meta?.ocrOrientation ?? null,
      },
      update: {
        rawImagePath: storagePath, processedImagePath: null,
        ocrText: meta?.ocrText ?? null,
        ocrOrientation: meta?.ocrOrientation ?? null,
      },
    });

    if (pageIndex === 0) {
      await this.prisma.copyDocRequest.update({
        where: { id: requestId },
        data: { rawImagePath: storagePath, status: 'SCAN_COMPLETE' },
      });
    }

    return { storagePath, url: `/uploads/${storagePath}`, pageId: page.id };
  }

  /**
   * Crop one page by its index using 4 normalised corners. Saves the result
   * to that page's processedImagePath. Page 0 mirrors onto the request.
   */
  async cropPage(
    requestId: string,
    pageIndex: number,
    corners: { x: number; y: number }[],
  ): Promise<{ storagePath: string; url: string }> {
    const page = await this.prisma.copyDocPage.findUnique({
      where: { requestId_pageIndex: { requestId, pageIndex } },
    });
    if (!page?.rawImagePath) {
      throw new BadRequestException(`Page ${pageIndex} not found for request`);
    }

    const srcPath = path.join(process.cwd(), 'uploads', page.rawImagePath);
    if (!fs.existsSync(srcPath)) {
      throw new BadRequestException(`Source file not found: ${srcPath}`);
    }

    const m = await sharp(srcPath).metadata();
    const iW = m.width!, iH = m.height!;
    const px = corners.map(c => c.x * iW);
    const py = corners.map(c => c.y * iH);
    const left   = Math.max(0,  Math.round(Math.min(...px)));
    const top    = Math.max(0,  Math.round(Math.min(...py)));
    const right  = Math.min(iW, Math.round(Math.max(...px)));
    const bottom = Math.min(iH, Math.round(Math.max(...py)));
    const cropW  = right - left;
    const cropH  = bottom - top;
    if (cropW < 10 || cropH < 10) throw new BadRequestException('Crop region is too small');

    const filename = `${requestId}_p${pageIndex}_processed_${Date.now()}.jpg`;
    const destPath = path.join(this.uploadDir, filename);
    await sharp(srcPath)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 92 })
      .toFile(destPath);

    const storagePath = `copy-doc/${filename}`;
    await this.prisma.copyDocPage.update({
      where: { id: page.id },
      data: { processedImagePath: storagePath },
    });

    if (pageIndex === 0) {
      await this.prisma.copyDocRequest.update({
        where: { id: requestId },
        data: { processedImagePath: storagePath, status: 'ADJUSTED' },
      });
    }

    return { storagePath, url: `/uploads/${storagePath}` };
  }

  /** Save processed (perspective-corrected) image path (legacy helper) */
  async saveProcessedPath(requestId: string, storagePath: string): Promise<void> {
    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { processedImagePath: storagePath },
    });
  }

  /**
   * Crop the (already EXIF-normalised) raw image using 4 normalised corners.
   * After cropping, auto-rotate to portrait if the crop region is landscape
   * (width > height) — handles documents photographed sideways.
   */
  async cropAndSaveProcessed(
    requestId: string,
    corners: { x: number; y: number }[],
  ): Promise<{ storagePath: string; url: string }> {
    // Fetch raw image path from DB
    const req = await this.prisma.copyDocRequest.findUnique({
      where: { id: requestId },
      select: { rawImagePath: true },
    });
    if (!req?.rawImagePath) {
      throw new BadRequestException('Raw image not found for this request');
    }

    // Resolve full disk path  (rawImagePath = "copy-doc/filename.jpg")
    const srcPath = path.join(process.cwd(), 'uploads', req.rawImagePath);
    if (!fs.existsSync(srcPath)) {
      throw new BadRequestException(`Source file not found: ${srcPath}`);
    }

    // The raw image was already EXIF-normalised on save, so metadata()
    // returns the true pixel dimensions without surprises.
    const meta = await sharp(srcPath).metadata();
    const iW = meta.width!;
    const iH = meta.height!;

    // Convert normalised corners → pixel coords
    const px = corners.map(c => c.x * iW);
    const py = corners.map(c => c.y * iH);

    // Bounding box of the 4 corners, clamped to image bounds
    const left   = Math.max(0,  Math.round(Math.min(...px)));
    const top    = Math.max(0,  Math.round(Math.min(...py)));
    const right  = Math.min(iW, Math.round(Math.max(...px)));
    const bottom = Math.min(iH, Math.round(Math.max(...py)));
    const cropW  = right - left;
    const cropH  = bottom - top;

    if (cropW < 10 || cropH < 10) {
      throw new BadRequestException('Crop region is too small');
    }

    // The raw image is already upright (client OCR-orientation fix), so the
    // crop preserves the document's natural aspect — CCCD stays landscape,
    // A4 stays portrait. No forced rotation here.
    const filename = `${requestId}_processed_${Date.now()}.jpg`;
    const destPath = path.join(this.uploadDir, filename);

    await sharp(srcPath)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 92 })
      .toFile(destPath);

    const storagePath = `copy-doc/${filename}`;
    const url = `/uploads/${storagePath}`;

    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { processedImagePath: storagePath, status: 'ADJUSTED' },
    });

    return { storagePath, url };
  }

  /** Save generated PDF path */
  async savePdfPath(requestId: string, storagePath: string): Promise<void> {
    await this.prisma.copyDocRequest.update({
      where: { id: requestId },
      data: { pdfPath: storagePath },
    });
  }
}
