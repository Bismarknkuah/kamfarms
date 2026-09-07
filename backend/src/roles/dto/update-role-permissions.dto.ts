import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'Full replacement set of permission codes for this role.' })
  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}
