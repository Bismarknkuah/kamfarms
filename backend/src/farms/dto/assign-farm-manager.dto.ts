import { ApiProperty } from '@nestjs/swagger';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class AssignFarmManagerDto {
  @ApiProperty() @IsUuidLike() userId: string;
}
