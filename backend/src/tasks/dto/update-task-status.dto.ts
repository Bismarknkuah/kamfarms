import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus }) @IsEnum(TaskStatus) status: TaskStatus;
  @ApiProperty({ required: false, description: 'Required when status is COMPLETED.' })
  @IsOptional()
  @IsString()
  completionEvidence?: string;
  @ApiProperty({ required: false, description: 'A link to the actual document/report, if one applies - Drive, Dropbox, etc.' })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
