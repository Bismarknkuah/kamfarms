import { ReportsController } from '../reports.controller';
import { PERMISSIONS } from '../../common/constants/permissions';

function buildController(salesReportImpl: jest.Mock) {
  const reportsService = { salesReport: salesReportImpl } as any;
  const exportService = {} as any;
  const controller = new ReportsController(reportsService, exportService);
  return controller;
}

function buildActor(permissionCodes: string[], id = 'user-1') {
  return { id, permissionCodes: new Set(permissionCodes) } as any;
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
