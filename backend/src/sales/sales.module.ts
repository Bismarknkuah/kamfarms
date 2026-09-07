import { Module } from '@nestjs/common';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';
import { ProductPricesController } from './product-prices.controller';
import { ProductPricesService } from './product-prices.service';

@Module({
  controllers: [SalesOrdersController, ProductPricesController],
  providers: [SalesOrdersService, ProductPricesService],
  exports: [SalesOrdersService, ProductPricesService],
})
export class SalesModule {}
