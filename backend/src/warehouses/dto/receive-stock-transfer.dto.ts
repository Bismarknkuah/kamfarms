import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class ReceiveStockTransferDto {
  @ApiProperty() @IsNumber() @Min(0) receivedBagCount: number;
  @ApiProperty({ required: false, description: 'Leave out: it is the bags received times the size of the pack.' })
  @IsOptional() @IsNumber() @IsPositive() receivedKg?: number;
}
