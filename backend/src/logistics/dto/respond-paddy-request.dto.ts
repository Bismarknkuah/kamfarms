import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class RespondPaddyRequestDto {
  @ApiProperty({ enum: ['ACCEPTED', 'DECLINED'] }) @IsIn(['ACCEPTED', 'DECLINED']) decision: 'ACCEPTED' | 'DECLINED';
  @ApiProperty({ required: false, description: 'An ETA if accepting, or a reason if declining.' })
  @IsOptional()
  @IsString()
  responseNote?: string;
}
