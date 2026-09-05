import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ApproveSalesOrderDto {
  @ApiProperty({ required: false, description: 'Warehouse to fulfill from; defaults to the customer-preferred warehouse.' })
  @IsOptional()
  @IsUUID()
  allocatedWarehouseId?: string;
}
