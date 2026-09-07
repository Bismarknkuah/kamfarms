import { Module } from '@nestjs/common';
import { ProductionRecordsController } from './production-records.controller';
import { ProductionRecordsService } from './production-records.service';
import { QualityInspectionsController } from './quality-inspections.controller';
import { QualityInspectionsService } from './quality-inspections.service';
import { PaddyMillingReceiptsController } from './paddy-milling-receipts.controller';
import { PaddyMillingReceiptsService } from './paddy-milling-receipts.service';

@Module({
  controllers: [ProductionRecordsController, QualityInspectionsController, PaddyMillingReceiptsController],
  providers: [ProductionRecordsService, QualityInspectionsService, PaddyMillingReceiptsService],
  exports: [ProductionRecordsService, QualityInspectionsService, PaddyMillingReceiptsService],
})
export class ProductionModule {}
