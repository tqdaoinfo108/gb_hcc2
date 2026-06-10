import { IsString, IsOptional, IsInt, IsArray, IsObject, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AIJobType, JobStatus } from '@prisma/client';

// ─── Worker Registration ──────────────────────────────────────────────────────

export class RegisterAIWorkerDto {
  @ApiProperty() @IsString() workerId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() host?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() modelType?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) capabilities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class AIWorkerHeartbeatDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) activeJobs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) totalJobsHandled?: number;
  @ApiPropertyOptional() @IsOptional() avgResponseMs?: number;
  @ApiPropertyOptional() @IsOptional() errorRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateAIWorkerDto extends PartialType(RegisterAIWorkerDto) {}

// ─── AI Job ───────────────────────────────────────────────────────────────────

export class DispatchAIJobDto {
  @ApiProperty({ enum: AIJobType }) @IsEnum(AIJobType) jobType!: AIJobType;
  @ApiProperty() @IsObject() inputPayload!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conversationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredWorkerId?: string;
}

export class CompleteAIJobDto {
  @ApiProperty({ enum: JobStatus }) @IsEnum(JobStatus) status!: JobStatus;
  @ApiPropertyOptional() @IsOptional() @IsObject() outputPayload?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() modelUsed?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() tokensIn?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() tokensOut?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() responseTimeMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() failReason?: string;
}
