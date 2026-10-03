import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateStockTransferDto {
  @ApiProperty() @IsUuidLike() sourceWarehouseId: string;
  @ApiProperty() @IsUuidLike() destWarehouseId: string;
  @ApiProperty() @IsUuidLike() productId: string;
  @ApiProperty() @IsUuidLike() packagingSizeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() totalKg: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
