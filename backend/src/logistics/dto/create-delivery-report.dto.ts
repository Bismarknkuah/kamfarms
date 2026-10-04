import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateDeliveryReportDto {
  @ApiProperty() @IsUuidLike() deliveryOrderId: string;
  @ApiProperty() @IsNumber() @Min(1) actualBagCount: number;
  @ApiProperty({ required: false, description: 'Weighed kilograms, only if there is a scale. Leave out when the bags were counted: it is then worked out from the bags and marked as an estimate.' })
  @IsOptional() @IsNumber() @IsPositive() actualKg?: number;

  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) labourCost?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) numberOfLabourers?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) costPerLabourer?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) transportationFee?: number;
  @ApiProperty({ required: false, description: 'Anything beyond labour and transport - tolls, loading fees, etc.' })
  @IsOptional() @IsNumber() @Min(0) otherCosts?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() otherCostsDescription?: string;

  @ApiProperty({ required: false, description: 'Plate number - a Vehicle record is created/reused automatically.' })
  @IsOptional() @IsString() vehiclePlateNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() vehicleType?: string;
  @ApiProperty({ required: false, description: 'A Driver record is created/reused automatically by name+phone.' })
  @IsOptional() @IsString() driverName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() driverPhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() driverLicenseNumber?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsDateString() departureDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() departureTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() expectedArrivalTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() loadingLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() destinationLocationText?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remarks?: string;
}
