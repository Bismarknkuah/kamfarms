import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AnnotateFulfillmentSourceDto {
  @ApiProperty({ type: [String], description: 'Packaging batch numbers this line item was actually fulfilled from.' })
  @IsArray()
  @IsString({ each: true })
  sourceReferenceNumbers: string[];
}
