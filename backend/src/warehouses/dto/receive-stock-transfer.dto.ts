import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class ReceiveStockTransferDto {
  @ApiProperty() @IsNumber() @Min(0) receivedBagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() receivedKg: number;
}
