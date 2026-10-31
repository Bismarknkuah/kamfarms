'use client';

import { overviewApi, type OvSystem } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MultiTrend, PlaceBars } from './analytics-parts';

/** The Administrator's view of the system itself: who can sign in, how sign-ins are going, and how much is being changed. */
export function SystemAnalytics({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvSystem>((d) => overviewApi.system(accessToken, d));
  const d = a.data;
  return (
    <AnalyticsFrame id="system-analytics" title="The system at a glance" note="People with access, how sign-ins are going, and what is being changed." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d}>
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="People" value={`${d.users.total}`} note={`${d.users.active} active`} tone="dark" id="sys-people" />
            <Kpi label="Switched off or locked" value={`${d.users.disabled + d.users.locked}`} note={`${d.users.disabled} off, ${d.users.locked} locked`} tone={d.users.locked > 0 ? 'warn' : 'plain'} id="sys-off" />
            <Kpi label="Sign-ins" value={`${d.totals.signedIn}`} note={`last ${d.days} days`} id="sys-signins" />
            <Kpi label="Failed sign-ins" value={`${d.totals.failed}`} note={d.totals.failed > 0 ? 'wrong password or locked' : 'none'} tone={d.totals.failed > 5 ? 'warn' : 'plain'} id="sys-failed" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="sys-trend" title={`Sign-ins and failures, ${d.unit === 'day' ? 'per day' : 'per week'}`}><MultiTrend unit={d.unit} rows={d.trend} series={[{ key: 'signedIn', label: 'Signed in', color: '#1F4D2C' }, { key: 'failed', label: 'Failed', color: '#B4402B' }]} /></ChartCard></div>
            <ChartCard id="sys-changes" title="What is being recorded" note={`${d.totals.recorded} entries in the audit log.`}><PlaceBars label="Audit entries by area" rows={d.activityByArea.map((x) => ({ name: x.name, value: x.count }))} format={(n) => `${n}`} color="#C9972B" /></ChartCard>
          </div>
          {d.failedReasons.length > 0 && <ChartCard id="sys-reasons" title="Why sign-ins failed"><PlaceBars label="Failed sign-in reasons" rows={d.failedReasons.map((x) => ({ name: x.name, value: x.count }))} format={(n) => `${n}`} color="#B4402B" /></ChartCard>}
        </div>
      )}
    </AnalyticsFrame>
  );
}
