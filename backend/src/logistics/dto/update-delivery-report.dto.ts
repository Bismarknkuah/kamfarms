import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UpdateDeliveryReportDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(1) actualBagCount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @IsPositive() actualKg?: number;

  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) labourCost?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) numberOfLabourers?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) costPerLabourer?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) transportationFee?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) otherCosts?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() otherCostsDescription?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() vehiclePlateNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() vehicleType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() driverName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() driverPhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() driverLicenseNumber?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsDateString() departureDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() departureTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() expectedArrivalTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() loadingLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() destinationLocationText?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remarks?: string;
}
