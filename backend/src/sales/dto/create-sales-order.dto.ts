import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { Type } from 'class-transformer';
import { CreateSalesOrderItemDto } from './create-sales-order-item.dto';

export class CreateSalesOrderDto {
  @ApiProperty() @IsUuidLike() customerId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() preferredWarehouseId?: string;
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
