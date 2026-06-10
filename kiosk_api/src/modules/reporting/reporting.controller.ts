import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard summary' })
  dashboard() { return this.service.getDashboard(); }

  @Get('applications')
  @ApiOperation({ summary: 'Get application statistics' })
  applications(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getApplicationStats(new Date(from || '2026-01-01'), new Date(to || new Date().toISOString()));
  }

  @Get('kiosk-uptime')
  @ApiOperation({ summary: 'Get kiosk device uptime' })
  kioskUptime() { return this.service.getKioskUptime(); }
}
