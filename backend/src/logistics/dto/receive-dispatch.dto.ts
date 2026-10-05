import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReceiveDispatchLineDto {
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size that really arrived (0 if none did).' }) @IsInt() @Min(0) receivedBags: number;
  @ApiProperty({ required: false, description: 'Of those, how many are spoiled or broken.' }) @IsOptional() @IsInt() @Min(0) damagedBags?: number;
}
export class ReceiveDispatchDto {
  @ApiProperty({ type: [ReceiveDispatchLineDto] }) @ValidateNested({ each: true }) @Type(() => ReceiveDispatchLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: ReceiveDispatchLineDto[];
  @ApiProperty({ required: false, description: 'e.g. "Good", "Wet", "Damaged bags"' }) @IsOptional() @IsString() @MaxLength(80) receivedCondition?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ required: false, description: 'What is wrong with the spoiled or broken bags. Required when any are damaged.' }) @IsOptional() @IsString() @MaxLength(500) damageNote?: string;
}
