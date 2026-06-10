import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class HeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  macAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  memoryUsage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  diskUsage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  networkLatency?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  os?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  screenResolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentScreen?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  components?: Record<string, unknown>;
}

export class UpdateKioskConfigDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  placement?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenanceMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tickerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firmwareVersion?: string;
}

export class CreateLocationDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
