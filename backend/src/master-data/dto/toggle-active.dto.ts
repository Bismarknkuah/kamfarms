import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleActiveDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}
