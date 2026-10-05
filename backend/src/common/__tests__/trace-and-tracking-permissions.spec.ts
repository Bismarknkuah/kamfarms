import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PERMISSIONS, PERMISSION_CATALOG } from '../constants/permissions';
import { DispatchTrackingController } from '../../dispatch-tracking/dispatch-tracking.controller';
import { InventoryTransactionsController } from '../../inventory-ledger/inventory-transactions.controller';
import { ShipmentsController } from '../../logistics/shipments.controller';

const required = (proto: any, method: string) => Reflect.getMetadata(PERMISSION_KEY, proto[method]);

/** Which roles hold a permission, read from the seed and from the sync that runs on every deploy: the two must agree, and must be exactly who was asked for. */
function holders(file: string, code: string): string[] {
  const s = readFileSync(join(__dirname, '../../../../prisma', file), 'utf8'); const out: string[] = [];
  for (const m of s.matchAll(/code: '([A-Z_]+)'/g)) {
    const j = s.indexOf('permissionCodes: [', m.index! + m[0].length); if (j < 0) continue;
    if (/code: '[A-Z_]+'/.test(s.slice(m.index! + m[0].length, j))) continue;
    const block = s.slice(j, s.indexOf(']', j)).replace(/\/\/[^\n]*/g, '');
    if (new RegExp(`'${code.replace('.', '\\.')}'`).test(block)) out.push(m[1]);
  }
  return out.sort();
}

describe('the server enforces who may trace and who may track', () => {
  it('tracing a batch needs trace.view, and nothing broader', () => { expect(required(InventoryTransactionsController.prototype, 'traceReferences')).toBe(PERMISSIONS.TRACE_VIEW); });
  it('tracking dispatches needs dispatch.track', () => { expect(required(DispatchTrackingController.prototype, 'list')).toBe(PERMISSIONS.DISPATCH_TRACK); });
  it('counting a whole truck in needs warehouse.receive, the Warehouse Manager\'s permission', () => { expect(required(ShipmentsController.prototype, 'receiveDispatch')).toBe(PERMISSIONS.WAREHOUSE_RECEIVE); });
  it('both permissions are in the catalogue, so the Administrator holds them and the Roles page can change who else does', () => {
    const codes = PERMISSION_CATALOG.map((p) => p.code);
    expect(codes).toContain('trace.view'); expect(codes).toContain('dispatch.track');
  });
});

describe('who holds the two permissions', () => {
  it('trace.view: the Finance Director, MD, CEO, Sales Officers and Warehouse Supervisors only', () => {
    const want = ['CEO', 'FINANCE_DIRECTOR', 'MD', 'SALES_OFFICER', 'WAREHOUSE_SUPERVISOR'];
    expect(holders('seed.ts', 'trace.view')).toEqual(want); expect(holders('sync-permissions.ts', 'trace.view')).toEqual(want);
  });
  it('dispatch.track: Farm Managers, the Farm Supervisor, Warehouse Managers and Supervisors, MD and CEO', () => {
    const want = ['CEO', 'FARM_DIRECTOR', 'FARM_MANAGER', 'MD', 'WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR'];
    expect(holders('seed.ts', 'dispatch.track')).toEqual(want); expect(holders('sync-permissions.ts', 'dispatch.track')).toEqual(want);
  });
  it('nobody lost a permission they had: the Warehouse Supervisor still sends and the Warehouse Manager still counts in', () => {
    expect(holders('seed.ts', 'warehouse.transfer')).toContain('WAREHOUSE_SUPERVISOR'); expect(holders('seed.ts', 'warehouse.receive')).toContain('WAREHOUSE_MANAGER');
  });
});
