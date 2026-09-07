import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { FarmEquipmentStatus } from '@prisma/client';

export class CreateFarmEquipmentDto {
  @ApiProperty() @IsUUID() farmId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false, enum: FarmEquipmentStatus }) @IsOptional() @IsEnum(FarmEquipmentStatus) status?: FarmEquipmentStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
