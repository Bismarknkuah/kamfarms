import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from 'class-validator';

export class PaddyMillingReceiptLineDto {
  @ApiProperty() @IsUUID() paddyGradeId: string;
  @ApiProperty() @IsInt() @IsPositive() bagCount: number;
  @ApiProperty({ required: false, description: 'Leave blank to estimate from bag count at the standard 50 KG/bag.' })
  @IsOptional() @IsNumber() @IsPositive() kg?: number;
}

export class CreatePaddyMillingReceiptDto {
  @ApiProperty() @IsUUID() millingCenterId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ type: [PaddyMillingReceiptLineDto], description: 'One line per paddy grade received today - Size 4 and Size 5 can both be confirmed in the same submission.' })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PaddyMillingReceiptLineDto)
  lines: PaddyMillingReceiptLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
