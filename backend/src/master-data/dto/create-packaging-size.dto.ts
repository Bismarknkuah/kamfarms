import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class CreatePackagingSizeDto {
  @ApiProperty({ example: '5KG' }) @IsString() label: string;
  @ApiProperty({ example: 5 }) @IsNumber() @Min(0.001) sizeKg: number;
}
