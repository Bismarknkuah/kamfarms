import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateProductPriceDto {
  @ApiProperty() @IsUuidLike() productId: string;
  @ApiProperty() @IsUuidLike() packagingSizeId: string;
  @ApiProperty({ required: false, description: 'Omit for the general list price.' })
  @IsOptional()
  @IsUuidLike()
  customerId?: string;
  @ApiProperty() @IsNumber() @Min(0) pricePerBag: number;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() effectiveTo?: string;
}
