import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { Shift } from '@prisma/client';

export class CreateProductionRecordDto {
  @ApiProperty() @IsUUID() millingCenterId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() machineId?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ required: false, enum: Shift }) @IsOptional() @IsEnum(Shift) shift?: Shift;
  @ApiProperty() @IsUUID() paddyGradeId: string;

  @ApiProperty() @IsNumber() @IsPositive() paddyProcessedKg: number;
  @ApiProperty({ required: false, description: 'Bags, not just KG - the real unit actually used day to day.' }) @IsOptional() @IsNumber() @IsPositive() paddyProcessedBags?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) startingKg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) endingKg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) processingDurationMin?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) machineRuntimeMin?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) energyConsumptionKwh?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) electricityMeterOpening?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) electricityMeterClosing?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) waterConsumption?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) fuelConsumption?: number;

  @ApiProperty() @IsNumber() @Min(0) recoveredRiceKg: number;
  @ApiProperty() @IsNumber() @Min(0) brokenRiceKg: number;
  @ApiProperty() @IsNumber() @Min(0) riceHullKg: number;
  @ApiProperty({ required: false, description: 'Bags, not just KG - the real unit hulls are actually counted in.' }) @IsOptional() @IsInt() @Min(0) riceHullBags?: number;
  @ApiProperty() @IsNumber() @Min(0) wasteLossKg: number;

  @ApiProperty({ required: false }) @IsOptional() @IsString() remarks?: string;
  @ApiProperty({
    required: false,
    type: [String],
    description: 'Shipment/delivery reference numbers whose paddy contributed to this run, if known - recorded for traceability, not automatically derived.',
  })
  @IsOptional() @IsArray() @IsString({ each: true }) sourceReferenceNumbers?: string[];
}
