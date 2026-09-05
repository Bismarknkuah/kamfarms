import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsString, MinLength } from 'class-validator';
import { ResetType } from '@prisma/client';

export class CreateResetRequestDto {
  @ApiProperty({ enum: ResetType }) @IsEnum(ResetType) resetType: ResetType;
  @ApiProperty({ description: 'Human-readable description of what this affects.' })
  @IsString()
  @MinLength(10)
  scope: string;

  @ApiProperty({
    type: [String],
    description: 'Exact model/table names in scope, e.g. ["InventoryTransaction", "InventoryBalance"]. Frozen at request time.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  affectedTables: string[];

  @ApiProperty() @IsString() @MinLength(10) reason: string;
  @ApiProperty() @IsString() @MinLength(10) impactDescription: string;
}
