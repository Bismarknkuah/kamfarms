import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class UpdatePaddyEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() entryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyTypeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @IsPositive() weightKg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(1) bagCount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) moisturePercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() qualityGrade?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() harvestDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() supplierName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storageLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
