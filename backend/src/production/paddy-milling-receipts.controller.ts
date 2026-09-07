import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaddyMillingReceiptsService } from './paddy-milling-receipts.service';
import { CreatePaddyMillingReceiptDto } from './dto/create-paddy-milling-receipt.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('paddy-milling-receipts')
@ApiBearerAuth()
@Controller('paddy-milling-receipts')
export class PaddyMillingReceiptsController {
  constructor(private readonly paddyMillingReceiptsService: PaddyMillingReceiptsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MILLING_VIEW)
  list(@Query('millingCenterId') millingCenterId?: string) {
    return this.paddyMillingReceiptsService.list(millingCenterId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PRODUCTION_CREATE)
  create(@Body() dto: CreatePaddyMillingReceiptDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyMillingReceiptsService.create(dto, actor);
  }
}
