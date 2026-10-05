import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideReceiptReviewDto {
  @ApiProperty({ required: false, description: 'Your comment. Required when you refuse.' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}
