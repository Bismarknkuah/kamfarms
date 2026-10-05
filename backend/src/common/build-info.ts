/**
 * What this running server is, so anyone can tell whether the API on the server is as new as the website in front
 * of it. The website knows which of these features it needs; the Admin dashboard compares the two and says plainly
 * when the server is behind.
 */
export const API_VERSION = '2026.10.14';

/** One entry per capability the website relies on that only exists in newer servers. Add to this list with the feature. */
export const API_FEATURES = ['site-content', 'insights', 'settings-registry', 'system-overview', 'reports-catalog', 'admin-access', 'ai-predictions', 'ai-feedback', 'sales-chain', 'multi-size-intake', 'dispatch-requests', 'dispatch-desk', 'paddy-requests', 'paddy-transfers', 'control-center', 'dispatch-tracking', 'quick-search'] as const;

const STARTED_AT = new Date();

export function buildInfo() {
  return {
    version: API_VERSION,
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    startedAt: STARTED_AT.toISOString(),
    features: [...API_FEATURES],
  };
}
