/** One picture of a paddy transfer between warehouses, for the sender and the receiver. */
type When = Date | string | null | undefined;
const iso = (d: When) => (d ? new Date(d).toISOString() : null);
export interface TransferLine { paddyGradeId: string; gradeLabel: string; bags: number }
export interface PaddyTransferView {
  id: string; transferNumber: string; status: 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'; label: string;
  /** IN: it is coming to a warehouse the person looks after; OUT: they sent it; BOTH: they look after both ends (or see everything). */
  direction: 'IN' | 'OUT' | 'BOTH';
  from: { id: string; name: string }; to: { id: string; name: string };
  lines: TransferLine[]; totalBags: number; driverName: string | null; vehiclePlate: string | null; notes: string | null;
  sentBy: string; sentAt: string | null; receivedBy: string | null; receivedAt: string | null;
  receivedLines: TransferLine[] | null; varianceBags: number | null; receiveNote: string | null; cancelReason: string | null;
  supplyRequestNumber: string | null;
}
export interface TransferContext { users: Map<string, string>; warehouses: Map<string, string> }
const nameOf = (m: Map<string, string>, id?: string | null) => (id ? m.get(id) ?? '' : '');
export const bagsText = (lines: { gradeLabel: string; bags: number }[]) => lines.filter((l) => l.bags > 0).map((l) => `${l.gradeLabel}: ${l.bags}`).join(', ');
export function transferLabel(r: { status: string; varianceBags?: number | null }, toName: string): string {
  if (r.status === 'CANCELLED') return 'Cancelled';
  if (r.status === 'IN_TRANSIT') return `On the road to ${toName}`;
  const v = r.varianceBags ?? 0;
  return v === 0 ? `Arrived at ${toName}` : `Arrived at ${toName}: ${Math.abs(v)} bag${Math.abs(v) === 1 ? '' : 's'} ${v < 0 ? 'short' : 'extra'}`;
}
export function buildTransferView(r: any, ctx: TransferContext): PaddyTransferView {
  const to = nameOf(ctx.warehouses, r.toWarehouseId) || 'the warehouse';
  return {
    id: r.id, transferNumber: r.transferNumber, status: r.status, label: transferLabel(r, to), direction: 'BOTH',
    from: { id: r.fromWarehouseId, name: nameOf(ctx.warehouses, r.fromWarehouseId) || 'the warehouse' }, to: { id: r.toWarehouseId, name: to },
    lines: (r.lines ?? []) as TransferLine[], totalBags: Number(r.totalBags), driverName: r.driverName ?? null, vehiclePlate: r.vehiclePlate ?? null, notes: r.notes ?? null,
    sentBy: nameOf(ctx.users, r.sentById), sentAt: iso(r.sentAt), receivedBy: nameOf(ctx.users, r.receivedById) || null, receivedAt: iso(r.receivedAt),
    receivedLines: (r.receivedLines ?? null) as TransferLine[] | null, varianceBags: r.varianceBags ?? null, receiveNote: r.receiveNote ?? null, cancelReason: r.cancelReason ?? null,
    supplyRequestNumber: r.supplyRequestNumber ?? null,
  };
}
