import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

type ExportFormat = 'csv' | 'xlsx' | 'pdf' | undefined;

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  /** Shared export handling: no format -> JSON envelope; format=csv/
   * xlsx/pdf streams a downloadable file instead. Exporting requires
   * reports.export specifically -- reports.view (already enforced on
   * every route below) only covers seeing the JSON. */
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
    if (format === 'pdf') {
      const buffer = await this.exportService.toPdfBuffer(rows, title);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filenameBase + '.pdf"');
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
    const rows = await this.reportsService.farmReport({ farmId, from, to }, actor);
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
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('salesOfficerId') salesOfficerId?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: ExportFormat,
  ) {
    // A Sales Officer (holds sales.create, not finance.view) is scoped
    // to their own sales only, regardless of what salesOfficerId they
    // pass - a real, confirmed gap this closes: the endpoint never
    // received the caller's identity at all before, so a plain Sales
    // Officer calling this with no filter got the whole company's
    // sales performance data, not just their own. Finance/MD-tier
    // callers (finance.view) can still see company-wide or filter to
    // any specific salesperson.
    const scopedSalesOfficerId = actor.permissionCodes.has(PERMISSIONS.FINANCE_VIEW) ? salesOfficerId : actor.id;
    const report = await this.reportsService.salesReport({ salesOfficerId: scopedSalesOfficerId, productId, from, to });
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: report });
      return;
    }
    const rows = report.bySalesperson.map((s: { name: string; orderCount: number; totalAmount: number }) => ({
      salesperson: s.name,
      orders: s.orderCount,
      total_amount: s.totalAmount,
    }));
    return this.respondWithFormat(res, actor, rows, 'sales-report', 'Sales Report', format);
  }

  @Get('finance')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  async financeReport(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const report = await this.reportsService.financeReport({ from, to });
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: report });
      return;
    }
    const rows = report.expensesByCategory.map((e: { category: string; amount: number }) => ({
      category: e.category,
      amount: e.amount,
    }));
    rows.push({ category: 'TOTAL REVENUE', amount: report.totalInvoiced });
    rows.push({ category: 'TOTAL PAYMENTS VERIFIED', amount: report.totalPaymentsVerified });
    rows.push({ category: 'TOTAL EXPENSES', amount: report.totalExpenses });
    rows.push({ category: 'ESTIMATED PROFIT', amount: report.estimatedProfit });
    return this.respondWithFormat(res, actor, rows, 'finance-report', 'Finance Report', format);
  }

  @Get('analytics')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  async executiveAnalytics() {
    return this.reportsService.executiveAnalytics();
  }

  @Get('inventory')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async inventoryByLocation(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('format') format?: ExportFormat,
  ) {
    const overview = await this.reportsService.inventoryByLocation(actor);
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: overview });
      return;
    }
    // Flattened into one row set for the download, since a CSV/PDF
    // needs a single table, not the nested {farms, warehouses,
    // millingCenters} shape the JSON view uses.
    const rows = [...overview.farms, ...overview.warehouses, ...overview.millingCenters].map((r) => ({
      location: r.locationName,
      type: r.locationType,
      item: r.itemLabel,
      bags: r.bagCount,
      kg: r.quantityKg,
    }));
    return this.respondWithFormat(res, actor, rows, 'inventory-by-location', 'Inventory by Location', format);
  }

  @Get('inventory-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async inventoryOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.inventoryOverview(actor);
  }

  @Get('warehouse-overview')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async warehouseOverview(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const overview = await this.reportsService.warehouseOverview(actor, warehouseId);
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: overview });
      return;
    }
    // Flattened into one row set for the download - a CSV/PDF needs a
    // single table, not the three-section shape the dashboard view uses.
    const rows = [
      ...overview.paddy.received.map((r) => ({ section: 'Paddy received', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.paddy.available.map((r) => ({ section: 'Paddy available', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.paddy.inTransit.map((r) => ({ section: 'Paddy in transit', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.atMilling.map((r) => ({ section: 'At milling', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.packagedRice.map((r) => ({ section: 'Packaged rice', grade_or_size: r.label, bags: r.bags, kg: r.kg })),
    ];
    return this.respondWithFormat(res, actor, rows, 'warehouse-overview', 'Warehouse Overview', format);
  }

  @Get('farm-overview')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async farmOverview(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('farmId') farmId?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const overview = await this.reportsService.farmOverview(actor, farmId);
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: overview });
      return;
    }
    const rows = [
      ...overview.paddy.received.map((r) => ({ section: 'Paddy received', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.paddy.available.map((r) => ({ section: 'Paddy available', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      ...overview.paddy.dispatched.map((r) => ({ section: 'Paddy dispatched', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
    ];
    return this.respondWithFormat(res, actor, rows, 'farm-overview', 'Farm Overview', format);
  }

  @Get('production-overview')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  async productionOverview(
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('millingCenterId') millingCenterId?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const overview = await this.reportsService.productionOverview(actor, millingCenterId);
    if (!format) {
      res.json({ success: true, message: null, errorCode: null, data: overview });
      return;
    }
    const rows = [
      ...overview.processed.map((r) => ({ section: 'Paddy processed', grade_or_size: r.gradeLabel, bags: r.bags, kg: r.kg })),
      { section: 'Recovered rice', grade_or_size: '', bags: '', kg: overview.recoveredRiceKg },
      { section: 'Broken rice', grade_or_size: '', bags: '', kg: overview.brokenRiceKg },
      { section: 'Rice hull', grade_or_size: '', bags: '', kg: overview.riceHullKg },
      { section: 'Recovery %', grade_or_size: '', bags: '', kg: overview.recoveryPercent.toFixed(2) },
      { section: 'Energy consumed (kWh)', grade_or_size: '', bags: '', kg: overview.energyConsumedKwh },
    ];
    return this.respondWithFormat(res, actor, rows, 'production-overview', 'Production Overview', format);
  }
}
