import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Max } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class PredictFromPaddyDto {
  @ApiProperty({ description: 'Bags of paddy to be milled.' }) @IsInt() @IsPositive() @Max(1_000_000) bags: number;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() millingCenterId?: string;
}
