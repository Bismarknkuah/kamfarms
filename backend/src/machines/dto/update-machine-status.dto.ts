import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MachineStatus } from '@prisma/client';

export class UpdateMachineStatusDto {
  @ApiProperty({ enum: MachineStatus }) @IsEnum(MachineStatus) status: MachineStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
