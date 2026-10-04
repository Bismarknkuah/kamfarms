'use client';

import type { DispatchView, RequestCard } from '@/lib/api-client';
import { longDate } from '@/lib/dates';

const ghs = (n: number) => `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex gap-3 py-1">
    <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
    <dd className="min-w-0 flex-1 text-sm text-ink-900">{children}</dd>
  </div>
);
const H = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 font-display text-base text-paddy-900">{children}</h4>;

/**
 * Everything the supervisor should read BEFORE approving a dispatch: what was asked (and where it goes), what the farm manager actually
 * loaded against it, the truck, and what the trip cost. Shown in the review window, above the decision.
 */
export function DispatchDetails({ card, dispatch }: { card: RequestCard; dispatch: DispatchView }) {
  const asked = new Map(card.lines.map((l) => [l.gradeLabel, l.bagCount]));
  const w = card.warehouse;
  return (
    <div className="space-y-5" data-testid="dispatch-details">
      <section>
        <H>What was asked</H>
        <dl>
          <Row label="Route">{card.farm.name} &rarr; <strong>{w.name}</strong>{w.location ? ` (${w.location})` : ''}</Row>
          {card.requestedDate && <Row label="Needed by">{longDate(card.requestedDate)}{card.priority !== 'NORMAL' ? `, ${card.priority.toLowerCase()} priority` : ''}</Row>}
          {card.notes && <Row label="Instructions">{card.notes}{card.requestedBy ? ` (${card.requestedBy})` : ''}</Row>}
        </dl>
      </section>
      <section>
        <H>What was loaded</H>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="dispatch-loaded">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-1 pr-3 font-medium">Size</th><th className="py-1 pr-3 font-medium">Asked</th><th className="py-1 pr-3 font-medium">Loaded</th><th className="py-1 font-medium">Weight</th></tr></thead>
            <tbody>
              {dispatch.lines.map((l) => {
                const want = asked.get(l.gradeLabel);
                const diff = want === undefined ? 0 : l.bags - want;
                return (
                  <tr key={l.reportId} className="border-t border-paddy-100">
                    <td className="py-1.5 pr-3 font-medium">{l.gradeLabel}</td>
                    <td className="py-1.5 pr-3 text-ink-700">{want ?? ' - '}</td>
                    <td className="py-1.5 pr-3"><strong>{l.bags}</strong>{diff !== 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{Math.abs(diff)} {diff < 0 ? 'fewer' : 'more'} than asked</span>}</td>
                    <td className="py-1.5 text-ink-700">{Math.round(l.kg).toLocaleString('en-US')} kg{l.kgEstimated ? ' (estimated from the bags)' : ''}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-paddy-100 font-medium"><td className="py-1.5 pr-3">All sizes</td><td className="py-1.5 pr-3">{card.totalBags}</td><td className="py-1.5 pr-3">{dispatch.totalBags}</td><td className="py-1.5">{Math.round(dispatch.totalKg).toLocaleString('en-US')} kg</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <H>The truck</H>
        <dl>
          <Row label="Driver">{dispatch.driverName ? `${dispatch.driverName}${dispatch.driverPhone ? ` (${dispatch.driverPhone})` : ''}` : <span className="text-amber-800">Not entered</span>}</Row>
          <Row label="Vehicle">{dispatch.vehiclePlate ? `${dispatch.vehiclePlate}${dispatch.vehicleType ? `, ${dispatch.vehicleType}` : ''}` : <span className="text-amber-800">Not entered</span>}</Row>
          {(dispatch.departureDate || dispatch.departureTime) && <Row label="Leaves">{[longDate(dispatch.departureDate), dispatch.departureTime].filter(Boolean).join(' at ')}</Row>}
          {dispatch.expectedArrivalTime && <Row label="Expected there">{dispatch.expectedArrivalTime}</Row>}
          {dispatch.remarks && <Row label="Remarks">{dispatch.remarks}</Row>}
        </dl>
      </section>
      <section>
        <H>What the trip cost</H>
        <dl>
          <Row label="Labour">{ghs(dispatch.labourCost)}{dispatch.numberOfLabourers ? ` (${dispatch.numberOfLabourers} labourers)` : ''}</Row>
          <Row label="Transport">{ghs(dispatch.transportationFee)}</Row>
          <Row label="Other">{ghs(dispatch.otherCosts)}{dispatch.otherCostsDescription ? ` (${dispatch.otherCostsDescription})` : ''}</Row>
          <Row label="Total"><strong>{ghs(dispatch.totalCost)}</strong></Row>
        </dl>
      </section>
      <p className="text-xs text-ink-500">Prepared by {dispatch.preparedBy || 'the farm manager'}{dispatch.submittedAt ? ` on ${longDate(dispatch.submittedAt)}` : ''}. Approving sends every size above out of the farm together; sending it back returns all of it.</p>
    </div>
  );
}
