import { ReportsController } from '../reports.controller';
import { PERMISSIONS } from '../../common/constants/permissions';

function buildController(salesReportImpl: jest.Mock) {
  const reportsService = { salesReport: salesReportImpl } as any;
  const exportService = {} as any;
  const controller = new ReportsController(reportsService, exportService);
  return controller;
}

function buildActor(permissionCodes: string[], id = 'user-1') {
  const roleCode = permissionCodes.includes(PERMISSIONS.FINANCE_VIEW) ? 'FINANCE_DIRECTOR' : 'SALES_OFFICER';
  return { id, roles: [{ roleId: 'r', roleCode, permissions: permissionCodes, scopes: [] }], permissionCodes: new Set(permissionCodes) } as any;
}

function buildRes() {
  return { json: jest.fn() } as any;
}

describe('ReportsController.salesReport - scoping fix', () => {
  it('forces a Sales Officer (no finance.view) to their own id, ignoring any salesOfficerId they pass', async () => {
    const salesReportImpl = jest.fn().mockResolvedValue({ totalOrders: 0, totalAmount: 0, bySalesperson: [], byProduct: [] });
    const controller = buildController(salesReportImpl);
    const actor = buildActor([PERMISSIONS.SALES_CREATE], 'sales-officer-1');
    const res = buildRes();

    await controller.salesReport(res, actor, 'someone-elses-id', undefined, undefined, undefined, undefined);

    expect(salesReportImpl).toHaveBeenCalledWith(expect.objectContaining({ salesOfficerId: 'sales-officer-1' }));
  });

  it('lets a finance.view holder see company-wide data when no salesOfficerId is passed', async () => {
    const salesReportImpl = jest.fn().mockResolvedValue({ totalOrders: 0, totalAmount: 0, bySalesperson: [], byProduct: [] });
    const controller = buildController(salesReportImpl);
    const actor = buildActor([PERMISSIONS.FINANCE_VIEW], 'finance-director-1');
    const res = buildRes();

    await controller.salesReport(res, actor, undefined, undefined, undefined, undefined, undefined);

    expect(salesReportImpl).toHaveBeenCalledWith(expect.objectContaining({ salesOfficerId: undefined }));
  });

  it('lets a finance.view holder filter to any specific salesperson they choose', async () => {
    const salesReportImpl = jest.fn().mockResolvedValue({ totalOrders: 0, totalAmount: 0, bySalesperson: [], byProduct: [] });
    const controller = buildController(salesReportImpl);
    const actor = buildActor([PERMISSIONS.FINANCE_VIEW], 'md-1');
    const res = buildRes();

    await controller.salesReport(res, actor, 'chosen-sales-officer', undefined, undefined, undefined, undefined);

    expect(salesReportImpl).toHaveBeenCalledWith(expect.objectContaining({ salesOfficerId: 'chosen-sales-officer' }));
  });
});

describe('ReportsController: each role gets the reports of its own area only', () => {
  const asRole = (roleCode: string) => ({ id: 'u1', roles: [{ roleId: 'r', roleCode, permissions: [], scopes: [] }], permissionCodes: new Set([PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT]) } as any);
  const make = () => {
    const reports: any = { warehouseReport: jest.fn(async () => []), farmReport: jest.fn(async () => []), financeReport: jest.fn(async () => ({})), executiveSummary: jest.fn(async () => ({})), inventoryByLocation: jest.fn(async () => ({ farms: [{ locationName: 'Farm A' }], warehouses: [{ locationName: 'WH 1' }], millingCenters: [{ locationName: 'Mill 1' }] })) };
    const res: any = { json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
    return { controller: new ReportsController(reports, { toCsv: jest.fn(() => ''), toExcelBuffer: jest.fn(), toPdfBuffer: jest.fn() } as any), reports, res };
  };

  it('refuses a Farm Supervisor the warehouse report, and never reaches the data', async () => {
    const { controller, reports, res } = make();
    await expect(controller.warehouseReport(res, asRole('FARM_DIRECTOR'), undefined, undefined)).rejects.toThrow(/outside your area/);
    expect(reports.warehouseReport).not.toHaveBeenCalled();
  });

  it('gives a Warehouse Manager the warehouse report, scoped to the caller', async () => {
    const { controller, reports, res } = make();
    const actor = asRole('WAREHOUSE_MANAGER');
    await controller.warehouseReport(res, actor, undefined, undefined);
    expect(reports.warehouseReport).toHaveBeenCalledWith({ warehouseId: undefined }, actor);
  });

  it('refuses a Warehouse Manager the farm and finance reports', async () => {
    const { controller, res } = make();
    await expect(controller.farmReport(res, asRole('WAREHOUSE_MANAGER'))).rejects.toThrow(/outside your area/);
    await expect(controller.financeReport(res, asRole('WAREHOUSE_MANAGER'))).rejects.toThrow(/outside your area/);
  });

  it('refuses everyone but top management the company executive summary', async () => {
    const { controller } = make();
    await expect(controller.executiveSummary(asRole('FARM_MANAGER'))).rejects.toThrow(/outside your area/);
    await expect(controller.executiveSummary(asRole('MD'))).resolves.toBeDefined();
  });

  it('gives the inventory report only the kinds of place of the person\'s own area', async () => {
    const { controller, res } = make();
    await controller.inventoryByLocation(res, asRole('FARM_DIRECTOR'), undefined);
    expect(res.json.mock.calls[0][0].data).toEqual({ farms: [{ locationName: 'Farm A' }], warehouses: [], millingCenters: [] });
    const second = make();
    await second.controller.inventoryByLocation(second.res, asRole('OPERATIONS_OFFICER'), undefined);
    expect(second.res.json.mock.calls[0][0].data).toEqual({ farms: [], warehouses: [], millingCenters: [{ locationName: 'Mill 1' }] });
  });
});
