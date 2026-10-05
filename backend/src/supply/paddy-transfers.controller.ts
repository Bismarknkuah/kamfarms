import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PaddyTransfersService } from './paddy-transfers.service';
import { CancelPaddyTransferDto, ReceivePaddyTransferDto, SendPaddyTransferDto } from './dto/paddy-transfer.dto';

@ApiTags('paddy-transfers')
@ApiBearerAuth()
@Controller('paddy-transfers')
export class PaddyTransfersController {
  constructor(private readonly service: PaddyTransfersService) {}

  @Get()
  @RequirePermission([PERMISSIONS.WAREHOUSE_TRANSFER, PERMISSIONS.WAREHOUSE_RECEIVE])
  list(@CurrentUser() user: AuthenticatedUser) { return this.service.list(user); }

  @Get('places')
  @RequirePermission([PERMISSIONS.WAREHOUSE_TRANSFER, PERMISSIONS.WAREHOUSE_RECEIVE])
  places(@CurrentUser() user: AuthenticatedUser) { return this.service.places(user); }

  @Post()
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  send(@Body() dto: SendPaddyTransferDto, @CurrentUser() user: AuthenticatedUser) { return this.service.send(dto, user); }

  @Post(':id/receive')
  @RequirePermission([PERMISSIONS.WAREHOUSE_RECEIVE, PERMISSIONS.WAREHOUSE_TRANSFER])
  receive(@Param('id') id: string, @Body() dto: ReceivePaddyTransferDto, @CurrentUser() user: AuthenticatedUser) { return this.service.receive(id, dto, user); }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  cancel(@Param('id') id: string, @Body() dto: CancelPaddyTransferDto, @CurrentUser() user: AuthenticatedUser) { return this.service.cancel(id, dto, user); }
}
