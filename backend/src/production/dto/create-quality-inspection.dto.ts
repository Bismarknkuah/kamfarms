import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { QualityStatus } from '@prisma/client';

export class CreateQualityInspectionDto {
  @ApiProperty() @IsString() batchNumber: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) moisturePercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() grainQuality?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) foreignMaterialPercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) brokenPercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() impurities?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() appearance?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() smell?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() qualityGrade?: string;
  @ApiProperty({ enum: QualityStatus }) @IsEnum(QualityStatus) result: QualityStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
