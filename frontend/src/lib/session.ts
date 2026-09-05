'use client';

// Access tokens live in memory only (React state, via SessionProvider).
// Refresh tokens are kept in sessionStorage for Phase 1 simplicity; Phase 2+
// moves this to an httpOnly cookie set by a Next.js route handler so the
// refresh token is never reachable from JS at all.

const REFRESH_TOKEN_KEY = 'kam_roms_refresh_token';

export function storeRefreshToken(token: string) {
  if (typeof window !== 'undefined') sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
