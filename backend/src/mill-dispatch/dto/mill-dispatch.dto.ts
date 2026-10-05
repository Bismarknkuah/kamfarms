import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export const LINE_KINDS = ['PADDY', 'PACKAGED_RICE', 'BROKEN_RICE', 'RICE_HULL'];
export class MillDispatchLineDto {
  @ApiProperty({ enum: LINE_KINDS }) @IsIn(LINE_KINDS) kind: 'PADDY' | 'PACKAGED_RICE' | 'BROKEN_RICE' | 'RICE_HULL';
  @ApiProperty({ required: false, description: 'The size of paddy (paddy only).' }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false, description: 'The rice product (packaged rice only).' }) @IsOptional() @IsUuidLike() productId?: string;
  @ApiProperty({ required: false, description: 'The pack size (packaged rice only).' }) @IsOptional() @IsUuidLike() packagingSizeId?: string;
  @ApiProperty({ required: false, description: 'Bags (paddy and packaged rice).' }) @IsOptional() @IsInt() @Min(1) bags?: number;
  @ApiProperty({ required: false, description: 'Kilograms (broken rice and hull only).' }) @IsOptional() @IsNumber() @Min(0.01) kg?: number;
}
export class CreateMillDispatchDto {
  @ApiProperty({ enum: ['TO_MILL', 'TO_WAREHOUSE'] }) @IsIn(['TO_MILL', 'TO_WAREHOUSE']) direction: 'TO_MILL' | 'TO_WAREHOUSE';
  @ApiProperty({ description: 'The milling center. Its own warehouse is the other end.' }) @IsUuidLike() millingCenterId: string;
  @ApiProperty({ type: [MillDispatchLineDto] }) @ValidateNested({ each: true }) @Type(() => MillDispatchLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: MillDispatchLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) vehiclePlate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class DecideMillDispatchDto { @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) note?: string }
export class RejectMillDispatchDto { @ApiProperty({ description: 'Why it is not approved.' }) @IsString() @MinLength(3) @MaxLength(300) reason: string }
export class ReceiveMillDispatchLineDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty({ required: false, description: 'Bags that arrived (paddy and packaged rice).' }) @IsOptional() @IsInt() @Min(0) bags?: number;
  @ApiProperty({ required: false, description: 'Kilograms that arrived (broken rice and hull).' }) @IsOptional() @IsNumber() @Min(0) kg?: number;
}
export class ReceiveMillDispatchDto {
  @ApiProperty({ type: [ReceiveMillDispatchLineDto] }) @ValidateNested({ each: true }) @Type(() => ReceiveMillDispatchLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: ReceiveMillDispatchLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
