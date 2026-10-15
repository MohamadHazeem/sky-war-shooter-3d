// Accessibility and device preferences, shown in the Settings screen (ui/AccessibilityPanel)
// and saved under their own localStorage key. Game code reads the derived values:
//   access.shake / .flash / .hitStop   comfort scales (reduce screen shake and flashes)
//   access.markerColor(enemy)          target-marker colours (colour-blind-safe palette)
// The subtitle size and background are CSS variables on <html>; the reduce-motion and
// colour-blind classes on <body> let stylesheets follow along.

import type { PhonePerfPref } from '../render/PhonePerf';

export type SubSize = 'S' | 'M' | 'L';
export type TouchPref = 'auto' | 'on' | 'off';

export interface AccessPrefs {
  colorBlind: boolean;     // deuteranopia-safe markers: blue friends vs orange foes + shapes
  subSize: SubSize;
  subBg: number;           // subtitle background opacity 0..1
  reduceMotion: boolean;   // less camera shake, softer flashes, no hit-stop
  touch: TouchPref;        // on-screen touch controls
  touchSens: number;       // touch aim sensitivity multiplier
  gyro: boolean;           // gyro aim (turn the phone to turn the gun, core/Gyro.ts)
  gyroSens: number;        // gyro aim sensitivity multiplier (1 = the gun turns as far as the phone)
  phonePerf: PhonePerfPref; // phone performance mode (render/PhonePerf.ts)
}

const STORE_KEY = 'sws3d.access.v1';

// Okabe-Ito based: distinguishable with deuteranopia, protanopia and tritanopia
export const PALETTE = {
  standard: { enemy: 'rgba(255,70,45,0.95)', enemyDim: 'rgba(255,90,60,0.55)', enemyText: 'rgba(255,120,90,0.9)', friend: 'rgba(110,190,255,0.85)' },
  colorBlind: { enemy: 'rgba(255,150,20,0.98)', enemyDim: 'rgba(255,160,40,0.6)', enemyText: 'rgba(255,185,90,0.95)', friend: 'rgba(60,140,255,0.95)' },
} as const;

const SUB_SCALE: Record<SubSize, number> = { S: 0.85, M: 1, L: 1.4 };

function defaults(): AccessPrefs {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { colorBlind: false, subSize: 'M', subBg: 0.55, reduceMotion: reduce, touch: 'auto', touchSens: 1, gyro: false, gyroSens: 1, phonePerf: 'auto' };
}

class Access {
  prefs: AccessPrefs = defaults();
  private listeners: (() => void)[] = [];

  constructor() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
      if (raw) Object.assign(this.prefs, JSON.parse(raw));
    } catch { /* storage unavailable */ }
  }

  get shake() { return this.prefs.reduceMotion ? 0.25 : 1; }
  get flash() { return this.prefs.reduceMotion ? 0.3 : 1; }
  get hitStop() { return this.prefs.reduceMotion ? 0 : 1; }
  get palette() { return this.prefs.colorBlind ? PALETTE.colorBlind : PALETTE.standard; }
  markerColor(enemy: boolean) { return enemy ? this.palette.enemy : this.palette.friend; }

  /** Colour-blind mode: an extra shape inside enemy brackets (a cross), so foes never rely on colour. */
  enemyGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    if (!this.prefs.colorBlind) return;
    const r = Math.max(3, s * 0.28);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
    ctx.restore();
  }

  set<K extends keyof AccessPrefs>(k: K, v: AccessPrefs[K]) {
    this.prefs[k] = v;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.prefs)); } catch { /* storage unavailable */ }
    this.apply();
  }

  onChange(f: () => void) { this.listeners.push(f); }

  /** Push the preferences into the page (CSS variables and body classes). */
  apply() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    root.setProperty('--subs-scale', String(SUB_SCALE[this.prefs.subSize] ?? 1));
    root.setProperty('--subs-bg', String(Math.max(0, Math.min(1, this.prefs.subBg))));
    document.body.classList.toggle('calm', this.prefs.reduceMotion);
    document.body.classList.toggle('cb', this.prefs.colorBlind);
    for (const f of this.listeners) f();
  }
}

export const access = new Access();
