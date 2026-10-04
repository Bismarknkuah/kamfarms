import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ApproveSalesOrderDto } from './dto/approve-sales-order.dto';
import { RejectSalesOrderDto } from './dto/reject-sales-order.dto';
import { ReleaseSalesOrderDto } from './dto/release-sales-order.dto';
import { AssignWarehouseDto } from './dto/assign-warehouse.dto';
import { DispatchSalesOrderDto } from './dto/dispatch-sales-order.dto';
import { StepNoteDto } from './dto/step-note.dto';
import { CancelSalesOrderDto } from './dto/cancel-sales-order.dto';
import { UploadReceiptDto } from './dto/upload-receipt.dto';
import { AnnotateFulfillmentSourceDto } from './dto/annotate-fulfillment-source.dto';
import { AttachReceiptDto } from './dto/attach-receipt.dto';
import { ReceiptUpload, RECEIPT_MAX_BYTES } from './receipt-file.util';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const P = PERMISSIONS;
// Anyone who takes part in a sale may open the screens; what they SEE is narrowed by the service (an officer sees only their own).
const TAKES_PART = [P.SALES_CREATE, P.SALES_APPROVE, P.SALES_RELEASE, P.SALES_ASSIGN, P.SALES_FULFILL, P.SALES_VIEW];

@ApiTags('sales-orders')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @RequirePermission(TAKES_PART)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('status') status?: string, @Query('customerId') customerId?: string) {
    return this.salesOrdersService.list({ status, customerId }, actor);
  }

  @Get(':id')
  @RequirePermission(TAKES_PART)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.findById(id, actor);
  }

  @Post()
  @RequirePermission(P.SALES_CREATE)
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.create(dto, actor);
  }

  @Post(':id/submit')
  @RequirePermission(P.SALES_CREATE)
  submit(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.submit(id, actor);
  }

  /** For orders that already carry a link. New receipts are uploaded as files, below. */
  @Post(':id/receipt')
  @RequirePermission(P.SALES_CREATE)
  attachReceipt(@Param('id') id: string, @Body() dto: AttachReceiptDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.attachReceipt(id, dto, actor);
  }

  @Post(':id/receipts')
  @ApiConsumes('multipart/form-data')
  @RequirePermission(P.SALES_CREATE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: RECEIPT_MAX_BYTES + 1 } }))
  uploadReceipt(@Param('id') id: string, @UploadedFile() file: ReceiptUpload | undefined, @Body() dto: UploadReceiptDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.addReceipt(id, file, dto, actor);
  }

  /** The receipt itself. Not public: the browser asks for it with the person's own sign-in. */
  @Get(':id/receipts/:receiptId/file')
  @RequirePermission(TAKES_PART)
  async receiptFile(@Param('id') id: string, @Param('receiptId') receiptId: string, @CurrentUser() actor: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const file = await this.salesOrdersService.getReceiptFile(id, receiptId, actor);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.data.length),
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).end(file.data);
  }

  @Delete(':id/receipts/:receiptId')
  @RequirePermission(P.SALES_CREATE)
  removeReceipt(@Param('id') id: string, @Param('receiptId') receiptId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.removeReceipt(id, receiptId, actor);
  }

  @Post(':id/approve')
  @RequirePermission(P.SALES_APPROVE)
  approve(@Param('id') id: string, @Body() dto: ApproveSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.approve(id, dto, actor);
  }

  @Get(':id/availability')
  @RequirePermission([P.SALES_APPROVE, P.SALES_RELEASE, P.SALES_ASSIGN])
  availability(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.availability(id, actor);
  }

  @Post(':id/release')
  @RequirePermission(P.SALES_RELEASE)
  release(@Param('id') id: string, @Body() dto: ReleaseSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.release(id, dto, actor);
  }

  /** The Finance Director rejects at their step, the Managing Director at theirs; the service checks which. A reason is mandatory. */
  @Post(':id/reject')
  @RequirePermission([P.SALES_APPROVE, P.SALES_RELEASE])
  reject(@Param('id') id: string, @Body() dto: RejectSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.reject(id, dto, actor);
  }

  @Post(':id/assign-warehouse')
  @RequirePermission(P.SALES_ASSIGN)
  assignWarehouse(@Param('id') id: string, @Body() dto: AssignWarehouseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.assignWarehouse(id, dto, actor);
  }

  @Post(':id/start-processing')
  @RequirePermission(P.SALES_FULFILL)
  startProcessing(@Param('id') id: string, @Body() dto: StepNoteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.startProcessing(id, dto, actor);
  }

  @Post(':id/dispatch')
  @RequirePermission(P.SALES_FULFILL)
  dispatch(@Param('id') id: string, @Body() dto: DispatchSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.dispatch(id, dto, actor);
  }

  @Post(':id/fulfill')
  @RequirePermission(P.SALES_FULFILL)
  fulfill(@Param('id') id: string, @Body() dto: StepNoteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.fulfill(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermission([P.SALES_CREATE, P.SALES_RELEASE])
  cancel(@Param('id') id: string, @Body() dto: CancelSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.cancel(id, dto, actor);
  }

  @Post('items/:itemId/fulfillment-source')
  @RequirePermission(P.SALES_FULFILL)
  annotateFulfillmentSource(@Param('itemId') itemId: string, @Body() dto: AnnotateFulfillmentSourceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.annotateFulfillmentSource(itemId, dto.sourceReferenceNumbers, actor);
  }
}
