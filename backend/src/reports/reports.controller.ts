import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

type ExportFormat = 'csv' | 'xlsx' | undefined;

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  /** Shared export handling: no format -> JSON envelope; format=csv/xlsx
   * streams a downloadable file instead (spec section 33: PDF/Excel/CSV
   * export -- PDF not yet implemented, see export.service.ts). Exporting
   * requires reports.export specifically -- reports.view (already
   * enforced on every route below) only covers seeing the JSON. */
  private async respondWithFormat(
    res: Response,
    actor: AuthenticatedUser,
    rows: Record<string, unknown>[],
    filenameBase: string,
    title: string,
    format: ExportFormat,
  ) {
    if (format && !actor.permissionCodes.has(PERMISSIONS.REPORTS_EXPORT)) {
      throw new ForbiddenException({ message: 'You do not have permission to export reports.', errorCode: 'PERMISSION_DENIED' });
    }
    if (format === 'csv') {
      const csv = this.exportService.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filenameBase + '.csv"');
      res.send(csv);
      return;
    }
    if (format === 'xlsx') {
      const buffer = await this.exportService.toExcelBuffer(rows, filenameBase, title);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filenameBase + '.xlsx"');
      res.send(buffer);
      return;
    }
    res.json({ success: true, message: null, errorCode: null, data: rows });
  }

  @Get('executive-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async executiveSummary() {
    return this.reportsService.executiveSummary();
  }

  @Get('farms')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async farmReport(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('farmId') farmId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const rows = await this.reportsService.farmReport({ farmId, from, to });
    return this.respondWithFormat(res, actor, rows, 'farm-report', 'Farm Intake Report', format);
  }

  @Get('warehouses')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async warehouseReport(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const rows = await this.reportsService.warehouseReport({ warehouseId });
    return this.respondWithFormat(res, actor, rows, 'warehouse-report', 'Warehouse Inventory Report', format);
  }

  @Get('sales')
  @RequirePermission([PERMISSIONS.FINANCE_VIEW, PERMISSIONS.SALES_CREATE])
  async salesReport(
    @Query('salesOfficerId') salesOfficerId?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.salesReport({ salesOfficerId, productId, from, to });
  }

  @Get('finance')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  async financeReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.financeReport({ from, to });
  }

  @Get('analytics')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  async executiveAnalytics() {
    return this.reportsService.executiveAnalytics();
  }

  @Get('inventory')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async inventoryByLocation(@CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.inventoryByLocation(actor);
  }

  @Get('inventory-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async inventoryOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.inventoryOverview(actor);
  }
}
