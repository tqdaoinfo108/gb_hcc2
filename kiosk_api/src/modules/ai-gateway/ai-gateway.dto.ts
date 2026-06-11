import {
  IsString, IsOptional, IsEnum, IsInt, IsArray, IsObject, Min, Max,
} from 'class-validator';
import { AiProvider, AiRunnerStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAiRunnerDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: AiProvider }) @IsEnum(AiProvider) provider!: AiProvider;
  @ApiProperty() @IsString() endpoint!: string;
  @ApiProperty() @IsString() modelName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1000) timeoutMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(64) maxConcurrent?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() capabilities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdateAiRunnerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: AiProvider }) @IsOptional() @IsEnum(AiProvider) provider?: AiProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() endpoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modelName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1000) timeoutMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(64) maxConcurrent?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() capabilities?: string[];
  @ApiPropertyOptional({ enum: AiRunnerStatus }) @IsOptional() @IsEnum(AiRunnerStatus) status?: AiRunnerStatus;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class ChatDto {
  @ApiProperty() @IsString() kioskSessionId!: string;
  @ApiProperty() @IsString() message!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() citizenId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
}
