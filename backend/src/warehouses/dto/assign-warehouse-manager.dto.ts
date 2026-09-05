import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignWarehouseManagerDto {
  @ApiProperty() @IsUUID() userId: string;
}
