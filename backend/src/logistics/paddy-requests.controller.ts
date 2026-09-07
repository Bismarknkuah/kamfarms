import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaddyRequestsService } from './paddy-requests.service';
import { CreatePaddyRequestDto } from './dto/create-paddy-request.dto';
import { RespondPaddyRequestDto } from './dto/respond-paddy-request.dto';
import { AssignPaddyRequestDto } from './dto/assign-paddy-request.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('paddy-requests')
@ApiBearerAuth()
@Controller('paddy-requests')
export class PaddyRequestsController {
  constructor(private readonly paddyRequestsService: PaddyRequestsService) {}

  @Get()
  @RequirePermission([PERMISSIONS.WAREHOUSE_TRANSFER, PERMISSIONS.DELIVERY_APPROVE])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('warehouseId') warehouseId?: string) {
    return this.paddyRequestsService.list(actor, warehouseId);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.WAREHOUSE_TRANSFER, PERMISSIONS.DELIVERY_APPROVE])
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyRequestsService.findById(id, actor);
  }

  @Post()
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  create(@Body() dto: CreatePaddyRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyRequestsService.create(dto, actor);
  }

  @Post(':id/respond')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  respond(@Param('id') id: string, @Body() dto: RespondPaddyRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyRequestsService.respond(id, dto, actor);
  }

  @Post(':id/assign')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  assignToFarm(@Param('id') id: string, @Body() dto: AssignPaddyRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyRequestsService.assignToFarm(id, dto, actor);
  }

  @Post(':id/link-order')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  linkOrder(@Param('id') id: string, @Body('orderId') orderId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyRequestsService.linkOrder(id, orderId, actor);
  }
}
