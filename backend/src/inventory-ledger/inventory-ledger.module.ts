import { Global, Module } from '@nestjs/common';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { InventoryTransactionsController } from './inventory-transactions.controller';

@Global()
@Module({
  controllers: [InventoryAdjustmentsController, InventoryTransactionsController],
  providers: [InventoryLedgerService, InventoryAdjustmentsService],
  exports: [InventoryLedgerService, InventoryAdjustmentsService],
})
export class InventoryLedgerModule {}
