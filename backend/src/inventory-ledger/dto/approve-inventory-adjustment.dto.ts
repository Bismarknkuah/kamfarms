import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class ApproveInventoryAdjustmentDto {
  @ApiProperty({
    required: false,
    description: 'Overrides the originally submitted adjustmentKg, if the Farm Manager’s figure needs correcting before approval.',
  })
  @IsOptional() @IsNumber() adjustmentKg?: number;

  @ApiProperty({ required: false, description: 'Overrides the originally submitted adjustmentBags, if it needs correcting.' })
  @IsOptional() @IsInt() adjustmentBags?: number;

  @ApiProperty({ required: false, description: 'Overrides the originally submitted reason, if it needs correcting.' })
  @IsOptional() @IsString() reason?: string;
}
