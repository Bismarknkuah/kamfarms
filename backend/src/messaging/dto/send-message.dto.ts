import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty() @IsString() @MinLength(1) body: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() requiresAcknowledgment?: boolean;
}
