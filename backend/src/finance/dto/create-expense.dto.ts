import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() farmId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() warehouseId?: string;
  @ApiProperty({ required: false, enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reference?: string;
  @ApiProperty({ required: false, description: 'Only meaningful when categoryId points to the "Other" category.' })
  @IsOptional() @IsString() customCategoryLabel?: string;
  @ApiProperty({ required: false, description: 'What was physically received, if this expense was for a purchase.' })
  @IsOptional() @IsString() itemDescription?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
