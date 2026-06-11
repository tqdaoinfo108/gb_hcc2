import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { WorkflowLaunchService, LaunchSource } from './workflow-launch.service';
import { CITIZEN_VARIABLES } from './workflow-variables';

class LaunchDto {
  @IsString() kioskSessionId!: string;
  @IsString() procedureId!: string;
  @IsOptional() @IsString() citizenId?: string;
  @IsOptional() @IsString() deviceSerial?: string;
  @IsOptional() @IsEnum(['MANUAL', 'AI', 'VOICE']) source?: LaunchSource;
  @IsOptional() @IsObject() formData?: Record<string, unknown>;
}

/**
 * Single entry point shared by the Manual flow and the AI flow.
 * Manual:  kiosk selects a procedure → POST /workflows/launch { source: MANUAL }
 * AI chip: citizen taps "Nộp hồ sơ ngay" → POST /workflows/launch { source: AI }
 */
@ApiTags('Workflow Launch (shared pipeline)')
@Controller('workflows')
export class WorkflowLaunchController {
  constructor(private launchSvc: WorkflowLaunchService) {}

  @Get('variables')
  @ApiOperation({ summary: 'Catalog of dynamic CCCD/citizen variables for the recorder' })
  variables() {
    // The recorder uses `match` tokens for auto-binding fields → return as-is.
    return CITIZEN_VARIABLES;
  }

  @Get('resolve/:procedureId')
  @ApiOperation({ summary: 'Procedure detail + whether online submission is configured' })
  resolve(@Param('procedureId') procedureId: string) {
    return this.launchSvc.resolve(procedureId);
  }

  @Post('launch')
  @ApiOperation({ summary: 'Launch the configured workflow for a procedure (both flows)' })
  launch(@Body() dto: LaunchDto) {
    return this.launchSvc.launch({
      kioskSessionId: dto.kioskSessionId,
      procedureId: dto.procedureId,
      citizenId: dto.citizenId,
      deviceSerial: dto.deviceSerial,
      source: dto.source ?? 'MANUAL',
      formData: dto.formData,
    });
  }
}
