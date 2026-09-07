import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSalesOrderItemDto } from './create-sales-order-item.dto';

export class CreateSalesOrderDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() preferredWarehouseId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() requestedDeliveryDate?: string;
  @ApiProperty({ required: false, description: 'Where this specific order should actually go - pre-fill from the customer\'s stored location, but editable, since a specific order can genuinely need to go somewhere else.' })
  @IsOptional() @IsString() deliveryLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [CreateSalesOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items: CreateSalesOrderItemDto[];
}
