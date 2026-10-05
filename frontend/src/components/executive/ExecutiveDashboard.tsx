'use client';

import type { MeResponse } from '@/lib/api-client';
import { FinanceDashboard } from './FinanceDashboard';
import { MdDashboard } from './MdDashboard';
import { CeoDashboard } from './CeoDashboard';

export type TopRole = 'FINANCE_DIRECTOR' | 'MD' | 'CEO';
interface Props { me: MeResponse; accessToken: string; hasPermission: (code: string | string[]) => boolean; role: TopRole }

/** The Finance Director, the MD and the CEO each have a dashboard of their own: the money desk, the command of the business, and the scorecard. */
export function ExecutiveDashboard({ me, accessToken, hasPermission, role }: Props) {
  if (role === 'FINANCE_DIRECTOR') return <FinanceDashboard me={me} accessToken={accessToken} />;
  if (role === 'MD') return <MdDashboard me={me} accessToken={accessToken} hasPermission={hasPermission} />;
  return <CeoDashboard me={me} accessToken={accessToken} hasPermission={hasPermission} />;
}
