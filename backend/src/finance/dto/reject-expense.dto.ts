import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectExpenseDto {
  @ApiProperty({ description: 'Mandatory — rejections without a reason are not allowed.' })
  @IsString()
  @MinLength(3, { message: 'A rejection reason is required.' })
  reason: string;
}
