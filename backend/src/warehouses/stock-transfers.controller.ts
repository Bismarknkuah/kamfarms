import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { ReceiveStockTransferDto } from './dto/receive-stock-transfer.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('stock-transfers')
@ApiBearerAuth()
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('warehouseId') warehouseId?: string) {
    return this.stockTransfersService.list(actor, warehouseId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  findOne(@Param('id') id: string) {
    return this.stockTransfersService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stockTransfersService.create(dto, actor);
  }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.WAREHOUSE_TRANSFER)
  receive(@Param('id') id: string, @Body() dto: ReceiveStockTransferDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stockTransfersService.receive(id, dto, actor);
  }
}
