/**
 * Installing the app on a phone or computer ("Add to Home Screen"). The browser offers a real install button only on Chrome, Edge, Samsung Internet and
 * Android browsers, through an event it fires ONCE, early, on whatever page happened to be open (often the login page). It is caught by a tiny script in
 * the page head (see app/layout.tsx) and kept here, so the pop-up shown after sign-in can still use it. Everywhere else (iPhone and iPad, Safari on a Mac,
 * Firefox) there is no install button to press, so the pop-up shows the exact steps for that device instead.
 */
export interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'desktop-chromium' | 'desktop-safari' | 'desktop-firefox' | 'other';

export const SNOOZE_KEY = 'kam_roms_install_snooze_until';
export const INSTALLED_KEY = 'kam_roms_installed';
export const SHOWN_KEY = 'kam_roms_install_shown_for';   // sessionStorage: the sign-in the pop-up was last shown for
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type W = Window & { __kamInstall?: InstallEvent | null };
export const capturedInstallEvent = (): InstallEvent | null => (typeof window === 'undefined' ? null : (window as W).__kamInstall ?? null);
export const clearInstallEvent = () => { if (typeof window !== 'undefined') (window as W).__kamInstall = null; };

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, maxTouchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): InstallPlatform {
  const iPadOnMac = /macintosh/i.test(ua) && maxTouchPoints > 1;             // newer iPads call themselves Macs
  if (/iphone|ipad|ipod/i.test(ua) || iPadOnMac) return /crios|fxios|edgios|opios|gsa\//i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua)) return 'android';
  if (/firefox/i.test(ua)) return 'desktop-firefox';
  if (/edg\//i.test(ua) || /chrome|chromium/i.test(ua)) return 'desktop-chromium';
  if (/safari/i.test(ua)) return 'desktop-safari';
  return 'other';
}

export function instructionsFor(p: InstallPlatform): { title: string; steps: string[] } {
  switch (p) {
    case 'ios-safari': return { title: 'Add KAM-ROMS to your Home Screen', steps: ['Tap the Share button (the square with an arrow pointing up) at the bottom of Safari.', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add". KAM-ROMS now opens from your Home Screen like any other app.'] };
    case 'ios-other': return { title: 'Open this page in Safari to install it', steps: ['On an iPhone or iPad, only Safari can add an app to the Home Screen.', 'Open this same page in Safari, then tap the Share button and choose "Add to Home Screen".'] };
    case 'android': return { title: 'Install KAM-ROMS on this phone', steps: ['Open your browser\'s menu (the three dots).', 'Tap "Install app" or "Add to Home screen".', 'Confirm. KAM-ROMS now opens from your Home Screen like any other app.'] };
    case 'desktop-chromium': return { title: 'Install KAM-ROMS on this computer', steps: ['Look for the install icon at the right end of the address bar (a small screen with a down arrow) and click it.', 'Or open the browser menu (the three dots) and choose "Install KAM-ROMS" (in Chrome: Cast, save and share).', 'Click "Install". KAM-ROMS opens in its own window and can be pinned to your taskbar or dock.'] };
    case 'desktop-safari': return { title: 'Add KAM-ROMS to your Dock', steps: ['In the Safari menu bar choose File, then "Add to Dock".', 'Click "Add". KAM-ROMS opens in its own window from your Dock.'] };
    case 'desktop-firefox': return { title: 'Firefox cannot install apps on a computer', steps: ['For a one-click app on this computer, open KAM-ROMS in Chrome or Edge and choose Install.', 'In Firefox you can still bookmark this page (press Ctrl+D, or Cmd+D on a Mac).'] };
    default: return { title: 'Keep KAM-ROMS one tap away', steps: ['Open your browser\'s menu and look for "Install app" or "Add to Home screen".'] };
  }
}

/** Should the pop-up be offered to this sign-in? Not if the app is already installed, the person asked for quiet, or it was already shown for this sign-in. */
export function shouldOffer(token: string | null): boolean {
  if (typeof window === 'undefined' || !token || isStandalone()) return false;
  try {
    if (localStorage.getItem(INSTALLED_KEY) === '1') return false;
    if (Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now()) return false;
    if (sessionStorage.getItem(SHOWN_KEY) === token.slice(-16)) return false;
  } catch { /* storage blocked: offer anyway */ }
  return true;
}
export const markShown = (token: string) => { try { sessionStorage.setItem(SHOWN_KEY, token.slice(-16)); } catch { /* ignore */ } };
export const snooze30Days = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + THIRTY_DAYS)); } catch { /* ignore */ } };
export const markInstalled = () => { try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ } };
