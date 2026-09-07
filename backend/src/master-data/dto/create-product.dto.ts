import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Pectra Rice' }) @IsString() name: string;
  @ApiProperty({ required: false, example: 'Superfine Perfumed Rice' }) @IsOptional() @IsString() description?: string;
}
