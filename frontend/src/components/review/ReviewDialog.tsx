'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { DecisionPanel } from '@/components/review/DecisionPanel';

/** One labelled fact in the details being reviewed. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-paddy-100/60 py-1.5 text-sm last:border-0">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 text-right text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * "Review and decide": everything the approver should read comes first, then the decision, in a window of its own. Used wherever
 * something waits for approval, so nobody has to approve (or reject) from a bare row of buttons.
 * Rejecting always needs a comment (see DecisionPanel).
 */
export function ReviewDialog({
  open,
  title,
  subtitle,
  details,
  approveLabel,
  approveNotePlaceholder,
  rejectPrompt,
  onApprove,
  onReject,
  onClose,
  canApprove,
  canReject,
}: {
  canApprove?: boolean;
  canReject?: boolean;
  open: boolean;
  title: string;
  subtitle?: string;
  details: ReactNode;
  approveLabel?: string;
  approveNotePlaceholder?: string;
  rejectPrompt?: string;
  onApprove: (note?: string) => Promise<unknown>;
  onReject: (comment: string) => Promise<unknown>;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-paddy-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="review-title" className="font-display text-lg text-paddy-900">{title}</h2>
            {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-500 hover:bg-rice-50">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Read the details first</p>
          <div>{details}</div>
          <div className="rounded-xl border border-husk-300 bg-husk-100/30 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your decision</p>
            <DecisionPanel
              approveLabel={approveLabel}
              approveNotePlaceholder={approveNotePlaceholder}
              rejectPrompt={rejectPrompt}
              onApprove={onApprove}
              onReject={onReject}
              onDone={onClose}
              canApprove={canApprove}
              canReject={canReject}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
