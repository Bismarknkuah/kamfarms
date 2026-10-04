import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class AssistantTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @ApiProperty() @IsString() @MaxLength(2000) text: string;
}

export class AskAssistantDto {
  @ApiProperty({ example: 'What is the current paddy stock?' })
  @IsString()
  @MinLength(3)
  @MaxLength(600)
  question: string;

  /** The earlier turns of this conversation, so a follow-up like "and last month?" makes sense. */
  @ApiProperty({ required: false, type: [AssistantTurnDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  history?: AssistantTurnDto[];
}
