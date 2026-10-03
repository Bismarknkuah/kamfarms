/** What the Watchlist returns, and the words and colours used to show it. */

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type LocationKind = 'MILLING_CENTER' | 'WAREHOUSE' | 'FARM';
export type WatchTab = 'milling' | 'warehouses' | 'farms' | 'expenses';

export interface WatchSignal {
  id: string;
  code: string;
  severity: Severity;
  locationKind: LocationKind;
  locationId: string;
  locationName: string;
  title: string;
  detail: string;
  expected: string | null;
  actual: string | null;
  evidence: string[];
  whatToCheck: string;
  confidence: Confidence;
  tab: WatchTab;
}

export interface WatchLocation {
  kind: LocationKind;
  id: string;
  name: string;
  status: 'CLEAR' | 'WATCH' | 'INVESTIGATE' | 'NOT_ENOUGH_DATA';
  checked: string[];
  skipped: string[];
}

export interface Watchlist {
  generatedAt: string;
  windowDays: number;
  summary: { high: number; medium: number; low: number; total: number; placesToInvestigate: number };
  signals: WatchSignal[];
  locations: WatchLocation[];
}

/** A screen that depends on this must survive a malformed reply, so check the shape before trusting it. */
export function isWatchlist(x: unknown): x is Watchlist {
  const w = x as Watchlist | null;
  return !!w && typeof w === 'object' && Array.isArray(w.signals) && Array.isArray(w.locations) && !!w.summary && typeof w.summary.total === 'number' && typeof w.windowDays === 'number';
}

export const SEVERITY: Record<Severity, { label: string; chip: string; card: string; dot: string }> = {
  HIGH: { label: 'Look into this', chip: 'bg-red-100 text-red-800', card: 'border-red-200 border-l-4 border-l-red-600', dot: 'bg-red-600' },
  MEDIUM: { label: 'Keep an eye on', chip: 'bg-amber-100 text-amber-900', card: 'border-amber-200 border-l-4 border-l-amber-500', dot: 'bg-amber-500' },
  LOW: { label: 'For information', chip: 'bg-paddy-50 text-paddy-900', card: 'border-paddy-100 border-l-4 border-l-paddy-300', dot: 'bg-paddy-300' },
};

export const STATUS: Record<WatchLocation['status'], { label: string; chip: string }> = {
  CLEAR: { label: 'Nothing unusual', chip: 'bg-emerald-100 text-emerald-800' },
  WATCH: { label: 'Keep an eye', chip: 'bg-amber-100 text-amber-900' },
  INVESTIGATE: { label: 'Look into this', chip: 'bg-red-100 text-red-800' },
  NOT_ENOUGH_DATA: { label: 'Not enough records to judge', chip: 'bg-ink-500/10 text-ink-700' },
};

export const KIND_LABEL: Record<LocationKind, { singular: string; plural: string }> = {
  MILLING_CENTER: { singular: 'Milling center', plural: 'Milling centers' },
  WAREHOUSE: { singular: 'Warehouse', plural: 'Warehouses' },
  FARM: { singular: 'Farm', plural: 'Farms' },
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { HIGH: 'Strong history behind this', MEDIUM: 'Fair history behind this', LOW: 'Thin history behind this' };
export const TAB_LABEL: Record<WatchTab, string> = { milling: 'Milling and power', warehouses: 'Warehouses', farms: 'Farms', expenses: 'Expenses' };
