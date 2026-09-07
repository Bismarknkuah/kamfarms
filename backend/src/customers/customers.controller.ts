import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission([PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_APPROVE, PERMISSIONS.SALES_FULFILL, PERMISSIONS.SALES_VIEW])
  list(@Query('search') search?: string) {
    return this.customersService.list(search);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_APPROVE, PERMISSIONS.SALES_FULFILL, PERMISSIONS.SALES_VIEW])
  findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.CUSTOMER_MANAGE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.CUSTOMER_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.update(id, dto, actor);
  }
}
