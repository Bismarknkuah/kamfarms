'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';

/** The shortest comment accepted when rejecting. The server enforces the same rule; this tells the person before they send. */
export const MIN_COMMENT = 3;

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not go through. Please try again.');

/**
 * Approve or reject, the same way everywhere in the system. Approving can carry an optional note; REJECTING ALWAYS NEEDS A
 * COMMENT, and the Confirm button stays off until one is written, so nobody can reject without saying why.
 * Show it beneath the details of whatever is being decided, so the person has read them first.
 */
export function DecisionPanel({
  approveLabel = 'Approve',
  approveNotePlaceholder,
  rejectLabel = 'Reject',
  rejectPrompt = 'Say why. The person who sent it will read your comment.',
  onApprove,
  onReject,
  onDone,
  canApprove = true,
  canReject = true,
}: {
  canApprove?: boolean;
  canReject?: boolean;
  approveLabel?: string;
  approveNotePlaceholder?: string;
  rejectLabel?: string;
  rejectPrompt?: string;
  onApprove: (note?: string) => Promise<unknown>;
  onReject: (comment: string) => Promise<unknown>;
  onDone?: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentOk = comment.trim().length >= MIN_COMMENT;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="decision-panel">
      {!canApprove && !canReject && <p className="text-xs text-ink-500">You can read this, but you do not have permission to decide it.</p>}
      {rejecting ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-700" htmlFor="reject-comment">
            Your comment <span className="text-red-700">(required)</span>
          </label>
          <textarea
            id="reject-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            maxLength={500}
            aria-required="true"
            aria-invalid={touched && !commentOk}
            aria-describedby="reject-help"
            placeholder={rejectPrompt}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${touched && !commentOk ? 'border-red-400' : 'border-paddy-100'}`}
          />
          <p id="reject-help" className={`text-xs ${touched && !commentOk ? 'text-red-700' : 'text-ink-500'}`}>
            A comment is required when rejecting: write at least {MIN_COMMENT} characters.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy || !commentOk}
              onClick={() => run(() => onReject(comment.trim()))}
              className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Confirm rejection'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setRejecting(false); setError(null); }} className="text-xs text-ink-500">
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          {canApprove && approveNotePlaceholder && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={approveNotePlaceholder}
              aria-label={approveNotePlaceholder}
              maxLength={300}
              className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {canApprove && <button
              type="button"
              disabled={busy}
              onClick={() => run(() => onApprove(note.trim() || undefined))}
              className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
            >
              {busy ? 'Working...' : approveLabel}
            </button>}
            {canReject && <button
              type="button"
              disabled={busy}
              onClick={() => { setRejecting(true); setError(null); }}
              className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
            >
              {rejectLabel}
            </button>}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
