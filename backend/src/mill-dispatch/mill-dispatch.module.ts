import { Module } from '@nestjs/common';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { ProductionModule } from '../production/production.module';
import { MillDispatchController } from './mill-dispatch.controller';
import { MillDispatchService } from './mill-dispatch.service';

@Module({ imports: [InventoryLedgerModule, ProductionModule], controllers: [MillDispatchController], providers: [MillDispatchService], exports: [MillDispatchService] })
export class MillDispatchModule {}
