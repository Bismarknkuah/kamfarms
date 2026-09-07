import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CloneRoleDto {
  @ApiProperty({ description: 'New unique code for the cloned role.' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code must be upper snake case' })
  newCode: string;

  @ApiProperty() @IsString() newName: string;
}
