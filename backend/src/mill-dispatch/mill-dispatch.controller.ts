import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { MillDispatchService } from './mill-dispatch.service';
import { CreateMillDispatchDto, DecideMillDispatchDto, ReceiveMillDispatchDto, RejectMillDispatchDto } from './dto/mill-dispatch.dto';

@ApiTags('mill-dispatches')
@ApiBearerAuth()
@Controller('mill-dispatches')
export class MillDispatchController {
  constructor(private readonly service: MillDispatchService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_VIEW)
  list(@CurrentUser() actor: AuthenticatedUser) { return this.service.list(actor); }

  @Get('options')
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_REQUEST)
  options(@CurrentUser() actor: AuthenticatedUser) { return this.service.options(actor); }

  @Post()
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_REQUEST)
  request(@Body() dto: CreateMillDispatchDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.request(dto, actor); }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_APPROVE)
  approve(@Param('id') id: string, @Body() dto: DecideMillDispatchDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.approve(id, dto, actor); }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_APPROVE)
  reject(@Param('id') id: string, @Body() dto: RejectMillDispatchDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.reject(id, dto, actor); }

  @Post(':id/cancel')
  @RequirePermission([PERMISSIONS.MILL_DISPATCH_REQUEST, PERMISSIONS.MILL_DISPATCH_APPROVE])
  cancel(@Param('id') id: string, @Body() dto: DecideMillDispatchDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.cancel(id, dto, actor); }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.MILL_DISPATCH_RECEIVE)
  receive(@Param('id') id: string, @Body() dto: ReceiveMillDispatchDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.receive(id, dto, actor); }
}
