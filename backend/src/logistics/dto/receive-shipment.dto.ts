import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReceiveShipmentDto {
  @ApiProperty() @IsNumber() @Min(0) receivedKg: number;
  @ApiProperty() @IsNumber() @Min(0) receivedBags: number;
  @ApiProperty({ required: false, description: 'e.g. "Good", "Wet", "Damaged bags"' }) @IsOptional() @IsString() receivedCondition?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) receivedMoisturePercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
