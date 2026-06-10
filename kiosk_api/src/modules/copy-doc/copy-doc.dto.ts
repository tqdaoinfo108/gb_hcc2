import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaymentMethod, CopyRequestStatus } from '@prisma/client';

// ─── Category ─────────────────────────────────────────────────────────────────

export class CreateCopyDocCategoryDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() colorHex?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiProperty() @IsNumber() pricePerCopy!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) processingFeeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) maxCopiesPerRequest?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) validityDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresStamp?: boolean;
}

export class UpdateCopyDocCategoryDto extends PartialType(CreateCopyDocCategoryDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFeeRuleDto {
  @ApiProperty() @IsString() ruleName!: string;
  @ApiProperty() @IsInt() @Min(1) minQuantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxQuantity?: number;
  @ApiProperty() @IsNumber() pricePerCopy!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feeType?: 'FIXED' | 'PROGRESSIVE' | 'EXEMPT';
  @ApiPropertyOptional() @IsOptional() effectiveFrom?: Date;
  @ApiPropertyOptional() @IsOptional() effectiveTo?: Date;
}

// ─── Copy Doc Request ─────────────────────────────────────────────────────────

export class InitiateCopyDocDto {
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty() @IsString() sessionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() citizenId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kioskDeviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) quantity?: number;
}

export class UpdateCopyRequestStatusDto {
  @ApiProperty({ enum: CopyRequestStatus }) @IsEnum(CopyRequestStatus) status!: CopyRequestStatus;
}

export class ConfirmQuantityDto {
  @ApiProperty() @IsInt() @Min(1) @Max(50) quantity!: number;
}

export class ConfirmFeeDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentRef?: string;
}

export class AdjustCornersDto {
  @ApiProperty({ description: 'Array of 4 corner points [{x, y}] normalised 0-1' })
  corners!: Array<{ x: number; y: number }>;
}

// ─── Mobile Scan ──────────────────────────────────────────────────────────────

export class MobileUploadDto {
  @ApiProperty({ description: 'Storage paths of uploaded images' })
  imagePaths!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() mobileUA?: string;
}

// ─── Print ────────────────────────────────────────────────────────────────────

export class CreatePrintJobDto {
  @ApiPropertyOptional() @IsOptional() @IsString() copyRequestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kioskDeviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobType?: 'DOCUMENT_COPY' | 'SUBMISSION_RECEIPT' | 'QUEUE_TICKET' | 'REPORT';
  @ApiPropertyOptional() @IsOptional() @IsString() filePath?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) copies?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() printerName?: string;
}

export class UpdatePrintJobDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: 'QUEUED' | 'READY_TO_PRINT' | 'PRINTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  @ApiPropertyOptional() @IsOptional() @IsString() printerStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() failReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() outputPageCount?: number;
}
