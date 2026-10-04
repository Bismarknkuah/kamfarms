import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A step that needs no decision, only an optional note for the record (starting to process, confirming delivery). */
export class StepNoteDto {
  @ApiProperty({ required: false, description: 'Optional, e.g. who received the delivery.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
