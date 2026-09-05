import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  list(@Query('customerId') customerId?: string) {
    return this.invoicesService.list(customerId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  findOne(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.INVOICE_CREATE)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.invoicesService.createFromSalesOrder(dto, actor);
  }
}
