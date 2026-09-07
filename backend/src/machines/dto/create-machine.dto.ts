import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMachineDto {
  @ApiProperty({ example: 'MC-M1' }) @IsString() machineCode: string;
  @ApiProperty() @IsString() machineName: string;
  @ApiProperty() @IsUUID() millingCenterId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() type?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() manufacturer?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() model?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() serialNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() installationDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) ratedCapacity?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() meterType?: string;
}
