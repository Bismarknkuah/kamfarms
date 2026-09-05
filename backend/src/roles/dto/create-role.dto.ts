import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: 'Stable unique code, upper snake case, e.g. REGIONAL_SALES_LEAD' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case, e.g. REGIONAL_SALES_LEAD' })
  code: string;

  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;

  @ApiProperty({ type: [String], required: false, description: 'Permission codes to grant immediately.' })
  @IsOptional()
  @IsArray()
  permissionCodes?: string[];
}
