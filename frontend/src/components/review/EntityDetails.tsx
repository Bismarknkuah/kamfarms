'use client';

import type { DeliveryReport, Expense, PaddyEntry, Payment, ProductionRecord, ResetRequest } from '@/lib/api-client';
import { Detail } from '@/components/review/ReviewDialog';

/**
 * What an approver reads before deciding, for each kind of thing that waits for approval. Used by the module screens AND by My Office,
 * so the same item shows the same facts wherever it is decided.
 */
const ghs = (n: number) => `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '-');
const person = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '-');
const kg = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} KG`;
const List = ({ children }: { children: React.ReactNode }) => <dl className="rounded-xl border border-paddy-100 bg-rice-50/40 px-4 py-2">{children}</dl>;

/** A photo is shown; anything else is offered as a link. */
function Attachment({ url, label }: { url: string | null; label: string }) {
  if (!url) return <p className="mt-2 rounded-lg bg-rice-50 px-3 py-2 text-xs text-ink-500">No {label.toLowerCase()} attached.</p>;
  if (url.startsWith('data:image')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block" aria-label={`Open the ${label.toLowerCase()}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="max-h-60 w-full rounded-lg border border-paddy-100 object-contain" />
      </a>
    );
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-paddy-700 underline">Open the {label.toLowerCase()}</a>;
}

export function ExpenseDetails({ expense: e }: { expense: Expense }) {
  return (
    <div>
      <List>
        <Detail label="Number">{e.expenseNumber}</Detail>
        <Detail label="Category">{e.customCategoryLabel ? `${e.category.name}: ${e.customCategoryLabel}` : e.category.name}</Detail>
        <Detail label="Amount"><span className="font-medium">{ghs(e.amount)}</span></Detail>
        <Detail label="Date">{day(e.date)}</Detail>
        <Detail label="For">{e.farm?.name ?? e.warehouse?.name ?? 'Head office'}</Detail>
        {e.paymentMethod && <Detail label="Paid by">{e.paymentMethod.replace(/_/g, ' ').toLowerCase()}</Detail>}
        {e.reference && <Detail label="Reference">{e.reference}</Detail>}
        {e.itemDescription && <Detail label="Item received">{e.itemDescription}</Detail>}
        {e.notes && <Detail label="Notes">{e.notes}</Detail>}
        <Detail label="Entered by">{person(e.submittedBy)}</Detail>
      </List>
      <Attachment url={e.attachmentUrl} label="Receipt" />
    </div>
  );
}

export function PaddyEntryDetails({ entry: e }: { entry: PaddyEntry }) {
  return (
    <List>
      <Detail label="Number">{e.entryNumber}</Detail>
      {e.intakeRef && <Detail label="Intake">{e.intakeRef}</Detail>}
      <Detail label="Farm">{e.farm.name} ({e.farm.code})</Detail>
      <Detail label="Grade">{e.paddyGrade.label}</Detail>
      <Detail label="Weight"><span className="font-medium">{kg(e.weightKg)}</span>{e.weightEstimated ? ' (estimated)' : ''}</Detail>
      <Detail label="Bags">{e.bagCount.toLocaleString()}</Detail>
      <Detail label="Entry date">{day(e.entryDate)}</Detail>
      {e.harvestDate && <Detail label="Harvested">{day(e.harvestDate)}</Detail>}
      {e.moisturePercent !== null && <Detail label="Moisture">{e.moisturePercent}%</Detail>}
      {e.qualityGrade && <Detail label="Quality">{e.qualityGrade}</Detail>}
      {e.supplierName && <Detail label="Supplier">{e.supplierName}</Detail>}
      {e.storageLocation && <Detail label="Stored at">{e.storageLocation}</Detail>}
      {e.notes && <Detail label="Notes">{e.notes}</Detail>}
      <Detail label="Entered by">{person(e.submittedBy)}</Detail>
    </List>
  );
}

