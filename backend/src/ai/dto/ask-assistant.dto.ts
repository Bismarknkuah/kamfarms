import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AskAssistantDto {
  @ApiProperty({ example: 'What is the current paddy stock?' })
  @IsString()
  @MinLength(3)
  question: string;
}
