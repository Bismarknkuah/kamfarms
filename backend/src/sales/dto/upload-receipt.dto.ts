import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The fields sent alongside an uploaded receipt file. */
export class UploadReceiptDto {
  @ApiProperty({ required: false, description: 'What the receipt is for, e.g. "50% deposit, mobile money".' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
