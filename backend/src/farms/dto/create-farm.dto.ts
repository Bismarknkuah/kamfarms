import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateFarmDto {
  @ApiProperty({ description: "Stable unique code, e.g. FARM_G", example: 'FARM_G' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case, e.g. FARM_G' })
  code: string;

  @ApiProperty({ example: 'Farm G' }) @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() location?: string;
}
