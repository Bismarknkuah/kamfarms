'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import {
  InstallEvent, InstallPlatform, capturedInstallEvent, clearInstallEvent, detectPlatform, instructionsFor, markInstalled, markShown, shouldOffer, snooze30Days,
} from '@/lib/install';

/**
 * A pop-up offered once per sign-in, on a phone or a computer, asking the person to put KAM-ROMS on their device. Where the browser provides a real install
 * button (Chrome, Edge, Android) it is one tap; on an iPhone, iPad, Mac Safari or Firefox, which have none, it shows the exact steps for that device.
 * "Not now" hides it until the next sign-in; "Don't ask for 30 days" hides it for a month; once installed it never appears again.
 */
export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  const [busy, setBusy] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const token = useRef<string | null>(null);

  useEffect(() => {
    token.current = sessionStorage.getItem('kam_roms_access_token');
    if (!shouldOffer(token.current)) return;
    const p = detectPlatform(); setPlatform(p);
    setEvent(capturedInstallEvent());
    const onReady = () => setEvent(capturedInstallEvent());
    const onInstalled = () => { markInstalled(); setOpen(false); };
    window.addEventListener('kam-install-ready', onReady); window.addEventListener('appinstalled', onInstalled);
    // On an iPhone nothing more will arrive, so show soon. Elsewhere the browser's own install event can come a moment after the page opens: give it a moment.
    const t = setTimeout(() => { if (shouldOffer(token.current)) { markShown(token.current!); setOpen(true); } }, p.startsWith('ios') ? 700 : 2200);
    return () => { clearTimeout(t); window.removeEventListener('kam-install-ready', onReady); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const install = async () => {
    if (!event || busy) return;
    setBusy(true);
    try { await event.prompt(); const choice = await event.userChoice; if (choice.outcome === 'accepted') markInstalled(); } catch { /* the browser declined to show it: nothing to do */ }
    clearInstallEvent(); setEvent(null); setBusy(false); setOpen(false);
  };

  if (!open) return null;
  const how = instructionsFor(platform);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" data-testid="install-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="install-title" data-testid="install-dialog" data-platform={platform} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl border border-paddy-100" />
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="font-display text-xl font-medium text-paddy-900">{event ? 'Install KAM-ROMS on this device' : how.title}</h2>
            <p className="mt-1 text-sm text-ink-700">Open it in one tap from your {platform.startsWith('desktop') ? 'desktop or taskbar' : 'home screen'}, full screen, like any other app.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-ink-500 hover:bg-rice-50"><X className="h-5 w-5" /></button>
        </div>

        {event ? (
          <button ref={primary} type="button" onClick={install} disabled={busy} data-testid="install-now" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-paddy-700 px-4 py-3 text-base font-medium text-white hover:bg-paddy-800 disabled:opacity-60">
            <Download className="h-5 w-5" aria-hidden="true" /> Install now
          </button>
        ) : (
          <ol data-testid="install-instructions" className="mt-4 list-decimal space-y-2 rounded-2xl bg-rice-50 px-8 py-4 text-sm text-ink-900">
            {how.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button ref={event ? undefined : primary} type="button" onClick={() => setOpen(false)} data-testid="install-not-now" className="rounded-lg px-3 py-2 font-medium text-paddy-800 hover:bg-rice-50">{event ? 'Not now' : 'Got it'}</button>
          <button type="button" onClick={() => { snooze30Days(); setOpen(false); }} data-testid="install-snooze" className="rounded-lg px-3 py-2 text-ink-500 hover:bg-rice-50">Don&rsquo;t ask for 30 days</button>
        </div>
      </div>
    </div>
  );
}
