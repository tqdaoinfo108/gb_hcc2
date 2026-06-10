import { Module } from '@nestjs/common';
import { CopyDocCategoryService } from './copy-doc-category.service';
import { CopyDocRequestService } from './copy-doc-request.service';
import { MobileScanService } from './mobile-scan.service';
import { PrintJobService } from './print-job.service';
import {
  CopyDocCategoryController,
  CopyDocRequestController,
  MobileScanController,
  PrintJobController,
} from './copy-doc.controller';

@Module({
  controllers: [
    CopyDocCategoryController,
    CopyDocRequestController,
    MobileScanController,
    PrintJobController,
  ],
  providers: [
    CopyDocCategoryService,
    CopyDocRequestService,
    MobileScanService,
    PrintJobService,
  ],
  exports: [
    CopyDocCategoryService,
    CopyDocRequestService,
    MobileScanService,
    PrintJobService,
  ],
})
export class CopyDocModule {}
