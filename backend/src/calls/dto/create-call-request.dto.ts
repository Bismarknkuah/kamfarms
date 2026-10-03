import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateCallRequestDto {
  @ApiProperty({ description: 'The MD or CEO you want to reach - a direct call to them is not allowed, only a request.' })
  @IsUuidLike() requestedToId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
