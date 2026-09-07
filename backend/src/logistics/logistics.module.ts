import { Module } from '@nestjs/common';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { DeliveryOrdersService } from './delivery-orders.service';
import { DeliveryReportsController } from './delivery-reports.controller';
import { DeliveryReportsService } from './delivery-reports.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { PaddyRequestsController } from './paddy-requests.controller';
import { PaddyRequestsService } from './paddy-requests.service';

@Module({
  controllers: [DeliveryOrdersController, DeliveryReportsController, ShipmentsController, PaddyRequestsController],
  providers: [DeliveryOrdersService, DeliveryReportsService, ShipmentsService, PaddyRequestsService],
  exports: [DeliveryOrdersService, DeliveryReportsService, ShipmentsService, PaddyRequestsService],
})
export class LogisticsModule {}
