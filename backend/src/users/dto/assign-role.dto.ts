import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ScopeType } from '@prisma/client';

export class ScopeInputDto {
  @ApiProperty({ enum: ScopeType }) @IsEnum(ScopeType) scopeType: ScopeType;
  @ApiProperty({ required: false, description: 'Entity id this scope applies to; omit for GLOBAL.' })
  @IsOptional()
  @IsString()
  scopeId?: string;
}

export class AssignRoleDto {
  @ApiProperty() @IsString() roleCode: string;

  @ApiProperty({ type: [ScopeInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScopeInputDto)
  scopes?: ScopeInputDto[];
}
