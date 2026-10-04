import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

/** The Warehouse Supervisor's step: which warehouse will prepare and send this order. */
export class AssignWarehouseDto {
  @ApiProperty({ description: 'The warehouse the rice will be delivered from.' })
  @IsUuidLike()
  warehouseId: string;

  @ApiProperty({ required: false, description: 'An optional instruction for that warehouse\'s team.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
