import { ApiProperty } from '@nestjs/swagger';
import { MandatoryComment } from '../../common/validators/mandatory-comment';

export class RejectDeliveryReportDto {
  @ApiProperty({ description: 'Mandatory: whoever rejects must say why.' })
  @MandatoryComment()
  reason: string;
}
