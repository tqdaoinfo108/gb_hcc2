import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateProcedureDto {
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() processingAgency?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365) slaWorkDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fee?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feeNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOnline?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProcedureDto extends PartialType(CreateProcedureDto) {}

export class CreateCategoryDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() colorHex?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
