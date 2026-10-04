'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, MapPin, ShieldAlert, Sparkles, Wrench } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ApiError, aiApi, isAiInsights, type AiInsights } from '@/lib/api-client';
import { AiHero } from '@/components/ai/AiHero';
import { PowerCalculator } from '@/components/ai/PowerCalculator';
import { YieldTables } from '@/components/ai/YieldTables';
import { FeedbackPanel } from '@/components/ai/FeedbackPanel';
import { AssistantPanel } from '@/components/ai/AssistantPanel';

type Load = { kind: 'loading' } | { kind: 'old-server' } | { kind: 'error'; message: string } | { kind: 'ok'; data: AiInsights };

function PlainHeader() {
  return (
    <header className="rounded-3xl bg-paddy-900 px-6 py-7 text-rice-50 sm:px-9" data-testid="ai-hero-plain">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-husk-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-husk-300"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI Insights</span>
      <h1 className="mt-4 font-display text-3xl font-medium sm:text-4xl">What your power and paddy should produce</h1>
    </header>
  );
}

function Notice({ icon: Icon, testId, title, children }: { icon: typeof Wrench; testId: string; title: string; children: React.ReactNode }) {
  return (
    <div role="status" data-testid={testId} className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div><p className="font-semibold">{title}</p><p className="mt-1">{children}</p></div>
    </div>
  );
}

export default function AssistantPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    aiApi.insights(accessToken)
      .then((data) => live && setLoad(isAiInsights(data) ? { kind: 'ok', data } : { kind: 'error', message: 'The server sent the predictions in a form this page does not understand. Ask the System Administrator to check that the server is up to date.' }))
      .catch((err: unknown) => live && setLoad(err instanceof ApiError && err.status === 404 ? { kind: 'old-server' } : { kind: 'error', message: err instanceof ApiError ? err.message : 'The predictions could not be loaded.' }));
    return () => { live = false; };
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const data = load.kind === 'ok' ? load.data : null;
  const ready = data && data.available ? data : null;
  const scoped = data && !data.jurisdiction.companyWide;
  const noPlaces = scoped && data.jurisdiction.label === 'No places assigned yet';

  return (
    <DashboardShell me={me}>
      <div className="mx-auto max-w-6xl space-y-6" data-testid="ai-page">
        {ready ? <AiHero jurisdiction={ready.jurisdiction} rates={ready.overall} bags={ready.bagSizes} runs={ready.window.runs} /> : data ? <AiHero jurisdiction={data.jurisdiction} /> : <PlainHeader />}

        {load.kind === 'loading' && <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden="true" data-testid="ai-loading" />}
        {load.kind === 'old-server' && (
          <Notice icon={Wrench} testId="ai-old-server" title="Your server does not have the AI predictions yet">
            The website is newer than the server it talks to. Ask the System Administrator to update the server (the Administrator dashboard says exactly what is missing). The question box below still works.
          </Notice>
        )}
        {load.kind === 'error' && <Notice icon={ShieldAlert} testId="ai-error" title="The predictions could not be loaded">{load.message}</Notice>}

        {scoped && (
          <p data-testid="ai-scope-note" className="flex items-start gap-2 rounded-2xl border border-husk-500/40 bg-husk-100/40 px-5 py-3 text-sm text-soil-700">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {noPlaces
              ? 'No farm or warehouse is assigned to you yet, so there is nothing to predict from. Ask the System Administrator to assign your places.'
              : <span>You see predictions for your own places only: <strong>{data.jurisdiction.label}</strong>. The MD and CEO see every activity in the company.</span>}
          </p>
        )}

        {data && !data.available && <Notice icon={ShieldAlert} testId="ai-unavailable" title="Predictions are not part of your role">{data.reason} The question box below still answers what your role can see.</Notice>}

        {ready && <PowerCalculator data={ready} />}
        {ready && accessToken && <FeedbackPanel accessToken={accessToken} companyWide={ready.jurisdiction.companyWide} />}
        {ready && <YieldTables data={ready} />}

        {accessToken && <AssistantPanel accessToken={accessToken} />}

        {ready && (
          <details data-testid="ai-how" className="group rounded-3xl border border-paddy-100 bg-white px-6 py-4 text-sm text-ink-700">
            <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-medium text-paddy-900">How these numbers are made <ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden="true" /></summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>The AI keeps learning.</strong> Every approved milling run that recorded its electricity meter teaches it, and recent runs count more than old ones. Runs flagged as not adding up are left out. Each run is judged against what the AI expected before it, which is the feedback shown above.</li>
              <li>Each figure is <strong>all the output divided by all the power</strong> across your approved milling runs that recorded their electricity meter. One odd run cannot swing it.</li>
              <li>The <strong>typical range</strong> shows how much individual runs differ from each other, one spread either side.</li>
              <li>Bags use the weights in System settings under AI predictions: packaged rice {ready.bagSizes.riceKg} kg, broken rice {ready.bagSizes.brokenKg} kg and hull {ready.bagSizes.hullKg} kg ({ready.bagSizes.hullBasis === 'history' ? 'measured from your own runs' : 'a setting, until enough runs record their hull bags'}). Paddy bags are {ready.bagSizes.paddyKg} kg.</li>
              <li>With <strong>fewer than 3 runs</strong> the page shows an industry benchmark and says so. It is never presented as your own data.</li>
              <li>You only ever see <strong>your own places</strong>. The MD and CEO see every activity in the company.</li>
            </ul>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}
