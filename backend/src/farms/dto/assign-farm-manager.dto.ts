import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignFarmManagerDto {
  @ApiProperty() @IsUUID() userId: string;
}
