import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { DeliveryPriority } from '@prisma/client';

export class CreateDeliveryOrderDto {
  @ApiProperty() @IsUUID() farmId: string;
  @ApiProperty() @IsUUID() destinationWarehouseId: string;
  @ApiProperty() @IsDateString() requestedDate: string;
  @ApiProperty() @IsUUID() paddyGradeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() totalKg: number;
  @ApiProperty({ required: false, enum: DeliveryPriority }) @IsOptional() @IsEnum(DeliveryPriority) priority?: DeliveryPriority;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