export function ProductionDetails({ record: r }: { record: ProductionRecord }) {
  return (
    <div>
      {r.massBalanceFlag && (
        <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          The weights do not balance: what came out does not add up to what went in. Check this carefully before approving.
        </p>
      )}
      <List>
        <Detail label="Number">{r.recordNumber}</Detail>
        <Detail label="Milling centre">{r.millingCenter.name}</Detail>
        {r.machine && <Detail label="Machine">{r.machine.machineName}</Detail>}
        <Detail label="Operator">{person(r.operator)}</Detail>
        <Detail label="Date">{day(r.date)}</Detail>
        <Detail label="Paddy milled">{kg(r.paddyProcessedKg)}</Detail>
        <Detail label="Rice recovered"><span className="font-medium">{kg(r.recoveredRiceKg)}</span></Detail>
        <Detail label="Broken rice">{kg(r.brokenRiceKg)}</Detail>
        <Detail label="Rice hull">{kg(r.riceHullKg)}</Detail>
        <Detail label="Waste and loss">{kg(r.wasteLossKg)}</Detail>
        <Detail label="Recovery">{r.recoveryPercent.toFixed(1)}%</Detail>
        {r.sourceReferenceNumbers.length > 0 && <Detail label="Paddy came from">{r.sourceReferenceNumbers.join(', ')}</Detail>}
      </List>
    </div>
  );
}

export function DeliveryReportDetails({ report: r }: { report: DeliveryReport }) {
  return (
    <List>
      <Detail label="Number">{r.reportNumber}</Detail>
      <Detail label="From">{r.farm.name}</Detail>
      <Detail label="To">{r.destinationWarehouse.name}</Detail>
      <Detail label="Grade">{r.paddyGrade.label}</Detail>
      <Detail label="Delivered"><span className="font-medium">{r.actualBagCount.toLocaleString()} bags</span>, {kg(r.actualKg)}{r.actualKgEstimated ? ' (worked out from the bags, not weighed)' : ''}</Detail>
      {r.vehicle && <Detail label="Vehicle">{r.vehicle.plateNumber}</Detail>}
      {r.driver && <Detail label="Driver">{r.driver.name}</Detail>}
      {r.departureTime && <Detail label="Left at">{new Date(r.departureTime).toLocaleString()}</Detail>}
      <Detail label="Labour">{ghs(r.labourCost)}</Detail>
      <Detail label="Transport">{ghs(r.transportationFee)}</Detail>
      {r.otherCosts > 0 && <Detail label={r.otherCostsDescription ?? 'Other costs'}>{ghs(r.otherCosts)}</Detail>}
      <Detail label="Total cost"><span className="font-medium">{ghs(r.totalDeliveryCost)}</span></Detail>
    </List>
  );
}

export function PaymentDetails({ payment: p }: { payment: Payment }) {
  return (
    <div>
      <List>
        <Detail label="Number">{p.paymentNumber}</Detail>
        <Detail label="Customer">{p.customer.name}</Detail>
        <Detail label="Amount"><span className="font-medium">{ghs(p.amount)}</span></Detail>
        <Detail label="Method">{p.method.replace(/_/g, ' ').toLowerCase()}</Detail>
        <Detail label="Paid on">{day(p.paymentDate)}</Detail>
        {p.notes && <Detail label="Notes">{p.notes}</Detail>}
        <Detail label="Recorded by">{person(p.recordedBy)}</Detail>
      </List>
      {p.receiptUrl && /^https?:|^data:image/.test(p.receiptUrl) ? <Attachment url={p.receiptUrl} label="Receipt" /> : <p className="mt-2 rounded-lg bg-rice-50 px-3 py-2 text-xs text-ink-500">{p.receiptUrl ? `Receipt reference: ${p.receiptUrl}` : 'No receipt attached.'}</p>}
    </div>
  );
}

export function ResetRequestDetails({ request: r }: { request: ResetRequest }) {
  return (
    <div>
      <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">A reset can permanently remove data. Read what it covers and why it was asked for.</p>
      <List>
        <Detail label="Number">{r.requestNumber}</Detail>
        <Detail label="Type">{r.resetType.replace(/_/g, ' ').toLowerCase()}</Detail>
        <Detail label="Covers">{r.scope}</Detail>
        <Detail label="Reason given">{r.reason}</Detail>
        <Detail label="Asked by">{person(r.requestedBy)}</Detail>
        <Detail label="Finance Director">{r.financeApprovedBy ? `approved by ${person(r.financeApprovedBy)}` : 'not yet'}</Detail>
        <Detail label="Managing Director">{r.mdApprovedBy ? `approved by ${person(r.mdApprovedBy)}` : 'not yet'}</Detail>
      </List>
    </div>
  );
}
