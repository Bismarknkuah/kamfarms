'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { ApiError, siteApi } from '@/lib/api-client';
import { type SiteContent, cleanSiteContentForSave, mergeSiteContent } from '@/lib/site-content';

/**
 * One switch for the one-click demo sign-in buttons on the sign-in page, so the Administrator can turn them on to
 * test each role and off again before real staff start using the system, without opening the homepage editor.
 * It saves the same homepage content the editor does, with only this one setting changed.
 */
export function DemoModeSwitch({ accessToken }: { accessToken: string }) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    siteApi
      .getAdminContent(accessToken)
      .then((res) => live && setContent(mergeSiteContent(res.content)))
      .catch(() => live && setUnavailable(true));
    return () => { live = false; };
  }, [accessToken]);

  // Until the server answers, the sign-in page itself shows the buttons (that is the default), so say ON.
  const on = content ? content.signin.showDemoAccounts : true;

  const toggle = async () => {
    if (!content || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = cleanSiteContentForSave({ ...content, signin: { ...content.signin, showDemoAccounts: !on } });
      const res = await siteApi.saveContent(accessToken, next);
      const saved = mergeSiteContent(res.content);
      setContent(saved);
      setMessage({ kind: 'ok', text: saved.signin.showDemoAccounts ? 'The demo buttons are now ON.' : 'The demo buttons are now OFF.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ApiError ? e.message : 'Could not save the change. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-paddy-100 bg-white p-5" data-testid="demo-switch" aria-label="Demo sign-in buttons">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h3 className="font-display text-lg font-medium text-paddy-900">One-click demo sign-in, for testing</h3>
          <p className="mt-1 text-sm text-ink-500">
            When this is on, the sign-in page shows a button for every demo account, so you can test each role in one click. All the demo
            accounts share one password.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="demo-switch-state"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}
          >
            {on ? 'ON' : 'OFF'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Show the demo sign-in buttons"
            data-testid="demo-switch-toggle"
            disabled={!content || saving}
            onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-husk-500' : 'bg-ink-500/30'}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {on && !unavailable && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="demo-switch-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            While this is on, anyone who opens the sign-in page can enter as any demo user. Turn it off, and change or disable the demo
            accounts in <Link href="/users" className="font-medium underline">People and accounts</Link>, before real staff use the system.
          </span>
        </p>
      )}
      {unavailable && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="demo-switch-unavailable">
          Your server does not have the homepage editor yet, so this switch cannot be saved. Until it can, the sign-in page shows the demo
          buttons.
        </p>
      )}
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-800' : 'text-red-700'}`} data-testid="demo-switch-message">
          {message.text}
        </p>
      )}
    </section>
  );
}
