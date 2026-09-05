import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateProductPriceDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() packagingSizeId: string;
  @ApiProperty({ required: false, description: 'Omit for the general list price.' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
  @ApiProperty() @IsNumber() @Min(0) pricePerBag: number;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() effectiveTo?: string;
}
