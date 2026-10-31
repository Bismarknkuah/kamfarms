'use client';

import type { MeResponse } from '@/lib/api-client';
import { OverviewGreeting } from './OverviewGreeting';
import { FarmAnalytics } from './FarmAnalytics';
import { WarehouseAnalytics } from './WarehouseAnalytics';
import { OperationsAnalytics } from './OperationsAnalytics';
import { ExecutiveAnalyticsView } from './ExecutiveAnalytics';
import { SalesAnalytics } from './SalesAnalytics';
import { FinanceAnalytics } from './FinanceAnalytics';
import { SystemAnalytics } from './SystemAnalytics';
import { FarmPlace } from './FarmPlace';
import { WarehousePlace } from './WarehousePlace';
import { MillPlace } from './MillPlace';
import { PulseAnalytics } from './PulseAnalytics';
import { AuditAnalytics } from './AuditAnalytics';

export type Block = 'executive' | 'finance' | 'sales' | 'farm' | 'warehouse' | 'operations' | 'system' | 'farmPlace' | 'warehousePlace' | 'millPlace' | 'pulse' | 'audit';

/** The analytics each role sees on its Overview, in order. The server enforces the same areas, so a block here that a role may not read would simply say so. */
export const BLOCKS_BY_ROLE: Record<string, Block[]> = {
  ADMIN: ['system'],
  MD: ['pulse', 'executive', 'sales', 'finance'],
  CEO: ['pulse', 'executive', 'sales', 'finance'],
  AUDITOR: ['audit', 'executive'],
  FINANCE_DIRECTOR: ['finance', 'sales'],
  FINANCE_OFFICER: ['finance', 'sales'],
  FARM_DIRECTOR: ['farm'],
  FARM_MANAGER: ['farmPlace'],
  WAREHOUSE_SUPERVISOR: ['warehouse'],
  WAREHOUSE_MANAGER: ['warehousePlace'],
  OPERATIONS_MANAGER: ['operations'],
  OPERATIONS_OFFICER: ['millPlace'],
  SALES_OFFICER: ['sales'],
};

/** What a person must hold for a block to appear. A feature switched off for their role takes the permission away, and the block goes with it. */
const BLOCK_NEEDS: Record<Block, string[]> = {
  executive: ['reports.view', 'dashboard.view'], finance: ['finance.view'], sales: ['sales.view', 'sales.create', 'finance.view'],
  farm: ['reports.view'], warehouse: ['reports.view'], operations: ['reports.view'], system: ['users.manage'],
  farmPlace: ['dashboard.view', 'farm.inventory.view', 'paddy.create'], warehousePlace: ['dashboard.view', 'warehouse.inventory.view', 'warehouse.receive'], millPlace: ['dashboard.view', 'milling.view', 'production.create'],
  pulse: ['reports.view', 'dashboard.view', 'finance.view'], audit: ['reports.view', 'audit.view'],
};

export function blocksFor(me: MeResponse, hasPermission: (c: string | string[]) => boolean): Block[] {
  const out: Block[] = [];
  const add = (b: Block) => { if (!out.includes(b) && hasPermission(BLOCK_NEEDS[b])) out.push(b); };
  for (const r of me.roles) {
    const known = BLOCKS_BY_ROLE[r.code];
    if (known) { known.forEach(add); continue; }
    // A role the Administrator made: the analytics follow the kind of work its permissions cover.
    if (hasPermission('farm.inventory.view')) add('farm');
    if (hasPermission('warehouse.inventory.view')) add('warehouse');
    if (hasPermission('milling.view')) add('operations');
    if (hasPermission(['sales.create', 'sales.view'])) add('sales');
    if (hasPermission('finance.view')) add('finance');
  }
  return out;
}

/** The Overview for every role: a greeting, then the analytics of the person's own area. No shortcuts and no tasks: the side menu has the pages. */
export function Overview({ me, accessToken, hasPermission }: { me: MeResponse; accessToken: string; hasPermission: (c: string | string[]) => boolean }) {
  const blocks = blocksFor(me, hasPermission);
  return (
    <div data-testid="overview" data-role={me.roles.map((r) => r.code).join(',')}>
      <OverviewGreeting me={me} />
      {blocks.length === 0 && <p data-testid="overview-none" className="rounded-2xl border border-dashed border-paddy-100 bg-white px-4 py-8 text-center text-sm text-ink-500">There are no figures for your role yet.</p>}
      {blocks.map((b) => {
        switch (b) {
          case 'executive': return <ExecutiveAnalyticsView key={b} accessToken={accessToken} />;
          case 'finance': return <FinanceAnalytics key={b} accessToken={accessToken} />;
          case 'sales': return <SalesAnalytics key={b} accessToken={accessToken} />;
          case 'farm': return <FarmAnalytics key={b} accessToken={accessToken} />;
          case 'warehouse': return <WarehouseAnalytics key={b} accessToken={accessToken} />;
          case 'operations': return <OperationsAnalytics key={b} accessToken={accessToken} />;
          case 'farmPlace': return <FarmPlace key={b} accessToken={accessToken} />;
          case 'warehousePlace': return <WarehousePlace key={b} accessToken={accessToken} />;
          case 'millPlace': return <MillPlace key={b} accessToken={accessToken} />;
          case 'pulse': return <PulseAnalytics key={b} accessToken={accessToken} />;
          case 'audit': return <AuditAnalytics key={b} accessToken={accessToken} />;
          case 'system': return <SystemAnalytics key={b} accessToken={accessToken} />;
        }
      })}
    </div>
  );
}
