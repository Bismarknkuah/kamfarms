import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReceiptReviewsService } from './receipt-reviews.service';
import { DecideReceiptReviewDto } from './dto/decide-receipt-review.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('receipt-reviews')
@ApiBearerAuth()
@Controller('receipt-reviews')
export class ReceiptReviewsController {
  constructor(private readonly service: ReceiptReviewsService) {}

  /** The Warehouse Supervisor accepts the damage report: the held bags are written off as a loss. */
  @Post(':id/approve') @RequirePermission(PERMISSIONS.RECEIPT_REVIEW)
  approve(@Param('id') id: string, @Body() dto: DecideReceiptReviewDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.approve(id, dto.note, actor); }

  /** The Warehouse Supervisor does not accept it: the held bags go back into stock. A reason is required. */
  @Post(':id/reject') @RequirePermission(PERMISSIONS.RECEIPT_REVIEW)
  reject(@Param('id') id: string, @Body() dto: DecideReceiptReviewDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.reject(id, dto.note, actor); }
}
