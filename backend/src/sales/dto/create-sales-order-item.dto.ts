import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateSalesOrderItemDto {
  @ApiProperty() @IsUuidLike() productId: string;
  @ApiProperty() @IsUuidLike() packagingSizeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;

  @ApiProperty({ required: false, description: 'Overrides the looked-up price list rate if provided.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
