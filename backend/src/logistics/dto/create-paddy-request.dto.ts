import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaddyRequestDto {
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsUUID() paddyGradeId: string;
  @ApiProperty() @IsInt() @Min(1) requestedBagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() requestedKg: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
