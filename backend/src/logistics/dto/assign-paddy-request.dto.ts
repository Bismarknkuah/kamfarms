import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class AssignPaddyRequestDto {
  @ApiProperty() @IsUuidLike() farmId: string;
  @ApiProperty() @IsInt() @Min(1) bagCount: number;
  @ApiProperty({ required: false, description: 'Leave blank to estimate from bag count at the standard 50 KG/bag.' })
  @IsOptional() @IsNumber() @IsPositive() kg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string;
}
