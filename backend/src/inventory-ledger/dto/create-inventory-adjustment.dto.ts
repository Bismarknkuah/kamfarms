import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { LocationType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ enum: LocationType }) @IsEnum(LocationType) locationType: LocationType;
  @ApiProperty() @IsUuidLike() locationId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() productId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() packagingSizeId?: string;
  @ApiProperty({ description: 'Signed - negative for a shortage, positive for found stock.' }) @IsNumber() adjustmentKg: number;
  @ApiProperty({ description: 'Signed, matching adjustmentKg’s direction.' }) @IsInt() adjustmentBags: number;
  @ApiProperty() @IsString() reason: string;
}
