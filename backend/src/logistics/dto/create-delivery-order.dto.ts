import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { DeliveryPriority } from '@prisma/client';

export class CreateDeliveryOrderDto {
  @ApiProperty() @IsUuidLike() farmId: string;
  @ApiProperty() @IsUuidLike() destinationWarehouseId: string;
  @ApiProperty() @IsDateString() requestedDate: string;
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;
  @ApiProperty({ required: false, description: 'Leave blank to estimate from bag count at the standard 50 KG/bag.' })
  @IsOptional() @IsNumber() @IsPositive() totalKg?: number;
  @ApiProperty({ required: false, enum: DeliveryPriority }) @IsOptional() @IsEnum(DeliveryPriority) priority?: DeliveryPriority;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
