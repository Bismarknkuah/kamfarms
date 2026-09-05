import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { LocationType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ enum: LocationType }) @IsEnum(LocationType) locationType: LocationType;
  @ApiProperty() @IsUUID() locationId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() productId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() packagingSizeId?: string;
  @ApiProperty({ description: 'Signed — negative for a shortage, positive for found stock.' }) @IsNumber() adjustmentKg: number;
  @ApiProperty({ description: 'Signed, matching adjustmentKg\u2019s direction.' }) @IsInt() adjustmentBags: number;
  @ApiProperty() @IsString() reason: string;
}
