import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SupplyRequestsService } from './supply-requests.service';
import { PaddyWhereaboutsService } from './paddy-whereabouts.service';
import { AssignSupplyRequestDto, CreateSupplyRequestDto, DeclineSupplyRequestDto, ForwardSupplyRequestDto, ReadySupplyRequestDto } from './dto/supply-request.dto';

@ApiTags('supply-requests')
@ApiBearerAuth()
@Controller('supply-requests')
export class SupplyRequestsController {
  constructor(private readonly supply: SupplyRequestsService, private readonly whereabouts: PaddyWhereaboutsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SUPPLY_VIEW)
  board(@CurrentUser() actor: AuthenticatedUser) { return this.supply.board(actor); }

  /** Where the paddy is right now: each farm, on the road, each warehouse, each mill. Each person sees their own places. */
  @Get('whereabouts')
  @RequirePermission([PERMISSIONS.SUPPLY_VIEW, PERMISSIONS.FARM_INVENTORY_VIEW, 'warehouse.inventory.view'])
  paddyWhereabouts(@CurrentUser() actor: AuthenticatedUser) { return this.whereabouts.whereabouts(actor); }

  @Post()
  @RequirePermission(PERMISSIONS.SUPPLY_REQUEST)
  create(@Body() dto: CreateSupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.create(dto, actor); }

  @Get(':id/sources')
  @RequirePermission([PERMISSIONS.SUPPLY_FORWARD, PERMISSIONS.SUPPLY_FULFIL])
  sources(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.supply.sources(id, actor); }

  @Post(':id/forward')
  @RequirePermission(PERMISSIONS.SUPPLY_FORWARD)
  forward(@Param('id') id: string, @Body() dto: ForwardSupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.forward(id, dto, actor); }

  @Post(':id/decline')
  @RequirePermission([PERMISSIONS.SUPPLY_FORWARD, PERMISSIONS.SUPPLY_FULFIL])
  decline(@Param('id') id: string, @Body() dto: DeclineSupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.decline(id, dto, actor); }

  @Post(':id/assign')
  @RequirePermission(PERMISSIONS.SUPPLY_FULFIL)
  assign(@Param('id') id: string, @Body() dto: AssignSupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.assign(id, dto, actor); }

  @Post(':id/ready')
  @RequirePermission(PERMISSIONS.SUPPLY_FULFIL)
  ready(@Param('id') id: string, @Body() dto: ReadySupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.ready(id, dto, actor); }

  @Post(':id/ask-farm-director')
  @RequirePermission(PERMISSIONS.SUPPLY_FULFIL)
  askFarmDirector(@Param('id') id: string, @Body() dto: ReadySupplyRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.supply.askFarmDirector(id, dto, actor); }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.SUPPLY_REQUEST)
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.supply.cancel(id, actor); }
}
