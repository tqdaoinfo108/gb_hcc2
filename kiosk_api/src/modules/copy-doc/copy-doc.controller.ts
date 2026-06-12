import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import * as os from 'os';

/**
 * Replace localhost/127.0.0.1 with the machine's first non-internal IPv4 address.
 * This ensures the QR URL is reachable from phones on the same network.
 */
function resolvePublicBaseUrl(rawBase: string): string {
  if (!rawBase.includes('localhost') && !rawBase.includes('127.0.0.1')) {
    return rawBase; // already a real hostname / configured IP
  }
  // Extract port from rawBase (e.g., "http://localhost:3001" → "3001")
  const portMatch = rawBase.match(/:(\d+)\/?$/);
  const port = portMatch ? portMatch[1] : '3001';
  // Find first external IPv4 interface
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    for (const iface of ifaceList ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${port}`;
      }
    }
  }
  return rawBase; // fallback unchanged
}
import { CopyRequestStatus, PrintStatus } from '@prisma/client';
import { CopyDocCategoryService } from './copy-doc-category.service';
import { CopyDocRequestService } from './copy-doc-request.service';
import { MobileScanService } from './mobile-scan.service';
import { PrintJobService } from './print-job.service';
import { CopyDocUploadService } from './copy-doc-upload.service';
import { OcrMatchService } from './ocr-match.service';
import { CopyDocPdfService } from './copy-doc-pdf.service';
import {
  CreateCopyDocCategoryDto, UpdateCopyDocCategoryDto, CreateFeeRuleDto,
  InitiateCopyDocDto, UpdateCopyRequestStatusDto, ConfirmQuantityDto,
  ConfirmFeeDto, AdjustCornersDto,
  MobileUploadDto,
  CreatePrintJobDto, UpdatePrintJobDto,
  ApplyAiResultDto,
} from './copy-doc.dto';

// ─── Categories ───────────────────────────────────────────────────────────────

@ApiTags('copy-doc / categories')
@Controller('copy-doc/categories')
export class CopyDocCategoryController {
  constructor(private categories: CopyDocCategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List document categories (by location, fallback global)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'locationId', required: false })
  findAll(@Query('includeInactive') inc?: string, @Query('locationId') locationId?: string) {
    return this.categories.findAll(inc === 'true', locationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category with fee rules' })
  findOne(@Param('id') id: string) { return this.categories.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Create document category' })
  create(@Body() body: CreateCopyDocCategoryDto) { return this.categories.create(body); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document category' })
  update(@Param('id') id: string, @Body() body: UpdateCopyDocCategoryDto) {
    return this.categories.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete document category' })
  remove(@Param('id') id: string) { return this.categories.remove(id); }

  @Post(':id/fee-rules')
  @ApiOperation({ summary: 'Add a tiered fee rule to a category' })
  addFeeRule(@Param('id') id: string, @Body() body: CreateFeeRuleDto) {
    return this.categories.addFeeRule(id, body);
  }

  @Delete(':id/fee-rules/:ruleId')
  @ApiOperation({ summary: 'Deactivate a fee rule' })
  removeFeeRule(@Param('ruleId') ruleId: string) { return this.categories.removeFeeRule(ruleId); }

  @Get(':id/price')
  @ApiOperation({ summary: 'Calculate effective price for a quantity' })
  @ApiQuery({ name: 'quantity', type: Number })
  price(@Param('id') id: string, @Query('quantity') qty: string) {
    return this.categories.resolvePrice(id, +qty || 1);
  }
}

// ─── Copy Doc Requests ────────────────────────────────────────────────────────

@ApiTags('copy-doc / requests')
@Controller('copy-doc/requests')
export class CopyDocRequestController {
  constructor(
    private requests: CopyDocRequestService,
    private upload: CopyDocUploadService,
    private ocrMatch: OcrMatchService,
    private pdf: CopyDocPdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List copy requests' })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: any,
    @Query('limit') limit?: string,
  ) {
    return this.requests.findAll({ sessionId, status: status as CopyRequestStatus, limit: limit ? +limit : undefined });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get copy request details' })
  findOne(@Param('id') id: string) { return this.requests.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Initiate a new copy document request' })
  initiate(@Body() body: InitiateCopyDocDto) { return this.requests.initiate(body); }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update request status' })
  updateStatus(@Param('id') id: string, @Body() body: UpdateCopyRequestStatusDto) {
    return this.requests.updateStatus(id, body.status);
  }

  @Post(':id/quantity')
  @ApiOperation({ summary: 'Confirm quantity and calculate fee' })
  confirmQuantity(@Param('id') id: string, @Body() body: ConfirmQuantityDto) {
    return this.requests.confirmQuantity(id, body);
  }

  @Post(':id/corners')
  @ApiOperation({ summary: 'Save corner adjustment from preview editor' })
  adjustCorners(@Param('id') id: string, @Body() body: AdjustCornersDto) {
    return this.requests.adjustCorners(id, body);
  }

  @Post(':id/confirm-fee')
  @ApiOperation({ summary: 'Citizen confirms fee and selects payment method' })
  confirmFee(@Param('id') id: string, @Body() body: ConfirmFeeDto) {
    return this.requests.confirmFee(id, body);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a copy request' })
  cancel(@Param('id') id: string) { return this.requests.cancel(id); }

  @Post('upload')
  @ApiOperation({ summary: 'Upload document image (multipart/form-data)' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body('requestId') requestId: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.upload.saveImage(requestId, file.buffer, file.originalname, file.mimetype);
  }

  @Post(':id/processed-image')
  @ApiOperation({ summary: 'Crop page 0 using confirmed corners (back-compat)' })
  async cropProcessedImage(
    @Param('id') id: string,
    @Body('corners') corners: { x: number; y: number }[],
  ) {
    if (!Array.isArray(corners) || corners.length !== 4) {
      throw new BadRequestException('corners must be an array of 4 {x,y} objects');
    }
    return this.upload.cropPage(id, 0, corners);
  }

  @Post(':id/pages/:pageIndex/crop')
  @ApiOperation({ summary: 'Crop a specific page using confirmed corners' })
  async cropPage(
    @Param('id') id: string,
    @Param('pageIndex') pageIndex: string,
    @Body('corners') corners: { x: number; y: number }[],
  ) {
    if (!Array.isArray(corners) || corners.length !== 4) {
      throw new BadRequestException('corners must be an array of 4 {x,y} objects');
    }
    const idx = parseInt(pageIndex, 10);
    if (Number.isNaN(idx) || idx < 0) throw new BadRequestException('Invalid pageIndex');
    return this.upload.cropPage(id, idx, corners);
  }

  @Post(':id/trigger-ai')
  @ApiOperation({ summary: 'Trigger AI OCR processing for request' })
  async triggerAi(@Param('id') id: string) {
    const result = await this.ocrMatch.simulateAiProcessing(id);
    if (result.matchResult) {
      const updated = await this.requests.applyAiResult(id, {
        categoryId: result.matchResult.categoryId,
        detectedTypeLabel: result.matchResult.categoryName,
        detectedTypeConfidence: result.matchResult.confidence,
      });
      return { ...updated, corners: result.corners, ocrText: result.ocrText, matchResult: result.matchResult };
    }
    return { corners: result.corners, ocrText: result.ocrText, matchResult: null };
  }

  @Post(':id/apply-ai-result')
  @ApiOperation({ summary: 'Apply AI result to request (set detected category + corners)' })
  applyAiResult(@Param('id') id: string, @Body() body: ApplyAiResultDto) {
    return this.requests.applyAiResult(id, body);
  }

  @Post(':id/generate-pdf')
  @ApiOperation({ summary: 'Generate electronic copy PDF' })
  generatePdf(@Param('id') id: string) {
    return this.pdf.generateCopy(id);
  }
}

// ─── Mobile Scan ──────────────────────────────────────────────────────────────

@ApiTags('copy-doc / mobile-scan')
@Controller('copy-doc/scan')
export class MobileScanController {
  constructor(private scan: MobileScanService) {}

  @Post(':requestId/session')
  @ApiOperation({ summary: 'Create a mobile scan session (generates QR token)' })
  createSession(
    @Param('requestId') requestId: string,
    @Body('baseUrl') baseUrl?: string,
  ) {
    const raw = baseUrl ?? process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
    const base = resolvePublicBaseUrl(raw);
    console.log(`[MobileScan] QR base URL resolved: ${raw} → ${base}`);
    return this.scan.createScanSession(requestId, base);
  }

  @Get('resolve-url')
  @ApiOperation({ summary: 'Debug: show resolved public base URL for QR' })
  getResolvedUrl(@Body('baseUrl') baseUrl?: string) {
    const raw = baseUrl ?? process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
    return { raw, resolved: resolvePublicBaseUrl(raw) };
  }

  @Get(':requestId/sessions')
  @ApiOperation({ summary: 'List scan sessions for a copy request' })
  getSessions(@Param('requestId') requestId: string) {
    return this.scan.findByRequest(requestId);
  }

  @Post('connect/:token')
  @ApiOperation({ summary: 'Mobile: connect using QR token (marks session CONNECTED)' })
  connectMobile(
    @Param('token') token: string,
    @Body('mobileUA') mobileUA?: string,
    @Body('mobileIp') mobileIp?: string,
  ) {
    return this.scan.connectMobile(token, mobileUA, mobileIp);
  }

  @Post('upload/:token')
  @ApiOperation({ summary: 'Mobile: upload document images after scanning' })
  uploadImages(@Param('token') token: string, @Body() body: MobileUploadDto) {
    return this.scan.uploadImages(token, body);
  }

  @Get('token/:token')
  @ApiOperation({ summary: 'Get scan session info by token (mobile polling)' })
  getByToken(@Param('token') token: string) {
    return this.scan.findByToken(token);
  }
}

// ─── Print Jobs ───────────────────────────────────────────────────────────────

@ApiTags('copy-doc / print-jobs')
@Controller('copy-doc/print-jobs')
export class PrintJobController {
  constructor(private print: PrintJobService) {}

  @Get()
  @ApiOperation({ summary: 'List print jobs' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'kioskDeviceId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: any,
    @Query('kioskDeviceId') kioskDeviceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.print.findAll({ status: status as PrintStatus, kioskDeviceId, limit: limit ? +limit : undefined });
  }

  @Get('queue/:kioskDeviceId')
  @ApiOperation({ summary: 'Print queue summary for a kiosk device' })
  queueSummary(@Param('kioskDeviceId') kioskDeviceId: string) {
    return this.print.queueSummary(kioskDeviceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get print job details' })
  findOne(@Param('id') id: string) { return this.print.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Create print job' })
  create(@Body() body: CreatePrintJobDto) { return this.print.create(body); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update print job status (called by print agent)' })
  update(@Param('id') id: string, @Body() body: UpdatePrintJobDto) {
    return this.print.update(id, body);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed print job' })
  retry(@Param('id') id: string) { return this.print.retry(id); }
}
