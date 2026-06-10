import { FeedbackTarget } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  citizenId?: string;

  @IsEnum(FeedbackTarget)
  targetType!: FeedbackTarget;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  starRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}
