import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class PredictProductionDto {
  @ApiProperty() @IsNumber() @IsPositive() paddyKg: number;
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() millingCenterId?: string;
}
