'use client';

import { overviewApi, type OvAudit } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MultiTrend, PlaceBars } from './analytics-parts';

/** For the Auditor: how well the controls are working. Corrections, rejections, flags and sign-in trouble, counted. */
export function AuditAnalytics({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvAudit>((d) => overviewApi.audit(accessToken, d));
  const d = a.data;
  const t = d?.totals;
  return (
    <AnalyticsFrame id="audit-analytics" title="Controls and audit trail" note="Stock corrections, rejected records, flagged figures and sign-in trouble." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d}>
      {d && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Actions recorded" value={t.recorded.toLocaleString('en-US')} tone="dark" id="audit-recorded" />
            <Kpi label="Stock corrections" value={`${t.corrections}`} note={`${t.correctionsApproved} approved, ${t.correctionsRejected} refused, ${t.correctionsWaiting} waiting`} tone={t.correctionsWaiting ? 'warn' : 'plain'} id="audit-corrections" />
            <Kpi label="Records sent back" value={`${t.rejectedPaddy + t.rejectedRuns}`} note={`${t.rejectedPaddy} paddy, ${t.rejectedRuns} milling`} id="audit-rejected" />
            <Kpi label="Failed sign-ins" value={`${t.failedSignIns}`} note={`${t.flaggedRuns} off-balance runs, ${t.countGaps} count gaps`} tone={t.failedSignIns > 10 ? 'warn' : 'plain'} id="audit-failed" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="audit-trend" title="Activity over time" note="Actions recorded and failed sign-ins."><MultiTrend unit={d.unit} rows={d.trend} series={[{ key: 'recorded', label: 'Actions', color: '#1F4D2C' }, { key: 'failedSignIns', label: 'Failed sign-ins', color: '#B4402B' }]} /></ChartCard></div>
            <ChartCard id="audit-areas" title="Where the activity is" note="Actions by area."><PlaceBars label="Actions" rows={d.activityByArea.map((r) => ({ name: r.name, value: r.count }))} format={(n) => `${n}`} color="#3B8266" /></ChartCard>
          </div>
        </div>
      )}
    </AnalyticsFrame>
  );
}
