import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreatePaddyGradeDto {
  @ApiProperty({ example: 'SIZE_6' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case, e.g. SIZE_6' })
  code: string;

  @ApiProperty({ example: 'Size 6' }) @IsString() label: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}
