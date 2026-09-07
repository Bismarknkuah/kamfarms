import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateFacilityDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ description: "e.g. 'HQ', 'MANUFACTURING', 'DEPOT'" }) @IsString() type: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() region?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() townOrArea?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() gpsAddress?: string;
}
