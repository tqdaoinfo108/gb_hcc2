import { Module } from '@nestjs/common';
import { CopyDocCategoryService } from './copy-doc-category.service';
import { CopyDocRequestService } from './copy-doc-request.service';
import { MobileScanService } from './mobile-scan.service';
import { PrintJobService } from './print-job.service';
import { CopyDocUploadService } from './copy-doc-upload.service';
import { OcrMatchService } from './ocr-match.service';
import { CopyDocPdfService } from './copy-doc-pdf.service';
import {
  CopyDocCategoryController,
  CopyDocRequestController,
  MobileScanController,
  PrintJobController,
} from './copy-doc.controller';
import { MobilePageController } from './mobile-page.controller';

@Module({
  controllers: [
    CopyDocCategoryController,
    CopyDocRequestController,
    MobileScanController,
    PrintJobController,
    MobilePageController,
  ],
  providers: [
    CopyDocCategoryService,
    CopyDocRequestService,
    MobileScanService,
    PrintJobService,
    CopyDocUploadService,
    OcrMatchService,
    CopyDocPdfService,
  ],
  exports: [
    CopyDocCategoryService,
    CopyDocRequestService,
    MobileScanService,
    PrintJobService,
    CopyDocUploadService,
    OcrMatchService,
    CopyDocPdfService,
  ],
})
export class CopyDocModule {}
