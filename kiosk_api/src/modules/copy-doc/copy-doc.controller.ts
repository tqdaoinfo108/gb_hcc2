import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CopyRequestStatus, PrintStatus } from '@prisma/client';
import { CopyDocCategoryService } from './copy-doc-category.service';
import { CopyDocRequestService } from './copy-doc-request.service';
import { MobileScanService } from './mobile-scan.service';
import { PrintJobService } from './print-job.service';
import {
  CreateCopyDocCategoryDto, UpdateCopyDocCategoryDto, CreateFeeRuleDto,
  InitiateCopyDocDto, UpdateCopyRequestStatusDto, ConfirmQuantityDto,
  ConfirmFeeDto, AdjustCornersDto,
  MobileUploadDto,
  CreatePrintJobDto, UpdatePrintJobDto,
} from './copy-doc.dto';

// ─── Categories ───────────────────────────────────────────────────────────────

@ApiTags('copy-doc / categories')
@Controller('copy-doc/categories')
export class CopyDocCategoryController {
  constructor(private categories: CopyDocCategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List document categories' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') inc?: string) {
    return this.categories.findAll(inc === 'true');
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
  constructor(private requests: CopyDocRequestService) {}

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
}

// ─── Mobile Scan ──────────────────────────────────────────────────────────────

@ApiTags('copy-doc / mobile-scan')
@Controller('copy-doc/scan')
export class MobileScanController {
  constructor(private scan: MobileScanService) {}

  @Post(':requestId/session')
  @ApiOperation({ summary: 'Create a mobile scan session (generates QR token)' })
  createSession(@Param('requestId') requestId: string) {
    const baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:4000';
    return this.scan.createScanSession(requestId, baseUrl);
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
