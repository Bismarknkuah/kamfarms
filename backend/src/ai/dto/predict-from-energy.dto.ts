import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class PredictFromEnergyDto {
  @ApiProperty({ description: 'Electricity used, in kWh.' }) @IsNumber() @IsPositive() @Max(1_000_000) kwh: number;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyGradeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() millingCenterId?: string;
}
