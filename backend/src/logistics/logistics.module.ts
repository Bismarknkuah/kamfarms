import { Module } from '@nestjs/common';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { DeliveryOrdersService } from './delivery-orders.service';
import { DeliveryReportsController } from './delivery-reports.controller';
import { DeliveryReportsService } from './delivery-reports.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [DeliveryOrdersController, DeliveryReportsController, ShipmentsController],
  providers: [DeliveryOrdersService, DeliveryReportsService, ShipmentsService],
  exports: [DeliveryOrdersService, DeliveryReportsService, ShipmentsService],
})
export class LogisticsModule {}
