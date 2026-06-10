import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { ApplicationStatus } from '@prisma/client';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new application' })
  create(@Body() body: { sessionId: string; citizenId: string; procedureId: string }) {
    return this.service.create(body);
  }

  @Get('lookup/:trackingCode')
  @ApiOperation({ summary: 'Lookup application by tracking code' })
  lookup(@Param('trackingCode') code: string) {
    return this.service.findByTrackingCode(code);
  }

  @Get('citizen/:citizenId')
  @ApiOperation({ summary: 'Get all applications for a citizen' })
  byCitizen(@Param('citizenId') id: string) {
    return this.service.findByCitizen(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get application detail' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Submit application' })
  submit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update application status' })
  updateStatus(@Param('id') id: string, @Body() body: { status: ApplicationStatus; changedBy?: string; note?: string }) {
    return this.service.updateStatus(id, body.status, body.changedBy, body.note);
  }
}
