import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateMillingCenterDto {
  @ApiProperty({ description: "Stable unique code, e.g. MILLING_WAREHOUSE_4" })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case' })
  code: string;

  @ApiProperty() @IsString() name: string;
}
