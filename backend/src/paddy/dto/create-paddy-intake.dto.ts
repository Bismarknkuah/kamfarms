import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

/** One size in an intake: "17 bags of Size 4". */
export class PaddyIntakeLineDto {
  @ApiProperty() @IsUuidLike({ message: 'Choose the size for every line.' }) paddyGradeId: string;
  @ApiProperty({ description: 'Bags of this size. Always required: it is what can be counted.' })
  @IsInt({ message: 'Bags must be a whole number.' })
  @Min(1, { message: 'Each size needs at least 1 bag.' })
  bagCount: number;
  @ApiProperty({ required: false, description: 'Kilograms, only if this size was weighed. Leave out when there is no scale.' })
  @IsOptional() @IsNumber() @IsPositive({ message: 'Kilograms must be more than zero, or left blank.' }) weightKg?: number;
}

/**
 * ONE intake of paddy, with every size that arrived, saved together: all of it or none of it. e.g. 17 bags of Size 4 and 3 bags of Size 5.
 * Each size becomes its own entry (so each keeps its own approval), tied together by one intake reference.
 */
export class CreatePaddyIntakeDto {
  @ApiProperty() @IsUuidLike({ message: 'Choose the farm.' }) farmId: string;
  @ApiProperty({ example: '2026-09-01' }) @IsDateString({}, { message: 'Enter the date of the intake.' }) entryDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUuidLike() paddyTypeId?: string;
  @ApiProperty({ type: [PaddyIntakeLineDto], description: 'One line per size.' })
  @ValidateNested({ each: true })
  @Type(() => PaddyIntakeLineDto)
  @ArrayMinSize(1, { message: 'Add at least one size, with its bags.' })
  @ArrayMaxSize(12, { message: 'An intake can have at most 12 sizes.' })
  lines: PaddyIntakeLineDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) moisturePercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() qualityGrade?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() harvestDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() supplierName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storageLocation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false, default: true, description: 'Send it for approval straight away (the default). false saves it as a draft.' })
  @IsOptional() @IsBoolean() submit?: boolean;
}
