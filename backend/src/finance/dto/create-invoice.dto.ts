import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Must be a FULFILLED sales order.' })
  @IsUuidLike()
  salesOrderId: string;

  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiProperty({ required: false, default: 0, description: 'Percent, e.g. 0 or 15 - never hard-coded.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRatePercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueDate?: string;
}
