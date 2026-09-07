import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';
import { WarehouseEquipmentController } from './warehouse-equipment.controller';
import { WarehouseEquipmentService } from './warehouse-equipment.service';

@Module({
  controllers: [WarehousesController, StockTransfersController, WarehouseEquipmentController],
  providers: [WarehousesService, StockTransfersService, WarehouseEquipmentService],
  exports: [WarehousesService, StockTransfersService, WarehouseEquipmentService],
})
export class WarehousesModule {}
