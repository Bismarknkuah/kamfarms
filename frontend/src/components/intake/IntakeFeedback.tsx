'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { PaddyIntakeResult } from '@/lib/api-client';

const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;

/**
 * What the person sees after saving an intake, so they KNOW it went through: what was recorded, under which reference, and what happens
 * next. It stays on screen until they dismiss it (it does not vanish after a few seconds).
 */
export function IntakeSuccess({ result, onAnother, onClose }: { result: PaddyIntakeResult; onAnother?: () => void; onClose?: () => void }) {
  return (
    <div role="status" data-testid="intake-success" className="rounded-2xl border-2 border-paddy-700 bg-paddy-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-paddy-900">
        <CheckCircle2 className="h-5 w-5 text-paddy-700" aria-hidden="true" />
        {result.submitted ? 'Intake submitted' : 'Intake saved as a draft'}
      </p>
      <p className="mt-1 text-sm text-ink-700">
        {result.submitted ? 'It is now waiting for approval.' : 'It is not sent for approval yet: submit each entry from the list when you are ready.'}{' '}
        <span className="font-mono text-xs text-ink-500" data-testid="intake-ref">{result.intakeRef}</span>
      </p>
      <ul className="mt-3 space-y-1 rounded-xl bg-white px-4 py-3 text-sm" data-testid="intake-lines">
        {result.entries.map((e) => (
          <li key={e.id} className="flex justify-between gap-3">
            <span className="text-ink-900">{e.gradeLabel}: <strong>{e.bagCount} bag{e.bagCount === 1 ? '' : 's'}</strong></span>
            <span className="text-ink-500">{kg(e.weightKg)}{e.weightEstimated ? ' (estimated from the bags)' : ''} &middot; {e.entryNumber}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-paddy-100 pt-1 font-medium text-paddy-900">
          <span>{result.farmName}: {result.totalBags} bag{result.totalBags === 1 ? '' : 's'} in all</span>
          <span>{kg(result.totalKg)}</span>
        </li>
      </ul>
      {(onAnother || onClose) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {onAnother && <button type="button" onClick={onAnother} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">Record another intake</button>}
          {onClose && <button type="button" onClick={onClose} className="text-xs text-ink-500">Dismiss</button>}
        </div>
      )}
    </div>
  );
}

/** What the person sees when saving failed: plainly that NOTHING was saved, and the reason the server gave. Their entries stay as they were typed. */
export function IntakeFailure({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div role="alert" data-testid="intake-failure" className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
      <p className="flex items-center gap-2 font-display text-lg text-red-800">
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        This intake was NOT submitted
      </p>
      <p className="mt-1 text-sm text-red-800">Nothing was saved, so you can safely try again.</p>
      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-ink-900" data-testid="intake-failure-reason"><span className="font-medium">Reason:</span> {message}</p>
      {onClose && <button type="button" onClick={onClose} className="mt-3 text-xs text-ink-500">Dismiss</button>}
    </div>
  );
}
