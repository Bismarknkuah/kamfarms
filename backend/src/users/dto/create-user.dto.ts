import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() employeeNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() departmentId?: string;

  @ApiProperty({ description: 'Temporary password; user must change on first login.' })
  @IsString()
  @MinLength(10)
  temporaryPassword: string;

  @ApiProperty({ type: [String], description: 'Role codes to assign immediately, e.g. ["FARM_MANAGER"].', required: false })
  @IsOptional()
  @IsArray()
  roleCodes?: string[];
}
