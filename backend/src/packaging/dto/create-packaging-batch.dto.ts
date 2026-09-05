import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreatePackagingBatchDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() packagingSizeId: string;
  @ApiProperty({ description: 'Number of bags packaged.' }) @IsNumber() @Min(1) bagCount: number;
  @ApiProperty() @IsUUID() millingCenterId: string;

  @ApiProperty({
    required: false,
    description: 'Actual bulk KG consumed from the milling center. Omit if there is no packaging loss (defaults to packagingSize.sizeKg * bagCount).',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  sourceBulkKg?: number;

  @ApiProperty() @IsDateString() packagingDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
