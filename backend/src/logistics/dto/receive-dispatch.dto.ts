import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReceiveDispatchLineDto {
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size that really arrived (0 if none did).' }) @IsInt() @Min(0) receivedBags: number;
}
export class ReceiveDispatchDto {
  @ApiProperty({ type: [ReceiveDispatchLineDto] }) @ValidateNested({ each: true }) @Type(() => ReceiveDispatchLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: ReceiveDispatchLineDto[];
  @ApiProperty({ required: false, description: 'e.g. "Good", "Wet", "Damaged bags"' }) @IsOptional() @IsString() @MaxLength(80) receivedCondition?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
