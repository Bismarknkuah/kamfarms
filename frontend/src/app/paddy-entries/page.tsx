'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { PaddyIntakeForm } from '@/components/intake/PaddyIntakeForm';
import { ReviewDialog } from '@/components/review/ReviewDialog';
import { PaddyEntryDetails } from '@/components/review/EntityDetails';
import { paddyEntriesApi, farmsApi, paddyGradesApi, PaddyEntry, Farm, PaddyGrade, PaddyEntryComment, ApiError } from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUBMITTED: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function PaddyEntriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [entries, setEntries] = useState<PaddyEntry[] | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Approving and rejecting happen inside the review window, after the details have been read; a rejection always carries a comment.
  const [reviewing, setReviewing] = useState<PaddyEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<PaddyEntryComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);


  const loadEntries = (token: string) => {
    paddyEntriesApi
      .list(token)
      .then(setEntries)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load paddy entries.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadEntries(accessToken);
    farmsApi.list(accessToken).then(setFarms).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

  const totalApprovedKg = entries?.filter((e) => e.status === 'APPROVED').reduce((sum, e) => sum + e.weightKg, 0) ?? 0;

  const runAction = async (fn: () => Promise<unknown>, success?: string) => {
    if (!accessToken) return;
    setPageError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      loadEntries(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const onPostComment = async (entryId: string) => {
    if (!accessToken || !newComment.trim()) return;
    setPostingComment(true);
    try {
      await paddyEntriesApi.addComment(accessToken, entryId, newComment.trim());
      setNewComment('');
      const updated = await paddyEntriesApi.listComments(accessToken, entryId);
      setComments(updated);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to post comment.');
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Paddy entries</h1>
          <p className="mt-1 text-sm text-ink-500">
            {entries ? `${entries.length} entries` : 'Loading…'} · {totalApprovedKg.toLocaleString()} KG approved
          </p>
        </div>
        {hasPermission('paddy.create') && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
            {showCreate ? 'Cancel' : 'Log paddy intake'}
          </button>
        )}
      </div>

      {notice && <p role="status" data-testid="page-notice" className="mt-4 rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {pageError && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{pageError}</p>}

      {showCreate && accessToken && (
        <PaddyIntakeForm accessToken={accessToken} farms={farms} grades={grades} canSubmit={hasPermission('paddy.submit')} onSaved={() => loadEntries(accessToken)} />
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">Farm</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {entries?.map((e) => (
              <>
                <tr key={e.id} className={expandedId === e.id ? 'bg-rice-50' : undefined}>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">
                    <button
                      type="button"
                      onClick={() => {
                        const next = expandedId === e.id ? null : e.id;
                        setExpandedId(next);
                        if (next) paddyEntriesApi.listComments(accessToken!, next).then(setComments).catch(() => setComments([]));
                      }}
                      className="flex items-center gap-1.5 hover:text-paddy-900"
                    >
                      <span className={`transition-transform ${expandedId === e.id ? 'rotate-90' : ''}`}>›</span>
                      <span className="flex flex-col items-start text-left">
                        <span>{e.entryNumber}</span>
                        {e.intakeRef && <span className="text-[10px] text-ink-500" data-testid="entry-intake">Intake {e.intakeRef}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-ink-900">{e.farm.name}</td>
                  <td className="px-4 py-3 text-ink-700">{e.paddyGrade.label}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {e.bagCount} bags / {e.weightKg.toLocaleString()} KG{e.weightEstimated ? <span className="text-ink-500"> (est.)</span> : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-ink-500/10'}`}>{e.status}</span>
                    {e.rejectionReason && <p className="mt-1 text-xs text-red-600">{e.rejectionReason}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {e.status === 'DRAFT' && hasPermission('paddy.submit') && (
                        <button type="button" onClick={() => runAction(() => paddyEntriesApi.submit(accessToken!, e.id), `${e.entryNumber} submitted for approval.`)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-paddy-50">
                          Submit
                        </button>
                      )}
                      {e.status === 'SUBMITTED' && (hasPermission('paddy.approve') || hasPermission('paddy.reject')) && (
                        <button type="button" onClick={() => setReviewing(e)} className="rounded-full bg-paddy-900 px-4 py-1 text-xs font-medium text-rice-50">
                          Review
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === e.id && (
                  <tr className="bg-rice-50">
                    <td colSpan={6} className="px-4 pb-4 pt-0">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-paddy-100 bg-white p-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Submitted by</p>
                          <p className="text-ink-900">{e.submittedBy.firstName} {e.submittedBy.lastName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Entry date</p>
                          <p className="text-ink-900">{new Date(e.entryDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Harvest date</p>
                          <p className="text-ink-900">{e.harvestDate ? new Date(e.harvestDate).toLocaleDateString() : 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Moisture</p>
                          <p className="text-ink-900">{e.moisturePercent !== null ? `${e.moisturePercent}%` : 'Not measured'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Quality grade</p>
                          <p className="text-ink-900">{e.qualityGrade ?? 'Not recorded'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Weight source</p>
                          <p className="text-ink-900">{e.weightEstimated ? 'Estimated from bag count' : 'Measured on a scale'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Supplier</p>
                          <p className="text-ink-900">{e.supplierName ?? 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Storage location</p>
                          <p className="text-ink-900">{e.storageLocation ?? 'Not provided'}</p>
                        </div>
                        {e.notes && (
                          <div className="col-span-2 sm:col-span-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Notes</p>
                            <p className="text-ink-900">{e.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-xl border border-paddy-100 bg-white p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Questions &amp; discussion</p>
                        <div className="mt-2 space-y-2">
                          {comments.map((c) => (
                            <div key={c.id} className="rounded-lg bg-rice-50 px-3 py-1.5 text-sm">
                              <p className="text-xs font-medium text-paddy-900">{c.author.firstName} {c.author.lastName} <span className="font-normal text-ink-500">{new Date(c.createdAt).toLocaleString()}</span></p>
                              <p className="text-ink-700">{c.message}</p>
                            </div>
                          ))}
                          {comments.length === 0 && <p className="text-xs text-ink-500">No questions yet.</p>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={newComment}
                            onChange={(ev) => setNewComment(ev.target.value)}
                            onKeyDown={(ev) => ev.key === 'Enter' && onPostComment(e.id)}
                            placeholder="Ask a question or leave a note…"
                            className="flex-1 rounded-lg border border-paddy-100 px-3 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            disabled={postingComment || !newComment.trim()}
                            onClick={() => onPostComment(e.id)}
                            className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                          >
                            {postingComment ? 'Posting…' : 'Post'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {entries?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No paddy entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <ReviewDialog
        open={!!reviewing}
        title={reviewing ? `Paddy entry ${reviewing.entryNumber}` : ''}
        subtitle={reviewing ? `${reviewing.farm.name}, ${reviewing.weightKg.toLocaleString()} KG` : undefined}
        details={reviewing ? <PaddyEntryDetails entry={reviewing} /> : null}
        canApprove={hasPermission('paddy.approve')}
        canReject={hasPermission('paddy.reject')}
        rejectPrompt="Why is this entry not approved? The person who entered it will read this."
        onApprove={async () => { await paddyEntriesApi.approve(accessToken!, reviewing!.id); loadEntries(accessToken!); }}
        onReject={async (comment) => { await paddyEntriesApi.reject(accessToken!, reviewing!.id, comment); loadEntries(accessToken!); }}
        onClose={() => setReviewing(null)}
      />
    </DashboardShell>
  );
}
