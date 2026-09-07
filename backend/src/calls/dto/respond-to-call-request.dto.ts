import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class RespondToCallRequestDto {
  @ApiProperty({ description: 'true to approve (this starts the actual call, initiated by you), false to decline.' })
  @IsBoolean() approve: boolean;
}
