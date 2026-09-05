import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'One-time reset token sent to the user.' })
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(10, { message: 'New password must be at least 10 characters.' })
  newPassword: string;
}
