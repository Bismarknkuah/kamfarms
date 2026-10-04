import { Module } from '@nestjs/common';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { SupplyRequestsController } from './supply-requests.controller';
import { SupplyRequestsService } from './supply-requests.service';
import { PaddyWhereaboutsService } from './paddy-whereabouts.service';

@Module({
  imports: [InventoryLedgerModule, LogisticsModule],
  controllers: [SupplyRequestsController],
  providers: [SupplyRequestsService, PaddyWhereaboutsService],
  exports: [SupplyRequestsService],
})
export class SupplyModule {}
