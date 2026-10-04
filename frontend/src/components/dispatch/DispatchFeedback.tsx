'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { DispatchRequestResult, DispatchResult } from '@/lib/api-client';
import { longDate } from '@/lib/dates';

const day = (iso: string) => longDate(iso);

/** After sending a request: exactly what was asked, where it goes, who now has it as a task, and what to do next. It stays until dismissed. */
export function RequestSent({ result, onClose }: { result: DispatchRequestResult; onClose?: () => void }) {
  const w = result.warehouse;
  return (
    <div role="status" data-testid="request-sent" className="rounded-2xl border-2 border-paddy-700 bg-paddy-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-paddy-900"><CheckCircle2 className="h-5 w-5 text-paddy-700" aria-hidden="true" /> Dispatch request sent</p>
      <p className="mt-1 text-sm text-ink-700">
        {result.noTaskCreated ? 'It is saved, but nobody was given it as a task (see below).' : <>It is now on {result.tasks.length === 1 ? `${result.tasks[0].assignedTo}'s` : 'the farm managers\''} task list{result.tasks.length > 0 ? <>: <span className="font-mono text-xs" data-testid="request-tasks">{result.tasks.map((t) => t.taskNumber).join(', ')}</span></> : null}.</>}{' '}
        <span className="font-mono text-xs text-ink-500" data-testid="request-ref">{result.requestRef}</span>
      </p>
      <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm">
        <p className="text-ink-900">Send to <strong>{w.name}</strong>{w.location ? ` (${w.location})` : ''}, needed by <strong>{day(result.requestedDate)}</strong>{result.priority !== 'NORMAL' ? `, ${result.priority.toLowerCase()} priority` : ''}.</p>
        <ul className="mt-2 space-y-0.5" data-testid="request-lines">
          {result.orders.map((o) => <li key={o.id} className="flex justify-between gap-3"><span>{o.gradeLabel}: <strong>{o.bagCount} bag{o.bagCount === 1 ? '' : 's'}</strong></span><span className="font-mono text-xs text-ink-500">{o.orderNumber}</span></li>)}
          <li className="flex justify-between gap-3 border-t border-paddy-100 pt-1 font-medium text-paddy-900"><span>From {result.farmName}</span><span>{result.totalBags} bags in all</span></li>
        </ul>
        {w.contacts.length > 0 && <p className="mt-2 text-xs text-ink-500">Who to ask at the warehouse: {w.contacts.map((c) => (c.phone ? `${c.name} (${c.phone})` : c.name)).join(', ')}</p>}
        {result.notes && <p className="mt-2 rounded-lg bg-rice-50 px-3 py-1.5 text-xs text-ink-700"><span className="font-medium">Your instructions:</span> {result.notes}</p>}
      </div>
      {result.noTaskCreated && (
        <p role="alert" data-testid="request-no-task" className="mt-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {result.noManagerOnFarm ? 'This farm has no manager assigned, so nobody has been given the task. Assign a farm manager, or ask someone to log the dispatch report.' : 'You are the only manager on this farm, so no separate task was made.'}
        </p>
      )}
      <p className="mt-3 text-xs text-ink-500">You can follow each order below: it shows who has it, and when it is on the way and arrives.</p>
      {onClose && <button type="button" onClick={onClose} className="mt-3 text-xs text-ink-500">Dismiss</button>}
    </div>
  );
}

export function RequestFailed({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div role="alert" data-testid="request-failed" className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-red-800"><TriangleAlert className="h-5 w-5" aria-hidden="true" /> The request was NOT sent</p>
      <p className="mt-1 text-sm text-red-800">Nothing was saved, so you can safely try again.</p>
      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-ink-900" data-testid="request-failed-reason"><span className="font-medium">Reason:</span> {message}</p>
      {onClose && <button type="button" onClick={onClose} className="mt-3 text-xs text-ink-500">Dismiss</button>}
    </div>
  );
}

/** After the farm manager sends one dispatch: every size, who has it now, what happens next. It stays until dismissed. */
export function DispatchSent({ result, onClose }: { result: DispatchResult; onClose?: () => void }) {
  return (
    <div role="status" data-testid="dispatch-sent" className="rounded-2xl border-2 border-paddy-700 bg-paddy-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-paddy-900"><CheckCircle2 className="h-5 w-5 text-paddy-700" aria-hidden="true" /> {result.submitted ? 'Dispatch submitted' : 'Dispatch saved as a draft'}</p>
      <p className="mt-1 text-sm text-ink-700">
        {result.submitted ? 'It is now waiting for the Farm Supervisor to approve. Both sizes go together: they are approved, or sent back, as one.' : 'It is not sent yet: open it on the desk and send it for approval when you are ready.'}{' '}
        <span className="font-mono text-xs text-ink-500" data-testid="dispatch-ref">{result.dispatchRef}</span>
      </p>
      <ul className="mt-3 space-y-1 rounded-xl bg-white px-4 py-3 text-sm" data-testid="dispatch-sent-lines">
        {result.lines.map((l) => <li key={l.reportNumber} className="flex justify-between gap-3"><span>{l.gradeLabel}: <strong>{l.bags} bag{l.bags === 1 ? '' : 's'}</strong></span><span className="text-ink-500">{Math.round(l.kg).toLocaleString('en-US')} kg{l.kgEstimated ? ' (estimated from the bags)' : ''}</span></li>)}
        <li className="flex justify-between gap-3 border-t border-paddy-100 pt-1 font-medium text-paddy-900"><span>To {result.warehouse.name}{result.warehouse.location ? ` (${result.warehouse.location})` : ''}</span><span>{result.totalBags} bags in all</span></li>
      </ul>
      {(result.driverName || result.vehiclePlate) && <p className="mt-2 text-xs text-ink-500">{[result.driverName && `Driver ${result.driverName}`, result.vehiclePlate && `vehicle ${result.vehiclePlate}`].filter(Boolean).join(', ')}</p>}
      {onClose && <button type="button" onClick={onClose} className="mt-3 text-xs text-ink-500">Dismiss</button>}
    </div>
  );
}

export function DispatchFailed({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div role="alert" data-testid="dispatch-failed" className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-red-800"><TriangleAlert className="h-5 w-5" aria-hidden="true" /> The dispatch was NOT sent</p>
      <p className="mt-1 text-sm text-red-800">Nothing was saved, so you can safely try again.</p>
      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-ink-900" data-testid="dispatch-failed-reason"><span className="font-medium">Reason:</span> {message}</p>
      {onClose && <button type="button" onClick={onClose} className="mt-3 text-xs text-ink-500">Dismiss</button>}
    </div>
  );
}
