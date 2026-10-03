import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ForecastStockDto {
  @ApiProperty() @IsUuidLike() warehouseId: string;
  @ApiProperty() @IsUuidLike() productId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() packagingSizeId?: string;
}
