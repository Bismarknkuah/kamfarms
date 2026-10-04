import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReleaseSalesOrderDto {
  /** No longer used: the Warehouse Supervisor chooses the warehouse now. Accepted and ignored, so a browser still showing the old screen does not get an error. */
  @ApiProperty({ required: false, deprecated: true })
  @IsOptional()
  @IsUuidLike()
  allocatedWarehouseId?: string;

  @ApiProperty({ required: false, description: 'An optional instruction for the Warehouse Supervisor, who assigns the warehouse next.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
