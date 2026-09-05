import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';

@Module({
  controllers: [WarehousesController, StockTransfersController],
  providers: [WarehousesService, StockTransfersService],
  exports: [WarehousesService, StockTransfersService],
})
export class WarehousesModule {}
