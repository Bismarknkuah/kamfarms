import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetRoleFeaturesDto {
  @ApiProperty({ type: [String], description: 'Every feature switched off for the role (the full list: it replaces the previous one).' }) @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) denied: string[];
}
