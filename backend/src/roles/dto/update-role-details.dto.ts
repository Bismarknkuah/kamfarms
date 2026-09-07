import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateRoleDetailsDto {
  @ApiProperty({ required: false, description: 'The human-readable name shown throughout the app, e.g. "Farm Manager".' })
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}
