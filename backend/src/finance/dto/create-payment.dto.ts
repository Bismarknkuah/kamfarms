import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty() @IsUuidLike() customerId: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsString() transactionReference?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() bank?: string;
  @ApiProperty() @IsDateString() paymentDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false, description: 'A link to evidence of the payment (bank slip, mobile money confirmation, etc.) - no file upload, since this project has no live storage backend.' })
  @IsOptional() @IsString() receiptUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Invoice ids to apply this payment to immediately, with amounts. If omitted, the payment is recorded unallocated (customer credit) until verified/allocated separately.',
    type: 'array',
  })
  @IsOptional()
  allocations?: { invoiceId: string; amount: number }[];
}
