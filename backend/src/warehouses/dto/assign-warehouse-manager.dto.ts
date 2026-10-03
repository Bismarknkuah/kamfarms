import { ApiProperty } from '@nestjs/swagger';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class AssignWarehouseManagerDto {
  @ApiProperty() @IsUuidLike() userId: string;
}
