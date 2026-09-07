import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RejectInventoryAdjustmentDto {
  @ApiProperty() @IsString() reason: string;
}
