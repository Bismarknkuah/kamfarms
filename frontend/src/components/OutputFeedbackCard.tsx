'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Activity } from 'lucide-react';
import { aiApi, isAiFeedback, type AiFeedback } from '@/lib/api-client';

type Data = Extract<AiFeedback, { available: true }>;

/**
 * For the MD and CEO's home page: the last week's milling output against what the AI expected, and the runs that fell
 * outside it. It shows nothing at all when there is nothing to say or the server cannot say it, rather than an error.
 */
export function OutputFeedbackCard({ accessToken }: { accessToken: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    aiApi.feedback(accessToken, 7).then((r) => { if (live && isAiFeedback(r) && r.available && r.summary.runs > 0) setD(r); }).catch(() => undefined);
    return () => { live = false; };
  }, [accessToken]);
  if (!d) return null;
  const s = d.summary;
  const notable = d.runs.filter((r) => !r.early && r.verdict !== 'as_expected').slice(0, 3);
  return (
    <section data-testid="output-feedback-card" className="mb-6 rounded-2xl border border-paddy-100 bg-white p-5" aria-label="Output against expectations">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500"><Activity className="h-4 w-4 text-paddy-700" aria-hidden="true" /> Output against expectations, last 7 days</p>
          <p className="mt-1 font-display text-lg text-paddy-900" data-testid="ofc-counts">
            {s.runs} milling run{s.runs === 1 ? '' : 's'}: {s.asExpected} as expected, {s.more} more, {s.less} less{s.early ? `, ${s.early} early estimate${s.early === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <Link href="/assistant" data-testid="ofc-link" className="inline-flex items-center gap-1.5 rounded-full bg-paddy-900 px-4 py-2 text-xs font-semibold text-rice-50 hover:bg-paddy-700">See every milling center <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
      {notable.length > 0 ? (
        <ul className="mt-3 space-y-1.5" data-testid="ofc-notable">
          {notable.map((r) => <li key={r.id} className={`rounded-lg px-3 py-2 text-sm ${r.verdict === 'less' ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>{r.sentence}</li>)}
        </ul>
      ) : <p className="mt-3 text-sm text-ink-500" data-testid="ofc-fine">Every run this week gave what was expected.</p>}
    </section>
  );
}
