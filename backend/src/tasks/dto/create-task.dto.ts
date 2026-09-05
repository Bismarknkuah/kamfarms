import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DeliveryPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty() @IsString() @MinLength(3) title: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;

  @ApiProperty({ required: false, description: 'Assign to a specific user.' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiProperty({ required: false, description: 'Or assign to any holder of this role code, e.g. WAREHOUSE_MANAGER.' })
  @IsOptional()
  @IsString()
  assignedRoleCode?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsUUID() farmId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() warehouseId?: string;
  @ApiProperty({ required: false, enum: DeliveryPriority }) @IsOptional() @IsEnum(DeliveryPriority) priority?: DeliveryPriority;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueDate?: string;
}
