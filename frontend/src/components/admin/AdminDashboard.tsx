'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { type MeResponse, type PackagingSize, type Product, type ResetRequest, backupApi, masterDataApi, systemResetApi } from '@/lib/api-client';
import { AdminControlCenter } from '../AdminControlCenter';
import { DemoModeSwitch } from './DemoModeSwitch';

const SHORTCUTS = [
  { href: '/users', label: 'Add a person' },
  { href: '/roles', label: 'Roles' },
  { href: '/settings', label: 'System settings' },
  { href: '/site-editor', label: 'Public homepage' },
  { href: '/audit-log', label: 'Audit log' },
  { href: '/admin', label: 'Backups and resets' },
];

function Tile({ href, label, children, tone = 'plain', testId }: { href: string; label: string; children: ReactNode; tone?: 'plain' | 'warn'; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className={`rounded-2xl border bg-white p-5 transition hover:border-paddy-500 ${tone === 'warn' ? 'border-amber-300' : 'border-paddy-100'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 font-display text-lg text-paddy-900">{children}</p>
    </Link>
  );
}

/**
 * The System Administrator's own home page. It is deliberately not the page the other roles get: no farm or sales
 * desks, no personal task strip. It is the control center, the demo-access switch and the things only an
 * Administrator watches (resets, backups, master data).
 */
export function AdminDashboard({ me, accessToken }: { me: MeResponse; accessToken: string }) {
  const [resets, setResets] = useState<ResetRequest[] | null>(null);
  const [backup, setBackup] = useState<{ lastSuccess: { completedAt: string | null } | null } | null | 'unavailable'>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [sizes, setSizes] = useState<PackagingSize[] | null>(null);

  useEffect(() => {
    let live = true;
    systemResetApi.list(accessToken).then((v) => live && setResets(v)).catch(() => {});
    backupApi.status(accessToken).then((v) => live && setBackup(v)).catch(() => live && setBackup('unavailable'));
    masterDataApi.products(accessToken).then((v) => live && setProducts(v)).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then((v) => live && setSizes(v)).catch(() => {});
    return () => { live = false; };
  }, [accessToken]);

  const ready = resets?.filter((r) => r.status === 'APPROVED').length ?? 0;
  const inProgress = resets?.filter((r) => !['REJECTED', 'CANCELLED', 'EXECUTED'].includes(r.status)).length ?? 0;
  const lastBackup = backup && backup !== 'unavailable' ? backup.lastSuccess?.completedAt ?? null : null;

  return (
    <div data-testid="admin-dashboard">
      <header className="mb-6 overflow-hidden rounded-2xl bg-paddy-900 px-6 py-6 text-rice-50" data-testid="admin-hero">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-husk-300">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Administrator console
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium">Welcome, {me.firstName} {me.lastName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-paddy-100">
          You have full access to every part of KAM-ROMS: people, roles, places, rules, the public homepage and every company screen.
          Everything you change is recorded in the audit log.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} data-testid="admin-shortcut" className="rounded-full bg-paddy-700 px-3.5 py-1.5 text-xs font-medium text-rice-50 transition hover:bg-husk-500">
              {s.label}
            </Link>
          ))}
        </div>
      </header>

      <AdminControlCenter accessToken={accessToken} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/admin" label="System reset requests" testId="tile-resets">
          {resets === null ? '…' : ready > 0 ? `${ready} ready to execute` : `${inProgress} in progress`}
        </Tile>
        <Tile href="/admin" label="Last successful backup" testId="tile-backup" tone={backup !== null && !lastBackup ? 'warn' : 'plain'}>
          {backup === null ? '…' : lastBackup ? new Date(lastBackup).toLocaleDateString() : 'None recorded'}
        </Tile>
        <Tile href="/master-data" label="Master data" testId="tile-master-data">
          {products === null || sizes === null ? '…' : `${products.filter((p) => p.isActive).length} products · ${sizes.filter((s) => s.isActive).length} sizes active`}
        </Tile>
      </div>

      <DemoModeSwitch accessToken={accessToken} />
    </div>
  );
}
