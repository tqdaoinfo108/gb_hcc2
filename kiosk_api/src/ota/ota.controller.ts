import {
  Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OtaService } from './ota.service';
import {
  CreateReleaseDto, OtaReportDto, SetReleaseStatusDto, UpdateReleaseDto,
} from './ota.dto';

function decodeName(raw?: string): string | undefined {
  if (!raw) return undefined;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

@ApiTags('ota')
@Controller('ota')
export class OtaController {
  constructor(private readonly ota: OtaService) {}

  /* ── Locations (for CMS dropdown) ── */
  @Get('locations')
  @ApiOperation({ summary: 'List all active locations for OTA targeting dropdown' })
  listLocations() { return this.ota.listLocations(); }

  /* ── Device version matrix ── */
  @Get('devices')
  @ApiOperation({ summary: 'Device version + update-status matrix (optionally scoped to a location)' })
  devices(@Query('locationId') locationId?: string) {
    return this.ota.deviceMatrix(locationId ? [locationId] : null);
  }

  /* ── Releases (admin) ── */
  @Get('releases')
  listReleases() { return this.ota.listReleases(); }

  @Get('releases/:id')
  releaseDetail(@Param('id') id: string) { return this.ota.releaseDetail(id); }

  @Post('releases')
  createRelease(
    @Body() dto: CreateReleaseDto,
    @Headers('x-actor-id') actorId?: string,
    @Headers('x-actor-name') actorName?: string,
  ) {
    return this.ota.createRelease(dto, { id: actorId, name: decodeName(actorName) });
  }

  @Patch('releases/:id')
  updateRelease(@Param('id') id: string, @Body() dto: UpdateReleaseDto) {
    return this.ota.updateRelease(id, dto);
  }

  @Post('releases/:id/package')
  @ApiOperation({ summary: 'Upload the signed update package (multipart field "file")' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  uploadPackage(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; originalname: string }) {
    return this.ota.uploadPackage(id, file);
  }

  @Patch('releases/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetReleaseStatusDto) {
    return this.ota.setStatus(id, dto);
  }

  @Delete('releases/:id')
  removeRelease(@Param('id') id: string) { return this.ota.removeRelease(id); }

  /* ── CI/CD one-shot deploy ── */
  @Post('deploy')
  @ApiOperation({ summary: 'CI/CD: create + upload + publish a release in one call (x-deploy-token)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  deploy(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body() body: Record<string, string>,
    @Headers('x-deploy-token') token?: string,
  ) {
    return this.ota.deploy(file, body, token);
  }

  /* ── Kiosk endpoints ── */
  @Get('check')
  @ApiOperation({ summary: 'Kiosk: check whether an update applies to this device' })
  check(@Query('deviceId') deviceId: string, @Query('version') version?: string) {
    return this.ota.check(deviceId, version);
  }

  @Post('report')
  @ApiOperation({ summary: 'Kiosk: report update download/install progress and outcome' })
  report(@Body() dto: OtaReportDto) { return this.ota.report(dto); }

  @Get('download/:id')
  @ApiOperation({ summary: 'Kiosk: download the update package for a release' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { filePath, fileName, sha256 } = await this.ota.resolvePackage(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (sha256) res.setHeader('X-Package-SHA256', sha256);
    res.setHeader('Cache-Control', 'no-store');
    const stream = createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); });
    stream.pipe(res);
  }

  @Get('packages')
  packages() { return this.ota.listReleases(); }
}
