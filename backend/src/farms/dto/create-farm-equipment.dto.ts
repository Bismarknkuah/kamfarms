import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { FarmEquipmentStatus } from '@prisma/client';

export class CreateFarmEquipmentDto {
  @ApiProperty() @IsUuidLike() farmId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false, enum: FarmEquipmentStatus }) @IsOptional() @IsEnum(FarmEquipmentStatus) status?: FarmEquipmentStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
