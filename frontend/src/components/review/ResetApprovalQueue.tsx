'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReviewDialog } from '@/components/review/ReviewDialog';
import { ResetRequestDetails } from '@/components/review/EntityDetails';
import { type ResetRequest, systemResetApi } from '@/lib/api-client';

const FINISHED = ['APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED'];

/**
 * The system reset requests waiting for sign-off. A reset needs the Finance Director AND the Managing Director (or CEO) to approve before the Administrator
 * can carry it out; nobody approves their own request. Used on My Office and on the Finance Director's, MD's and CEO's dashboards.
 */
export function ResetApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ResetRequest[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    systemResetApi.list(accessToken).then((all) => setItems((Array.isArray(all) ? all : []).filter((r) => !FINISHED.includes(r.status)))).catch(() => {}).finally(() => setLoaded(true));
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);
  const current = items.find((r) => r.id === reviewing) ?? null;

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6" data-testid="reset-queue">
      <h2 className="font-display text-lg text-paddy-900">System reset requests</h2>
      <p className="mt-1 text-sm text-ink-500" data-testid="reset-count">{items.length} awaiting sign-off. A reset needs both the Finance Director and the MD (or CEO) before the Administrator can carry it out.</p>
      <div className="mt-4 space-y-3">
        {items.map((req) => (
          <div key={req.id} className="rounded-lg bg-white p-4" data-testid="reset-item" data-number={req.requestNumber}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-ink-500">{req.requestNumber}</p>
                <p className="font-medium text-ink-900">{req.scope}</p>
                <p className="text-sm text-ink-500">{req.reason}</p>
              </div>
              <button type="button" data-testid="reset-review" onClick={() => setReviewing(req.id)} className="shrink-0 rounded-full bg-paddy-900 px-4 py-1 text-xs font-medium text-rice-50">Review</button>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-ink-500">
              <span>Finance: {req.financeApprovedBy ? `approved by ${req.financeApprovedBy.firstName}` : 'waiting'}</span>
              <span>MD or CEO: {req.mdApprovedBy ? `approved by ${req.mdApprovedBy.firstName}` : 'waiting'}</span>
            </div>
          </div>
        ))}
        {loaded && items.length === 0 && <p className="text-sm text-ink-500" data-testid="reset-empty">Nothing waiting. You are caught up.</p>}
      </div>
      <ReviewDialog
        open={!!current}
        title={current ? `Reset request ${current.requestNumber}` : ''}
        subtitle={current?.scope}
        details={current ? <ResetRequestDetails request={current} /> : null}
        rejectPrompt="Why should this reset not go ahead? The person who asked for it will read this."
        onApprove={async () => { await systemResetApi.approve(accessToken, reviewing!); load(); }}
        onReject={async (comment) => { await systemResetApi.reject(accessToken, reviewing!, comment); load(); }}
        onClose={() => setReviewing(null)}
      />
    </div>
  );
}
