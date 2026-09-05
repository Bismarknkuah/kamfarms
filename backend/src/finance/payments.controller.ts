import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.paymentsService.list(customerId, status);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  findOne(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PAYMENT_CREATE)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paymentsService.create(dto, actor);
  }

  @Post(':id/verify')
  @RequirePermission(PERMISSIONS.PAYMENT_VERIFY)
  verify(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paymentsService.verify(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.PAYMENT_VERIFY)
  reject(@Param('id') id: string, @Body() dto: RejectPaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paymentsService.reject(id, dto, actor);
  }
}
