import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { Shift } from '@prisma/client';

export class CreateProductionRecordDto {
  @ApiProperty() @IsUUID() millingCenterId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() machineId?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ required: false, enum: Shift }) @IsOptional() @IsEnum(Shift) shift?: Shift;
  @ApiProperty() @IsUUID() paddyGradeId: string;

  @ApiProperty() @IsNumber() @IsPositive() paddyProcessedKg: number;
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
  @ApiProperty() @IsNumber() @Min(0) wasteLossKg: number;

  @ApiProperty({ required: false }) @IsOptional() @IsString() remarks?: string;
}
