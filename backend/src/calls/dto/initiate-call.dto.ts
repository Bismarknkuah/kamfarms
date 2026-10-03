import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class InitiateCallDto {
  @ApiProperty({ type: [String], description: 'Everyone else to invite - just one person for a direct call, more for a group call.' })
  @IsArray() @ArrayMinSize(1) @IsUuidLike({ each: true }) participantIds: string[];
  @ApiProperty({ required: false, enum: ['DIRECT', 'GROUP'], default: 'DIRECT' })
  @IsOptional() @IsIn(['DIRECT', 'GROUP']) type?: string;
  @ApiProperty({ required: false, description: 'Required for a GROUP call.' })
  @IsOptional() @IsString() title?: string;
}
