import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class PredictEnergyDto {
  @ApiProperty() @IsNumber() @IsPositive() paddyKg: number;
  @ApiProperty() @IsUUID() machineId: string;
}
