'use client';

import type { ReactNode } from 'react';
import type { OvPlaceRecent, OvSizeRow } from '@/lib/api-client';
import { PlaceTable, kg } from './analytics-parts';

/** The name of the one place this person works at, shown above their figures. */
export function PlaceHeading({ name, kind, id }: { name: string; kind: string; id: string }) {
  return (
    <div className="mb-3 flex items-center gap-2" data-testid={`${id}-heading`}>
      <span className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-rice-50">{kind}</span>
      <h3 className="font-display text-xl font-medium text-paddy-900" data-testid="place-name">{name}</h3>
    </div>
  );
}

export function SizeTable({ id, title, rows }: { id: string; title: string; rows: OvSizeRow[] }) {
  return <PlaceTable id={id} columns={[{ key: 'label', label: title }, { key: 'bags', label: 'Bags', align: 'right' }, { key: 'kg', label: 'KG', align: 'right' }]} rows={rows.map((r) => ({ label: r.label, bags: r.bags.toLocaleString('en-US'), kg: kg(r.kg) }))} />;
}

const tone = (s: string) => (/REJECT|FAULT|FLAG/.test(s) ? 'bg-red-50 text-red-700' : /APPROV|RECEIVED|RUNNING/.test(s) ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800');
export const Chip = ({ text }: { text: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone(text)}`}>{text.replace(/_/g, ' ').toLowerCase()}</span>;

export function RecentList({ id, title, rows }: { id: string; title: string; rows: OvPlaceRecent[] }) {
  return (
    <div data-testid={id} className="rounded-2xl border border-paddy-100 bg-white p-4">
      <p className="text-sm font-medium text-paddy-900">{title}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-ink-500">Nothing recorded yet.</p> : (
        <ul className="mt-2 divide-y divide-paddy-100">
          {rows.map((r) => (
            <li key={r.ref} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span><span className="font-medium text-ink-900">{r.ref}</span><span className="ml-2 text-ink-500">{r.date} {r.label && `· ${r.label}`}</span></span>
              <span className="flex items-center gap-2 whitespace-nowrap text-ink-700">{r.amount}<Chip text={r.status} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const Box = ({ children }: { children: ReactNode }) => <div className="space-y-5">{children}</div>;
