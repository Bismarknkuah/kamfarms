import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MaintenanceType } from '@prisma/client';

export class CreateMaintenanceDto {
  @ApiProperty({ enum: MaintenanceType }) @IsEnum(MaintenanceType) type: MaintenanceType;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() scheduledDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() completedDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() technician?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) cost?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) downtimeHours?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
