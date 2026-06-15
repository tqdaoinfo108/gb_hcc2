import {
  IsString, IsOptional, IsEnum, IsInt, IsArray, IsObject, IsBoolean, IsNumber, Min, Max, MaxLength,
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
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
}

/** CMS: save the citizen chatbot configuration (singleton). */
export class UpdateChatbotConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) systemPrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) welcomeMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) fallbackMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(64) @Max(8192) maxTokens?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) suggestedQuestions?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeProcedureContext?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryRunnerId?: string | null;
}
