import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsString() transactionReference?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() bank?: string;
  @ApiProperty() @IsDateString() paymentDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;

  @ApiProperty({
    required: false,
    description: 'Invoice ids to apply this payment to immediately, with amounts. If omitted, the payment is recorded unallocated (customer credit) until verified/allocated separately.',
    type: 'array',
  })
  @IsOptional()
  allocations?: { invoiceId: string; amount: number }[];
}
