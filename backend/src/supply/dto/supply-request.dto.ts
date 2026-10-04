import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { MandatoryComment } from '../../common/validators/mandatory-comment';

export class SupplyLineDto {
  @ApiProperty() @IsUuidLike({ message: 'Choose the size for every line.' }) paddyGradeId: string;
  @ApiProperty() @IsInt({ message: 'Bags must be a whole number.' }) @Min(1, { message: 'Each size needs at least 1 bag.' }) bagCount: number;
}

/** Ask for paddy: for a warehouse (warehouseId) or for a milling center (millingCenterId, which draws from its own warehouse). */
export class CreateSupplyRequestDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() warehouseId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() millingCenterId?: string;
  @ApiProperty({ type: [SupplyLineDto] })
  @ValidateNested({ each: true })
  @Type(() => SupplyLineDto)
  @ArrayMinSize(1, { message: 'Add the bags you need, for at least one size.' })
  @ArrayMaxSize(12)
  lines: SupplyLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsDateString({}, { message: 'Choose the date you need it.' }) neededBy?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
export class ForwardSupplyRequestDto { @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) note?: string; }
export class DeclineSupplyRequestDto { @ApiProperty({ description: 'Mandatory: whoever declines must say why.' }) @MandatoryComment() reason: string; }
export class AssignSupplyRequestDto {
  @ApiProperty({ description: 'The farm that will send the paddy.' }) @IsUuidLike({ message: 'Choose the farm.' }) sourceFarmId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class ReadySupplyRequestDto { @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) note?: string; }
