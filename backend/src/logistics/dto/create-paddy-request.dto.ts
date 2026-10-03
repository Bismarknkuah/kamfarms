import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreatePaddyRequestDto {
  @ApiProperty() @IsUuidLike() warehouseId: string;
  @ApiProperty() @IsUuidLike() paddyGradeId: string;
  @ApiProperty() @IsInt() @Min(1) requestedBagCount: number;
  @ApiProperty() @IsNumber() @IsPositive() requestedKg: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
