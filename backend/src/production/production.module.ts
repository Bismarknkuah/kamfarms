import { Module } from '@nestjs/common';
import { ProductionRecordsController } from './production-records.controller';
import { ProductionRecordsService } from './production-records.service';
import { QualityInspectionsController } from './quality-inspections.controller';
import { QualityInspectionsService } from './quality-inspections.service';

@Module({
  controllers: [ProductionRecordsController, QualityInspectionsController],
  providers: [ProductionRecordsService, QualityInspectionsService],
  exports: [ProductionRecordsService, QualityInspectionsService],
})
export class ProductionModule {}
