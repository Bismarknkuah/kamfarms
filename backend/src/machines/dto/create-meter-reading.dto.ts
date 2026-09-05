import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Shift } from '@prisma/client';

export class CreateMeterReadingDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ required: false, enum: Shift }) @IsOptional() @IsEnum(Shift) shift?: Shift;
  @ApiProperty({
    description:
      "The meter's current cumulative reading, read directly off the machine right now. That's the only " +
      "number you need — the system already knows the last reading it has on file for this machine and " +
      'works out the opening reading and consumption automatically, so nothing has to be typed twice.',
  })
  @IsNumber()
  @Min(0)
  currentReading: number;
  @ApiProperty({ required: false, default: 'kWh' }) @IsOptional() @IsString() unit?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
