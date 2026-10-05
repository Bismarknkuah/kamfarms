import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ControlCenterService } from './control-center.service';

@ApiTags('control-center')
@ApiBearerAuth()
@Controller('control-center')
export class ControlCenterController {
  constructor(private readonly service: ControlCenterService) {}

  /** The signed-in person's own control center. The service refuses anyone whose role has none: there is no id here to change. */
  @Get()
  get(@CurrentUser() actor: AuthenticatedUser) { return this.service.forActor(actor); }
}
