import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReleaseSalesOrderDto {
  @ApiProperty({ required: false, description: 'Warehouse the rice will be delivered from; defaults to the order\'s preferred warehouse if it has one.' })
  @IsOptional()
  @IsUuidLike()
  allocatedWarehouseId?: string;

  @ApiProperty({ required: false, description: 'An optional instruction for the Warehouse Supervisor.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
