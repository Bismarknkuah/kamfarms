import { Module } from '@nestjs/common';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { SupplyRequestsController } from './supply-requests.controller';
import { SupplyRequestsService } from './supply-requests.service';
import { PaddyWhereaboutsService } from './paddy-whereabouts.service';
import { PaddyTransfersController } from './paddy-transfers.controller';
import { PaddyTransfersService } from './paddy-transfers.service';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [InventoryLedgerModule, LogisticsModule, ProductionModule],
  controllers: [SupplyRequestsController, PaddyTransfersController],
  providers: [SupplyRequestsService, PaddyWhereaboutsService, PaddyTransfersService],
  exports: [SupplyRequestsService, PaddyTransfersService],
})
export class SupplyModule {}
