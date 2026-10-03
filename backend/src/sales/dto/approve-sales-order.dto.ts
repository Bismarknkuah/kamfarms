import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The Finance Director's decision is purely financial. Which warehouse
 * the rice leaves from is a delivery decision made later, by the Managing
 * Director at the release step - so no warehouse is asked for here. (The
 * previous version required one and the UI never sent it, so approval
 * could not succeed.) */
export class ApproveSalesOrderDto {
  @ApiProperty({ required: false, description: 'An optional remark passed on to the Managing Director, e.g. "50% deposit received".' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
