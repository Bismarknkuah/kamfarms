import { ApiProperty } from '@nestjs/swagger';
import { DeliveryPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class DispatchRequestLineDto {
  @ApiProperty() @IsUuidLike({ message: 'Choose the size for every line.' }) paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size to dispatch.' })
  @IsInt({ message: 'Bags must be a whole number.' })
  @Min(1, { message: 'Each size needs at least 1 bag.' })
  bagCount: number;
  @ApiProperty({ required: false, description: 'Only if weighed. Leave out: it is worked out from the bags.' })
  @IsOptional() @IsNumber() @IsPositive({ message: 'Kilograms must be more than zero, or left blank.' }) totalKg?: number;
}

/**
 * A Farm Supervisor's request to a farm manager: send these bags, of these sizes, from this farm to THIS warehouse, by this date. It becomes
 * one delivery order per size (tied together by one request reference) and ONE task on the farm manager's list, with everything spelled out.
 */
export class CreateDispatchRequestDto {
  @ApiProperty() @IsUuidLike({ message: 'Choose the farm.' }) farmId: string;
  @ApiProperty() @IsUuidLike({ message: 'Choose the warehouse the bags must go to.' }) destinationWarehouseId: string;
  @ApiProperty({ example: '2026-10-09', description: 'The date the bags are needed at the warehouse.' }) @IsDateString({}, { message: 'Choose the date the bags are needed at the warehouse.' }) requestedDate: string;
  @ApiProperty({ required: false, enum: DeliveryPriority }) @IsOptional() @IsEnum(DeliveryPriority) priority?: DeliveryPriority;
  @ApiProperty({ required: false, description: 'Instructions for the farm manager.' }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ type: [DispatchRequestLineDto] })
  @ValidateNested({ each: true })
  @Type(() => DispatchRequestLineDto)
  @ArrayMinSize(1, { message: 'Add at least one size with its bags.' })
  @ArrayMaxSize(12, { message: 'A request can have at most 12 sizes.' })
  lines: DispatchRequestLineDto[];
}
