import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class PredictEnergyDto {
  @ApiProperty() @IsNumber() @IsPositive() paddyKg: number;
  @ApiProperty() @IsUuidLike() machineId: string;
}
