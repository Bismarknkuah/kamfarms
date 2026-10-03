/**
 * The website and the server (API) are deployed separately, so one can end up newer than the other. The server says
 * which features it has (GET /health); the website knows which it needs. When something is missing the Admin
 * dashboard says so in plain words, instead of pages quietly failing with "404".
 */
export const REQUIRED_API_FEATURES = ['site-content', 'insights', 'settings-registry', 'system-overview', 'reports-catalog', 'admin-access'] as const;

export const FEATURE_LABELS: Record<string, string> = {
  'site-content': 'The homepage editor',
  insights: 'The Watchlist for the MD and CEO',
  'settings-registry': 'System settings',
  'system-overview': 'The Admin control center figures',
  'reports-catalog': 'Report downloads by role',
  'admin-access': 'Full System Administrator access to every screen',
};

/** The commit this website was built from (empty when run locally). */
export const WEB_COMMIT = (process.env.NEXT_PUBLIC_WEB_COMMIT ?? '').slice(0, 7);

/** What the website needs that the server does not have. A server that reports no features at all is missing all of them. */
export function missingFeatures(features: string[] | undefined | null): string[] {
  return REQUIRED_API_FEATURES.filter((f) => !(features ?? []).includes(f));
}
