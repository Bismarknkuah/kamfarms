import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class SendPaddyLineDto {
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size going on the truck.' }) @IsInt() @IsPositive() bags: number;
}
export class SendPaddyTransferDto {
  @ApiProperty() @IsUuidLike() fromWarehouseId: string;
  @ApiProperty() @IsUuidLike() toWarehouseId: string;
  @ApiProperty({ type: [SendPaddyLineDto], description: 'Size 4, Size 5 (or any other size), in bags. Kilograms are never asked for.' })
  @ValidateNested({ each: true }) @Type(() => SendPaddyLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: SendPaddyLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) vehiclePlate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ required: false, description: 'The paddy request (SR-...) this paddy is for, when the Farm Director gave it to this warehouse.' })
  @IsOptional() @IsString() @MaxLength(40) supplyRequestNumber?: string;
}
export class ReceivePaddyLineDto {
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size that actually arrived (0 if none did).' }) @IsInt() @Min(0) bags: number;
}
export class ReceivePaddyTransferDto {
  @ApiProperty({ type: [ReceivePaddyLineDto] }) @ValidateNested({ each: true }) @Type(() => ReceivePaddyLineDto) @ArrayMinSize(1) @ArrayMaxSize(12) lines: ReceivePaddyLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class CancelPaddyTransferDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
