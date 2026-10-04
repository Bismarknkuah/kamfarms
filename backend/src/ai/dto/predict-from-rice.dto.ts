import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

/** Packaged rice that came out of the mill (or is wanted from it): give it in bags or as a weight in kg. */
export class PredictFromRiceDto {
  @ApiProperty({ required: false, description: 'Bags of packaged rice recovered, or wanted.' }) @IsOptional() @IsNumber() @IsPositive() @Max(1_000_000) bags?: number;
  @ApiProperty({ required: false, description: 'Or the same, as a weight in kg.' }) @IsOptional() @IsNumber() @IsPositive() @Max(100_000_000) kg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() millingCenterId?: string;
}
