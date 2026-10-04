import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelSalesOrderDto {
  @ApiProperty({ required: false, description: 'Why the order is being cancelled; shown in the activity trail.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
