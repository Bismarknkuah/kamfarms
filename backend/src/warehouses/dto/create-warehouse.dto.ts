import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ description: "Stable unique code, e.g. WAREHOUSE_4", example: 'WAREHOUSE_4' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case, e.g. WAREHOUSE_4' })
  code: string;

  @ApiProperty({ example: 'Warehouse 4' }) @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() location?: string;
}
