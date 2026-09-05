import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaddyEntryDto {
  @ApiProperty() @IsUUID() farmId: string;
  @ApiProperty({ example: '2026-09-01' }) @IsDateString() entryDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() paddyTypeId?: string;
  @ApiProperty() @IsUUID() paddyGradeId: string;

  @ApiProperty({
    required: false,
    description:
      'Actual kilograms, if a scale is available. Most farms don\u2019t have one on-site — leave this out and ' +
      'it will be estimated from bag count instead, clearly flagged as an estimate rather than a measurement.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @ApiProperty({ description: 'Always required — this is what a farm without a scale can actually count.' })
  @IsNumber()
  @Min(1)
  bagCount: number;

  @ApiProperty({ required: false, description: 'Percent moisture, e.g. 13.5' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @ApiProperty({ required: false }) @IsOptional() @IsString() qualityGrade?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() harvestDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() supplierName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storageLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
