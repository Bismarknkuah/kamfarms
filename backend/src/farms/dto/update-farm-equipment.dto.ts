import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FarmEquipmentStatus } from '@prisma/client';

export class UpdateFarmEquipmentDto {
  @ApiProperty({ required: false, enum: FarmEquipmentStatus }) @IsOptional() @IsEnum(FarmEquipmentStatus) status?: FarmEquipmentStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
