import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductPricesService } from './product-prices.service';
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('product-prices')
@ApiBearerAuth()
@Controller('product-prices')
export class ProductPricesController {
  constructor(private readonly productPricesService: ProductPricesService) {}

  @Get()
  @RequirePermission([PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_APPROVE, PERMISSIONS.SALES_FULFILL, PERMISSIONS.SALES_VIEW])
  list(@Query('productId') productId?: string, @Query('customerId') customerId?: string) {
    return this.productPricesService.list(productId, customerId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  create(@Body() dto: CreateProductPriceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productPricesService.create(dto, actor);
  }
}
