import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSalesOrderItemDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() packagingSizeId: string;
  @ApiProperty() @IsNumber() @Min(1) bagCount: number;

  @ApiProperty({ required: false, description: 'Overrides the looked-up price list rate if provided.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
