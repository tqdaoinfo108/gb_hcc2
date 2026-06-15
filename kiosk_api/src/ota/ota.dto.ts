import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class CreateReleaseDto {
  @IsString() @MaxLength(40)
  version!: string;

  @IsOptional() @IsIn(['STABLE', 'BETA'])
  channel?: 'STABLE' | 'BETA';

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;

  @IsOptional() @IsBoolean()
  isMandatory?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  rolloutPercent?: number;

  @IsOptional() @IsString()
  targetLocationId?: string | null;

  @IsOptional() @IsString()
  scheduledAt?: string; // ISO date

  @IsOptional() @IsBoolean()
  autoRollback?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  failureThreshold?: number;
}

export class UpdateReleaseDto {
  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;

  @IsOptional() @IsBoolean()
  isMandatory?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  rolloutPercent?: number;

  @IsOptional() @IsString()
  targetLocationId?: string | null;

  @IsOptional() @IsString()
  scheduledAt?: string | null;

  @IsOptional() @IsBoolean()
  autoRollback?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  failureThreshold?: number;
}

export class SetReleaseStatusDto {
  @IsIn(['ROLLING', 'PAUSED', 'COMPLETED', 'ROLLED_BACK', 'DRAFT'])
  status!: 'ROLLING' | 'PAUSED' | 'COMPLETED' | 'ROLLED_BACK' | 'DRAFT';
}

export class OtaReportDto {
  @IsString()
  deviceId!: string;

  @IsString()
  releaseId!: string;

  @IsIn(['DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'INSTALLED', 'FAILED'])
  status!: 'DOWNLOADING' | 'DOWNLOADED' | 'INSTALLING' | 'INSTALLED' | 'FAILED';

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  progress?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  error?: string;

  @IsOptional() @IsString() @MaxLength(40)
  version?: string;
}
