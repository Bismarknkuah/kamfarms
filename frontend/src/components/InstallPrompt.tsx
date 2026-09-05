'use client';

import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'kam_roms_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own (non-standard) flag for "already added to home screen"
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Shows once a real, logged-in user lands on any dashboard page (mounted
 * inside DashboardShell, not the login page itself — installing before
 * someone even has an account to use makes no sense). Two real,
 * different code paths, not one glossed-over "install" button:
 *
 * - Chrome/Android/Edge fire a genuine `beforeinstallprompt` event this
 *   component captures and replays via `.prompt()` when the user taps
 *   the button — an actual native install flow, not a fake one.
 * - iOS Safari never fires that event at all (Apple doesn't support
 *   programmatic install prompts) — there is no way to trigger the
 *   "Add to Home Screen" flow from JavaScript on iOS. For iOS, this
 *   shows the real manual steps instead of pretending a button can do
 *   it, which would silently do nothing when tapped.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until effects confirm it's worth showing

  useEffect(() => {
    if (isStandalone()) return; // already installed — nothing to offer
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    if (isIos()) {
      setShowIosInstructions(true);
      setDismissed(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    onDismiss();
  };

  if (dismissed || (!deferredPrompt && !showIosInstructions)) return null;

  return (
    <div className="border-b border-husk-300 bg-husk-100/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-2.5 text-sm">
        {showIosInstructions ? (
          <p className="text-soil-700">
            Install KAM-ROMS on this phone: tap the <strong>Share</strong> button, then{' '}
            <strong>&ldquo;Add to Home Screen.&rdquo;</strong>
          </p>
        ) : (
          <p className="text-soil-700">Install KAM-ROMS for quicker, full-screen access — no browser bar.</p>
        )}
        <div className="flex items-center gap-2">
          {!showIosInstructions && (
            <button
              type="button"
              onClick={onInstall}
              className="rounded-full bg-paddy-900 px-4 py-1 text-xs font-medium text-rice-50"
            >
              Install
            </button>
          )}
          <button type="button" onClick={onDismiss} className="text-xs font-medium text-soil-500 underline">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
