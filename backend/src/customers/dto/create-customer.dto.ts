import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() company?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() location?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() idOrBusinessRef?: string;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentTerms?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
