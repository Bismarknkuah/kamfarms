import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCallRequestDto {
  @ApiProperty({ description: 'The MD or CEO you want to reach - a direct call to them is not allowed, only a request.' })
  @IsUUID() requestedToId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
