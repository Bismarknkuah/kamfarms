import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ForecastStockDto {
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() packagingSizeId?: string;
}
