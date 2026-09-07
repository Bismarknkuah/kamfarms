import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreateStockTransferDto {
  @ApiProperty() @IsUUID() sourceWarehouseId: string;
  @ApiProperty() @IsUUID() destWarehouseId: string;
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() packagingSizeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() totalKg: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
