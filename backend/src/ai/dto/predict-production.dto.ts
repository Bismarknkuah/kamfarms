import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class PredictProductionDto {
  @ApiProperty() @IsNumber() @IsPositive() paddyKg: number;
  @ApiProperty() @IsUUID() paddyGradeId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() millingCenterId?: string;
}
