import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Moving an order "on track": it has left the warehouse. All of this is optional, but it is what the Sales Officer tells the customer. */
export class DispatchSalesOrderDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @ApiProperty({ required: false, description: 'When the customer should expect it.' }) @IsOptional() @IsDateString() expectedDeliveryAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) note?: string;
}
