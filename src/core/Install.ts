// "Install the app" offer for phones and tablets (Phase 11 · 15). The manifest and service
// worker already make the game installable; this decides when to ask. Pure rules here (unit
// tested), the card itself is ui/InstallPrompt.ts.
//   - never in the installed app (standalone display) or once installed
//   - only after the first sortie, on the title screen, on a touch device
//   - Android / Chrome: the browser's own install dialog (beforeinstallprompt)
//   - iPhone / iPad Safari: no dialog exists, so the card says how (Share → Add to Home Screen)
//   - "Not now" waits a few days; after three refusals it stops asking

export type InstallOffer = 'prompt' | 'ios' | null;

export interface InstallEnv {
  standalone: boolean;   // already running as the installed app
  canPrompt: boolean;    // a beforeinstallprompt event is waiting
  ios: boolean;          // iPhone / iPad Safari (Add to Home Screen by hand)
  touch: boolean;
}

export interface InstallMemory {
  sorties: number;       // missions started on this device
  dismissals: number;
  dismissedAt: number;   // ms timestamp of the last "Not now" (0 = never)
  installed: boolean;
}

export const INSTALL_SNOOZE_MS = 3 * 24 * 3600 * 1000;
export const INSTALL_MAX_DISMISSALS = 3;

export const freshMemory = (): InstallMemory => ({ sorties: 0, dismissals: 0, dismissedAt: 0, installed: false });

export function installOffer(env: InstallEnv, mem: InstallMemory, now: number): InstallOffer {
  if (env.standalone || mem.installed || !env.touch) return null;
  if (mem.sorties < 1 || mem.dismissals >= INSTALL_MAX_DISMISSALS) return null;
  if (mem.dismissedAt && now - mem.dismissedAt < INSTALL_SNOOZE_MS) return null;
  if (env.canPrompt) return 'prompt';
  return env.ios ? 'ios' : null;
}

/** iPhone / iPad Safari (iPadOS reports a Mac with touch points). Other iOS browsers can't add to the home screen. */
export function isIosSafari(ua: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

/** Parse the saved memory, tolerating junk from older builds. */
export function readMemory(raw: string | null): InstallMemory {
  const m = freshMemory();
  if (!raw) return m;
  try {
    const o = JSON.parse(raw) as Partial<InstallMemory>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    m.sorties = num(o.sorties); m.dismissals = num(o.dismissals); m.dismissedAt = num(o.dismissedAt);
    m.installed = o.installed === true;
  } catch { /* corrupt: start fresh */ }
  return m;
}
