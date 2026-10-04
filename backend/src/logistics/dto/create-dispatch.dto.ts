import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

/** One size on the truck: which order it fulfils, and how many bags were really loaded. */
export class DispatchLineDto {
  @ApiProperty({ required: false, description: 'The order this size fulfils. Leave out to add a size the request did not ask for.' })
  @IsOptional() @IsUuidLike({ message: 'Choose the order for every line.' }) deliveryOrderId?: string;
  @ApiProperty({ required: false, description: 'The size, when there is no order for it yet: the order is made as the truck is loaded.' })
  @IsOptional() @IsUuidLike({ message: 'Choose the size for every line.' }) paddyGradeId?: string;
  @ApiProperty({ description: 'Bags of this size actually loaded.' })
  @IsInt({ message: 'Bags must be a whole number.' })
  @Min(1, { message: 'Each size needs at least 1 bag.' })
  actualBagCount: number;
  @ApiProperty({ required: false, description: 'Weighed kilograms, only if there is a scale. Leave out: it is worked out from the bags.' })
  @IsOptional() @IsNumber() @IsPositive({ message: 'Kilograms must be more than zero, or left blank.' }) actualKg?: number;
}

/**
 * ONE dispatch: one truck, one trip, with every size on it (e.g. 17 bags of Size 4 and 3 bags of Size 5), prepared by the farm manager in
 * one go and approved by the supervisor in one go. The trip's costs, driver and vehicle are entered once.
 */
export class CreateDispatchDto {
  @ApiProperty({ required: false, description: 'The request this truck fulfils (RQ-...), needed only to add a size no order exists for.' }) @IsOptional() @IsString() requestRef?: string;
  @ApiProperty({ required: false, description: 'Only for a truck loaded with no request at all: where it leaves from.' }) @IsOptional() @IsUuidLike() farmId?: string;
  @ApiProperty({ required: false, description: 'Only for a truck loaded with no request at all: where it is going.' }) @IsOptional() @IsUuidLike() destinationWarehouseId?: string;
  @ApiProperty({ type: [DispatchLineDto] })
  @ValidateNested({ each: true })
  @Type(() => DispatchLineDto)
  @ArrayMinSize(1, { message: 'Add at least one size with its bags.' })
  @ArrayMaxSize(12, { message: 'A dispatch can have at most 12 sizes.' })
  lines: DispatchLineDto[];
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
  @ApiProperty({ required: false, default: true, description: 'Send it to the supervisor for approval straight away (the default). false saves a draft.' })
  @IsOptional() @IsBoolean() submit?: boolean;
}
