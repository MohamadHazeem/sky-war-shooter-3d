// Accessibility and device preferences, shown in the Settings screen (ui/AccessibilityPanel)
// and saved under their own localStorage key. Game code reads the derived values:
//   access.shake / .hitStop            reduce motion (camera shake, hit-stop, slow motion)
//   access.flash                       reduce flashes (muzzle light, lightning, damage flash)
//   access.markerColor(enemy)          target-marker colours (colour-blind-safe palettes)
// The subtitle size and background and the HUD colours are CSS variables on <html>; the
// reduce-motion / reduce-flash and colour-blind classes on <body> let stylesheets follow along.

export type SubSize = 'S' | 'M' | 'L' | 'XL';
export type TouchPref = 'auto' | 'on' | 'off';
/** off; red-green (deuteranopia / protanopia); blue-yellow (tritanopia); high contrast */
export type CbMode = 'off' | 'redGreen' | 'blueYellow' | 'contrast';

export interface AccessPrefs {
  colorBlind: boolean;     // any colour-blind mode is on (kept for older readers: Radar, CSS)
  cbMode: CbMode;          // which colour-blind-safe palette (markers, radar and HUD)
  subSize: SubSize;
  subBg: number;           // subtitle background opacity 0..1
  reduceMotion: boolean;   // less camera shake, no hit-stop or slow motion
  reduceFlash: boolean;    // softer muzzle flashes, lightning and damage flashes
  touch: TouchPref;        // on-screen touch controls
  touchSens: number;       // touch aim sensitivity multiplier
  padSens: number;         // gamepad aim speed multiplier
  padSwap: boolean;        // left-handed: aim with the left stick (P-51: fly with the right)
  padAssist: boolean;      // aim assist one step stronger while playing on a gamepad
  oneHand: boolean;        // one-handed mouse: wheel = gun position, middle = reload, side buttons = abilities
}

const STORE_KEY = 'sws3d.access.v1';

// warn / ok colour HUD plates and borders; ink is the text colour on a warn-coloured fill
export interface Palette { enemy: string; enemyDim: string; enemyText: string; friend: string; warn: string; ok: string; ink: string }

// Okabe-Ito based: each palette keeps foes and friends apart for its kind of colour blindness;
// enemies also get a cross glyph in every colour-blind mode, so nothing relies on colour alone.
export const PALETTE: Record<'standard' | Exclude<CbMode, 'off'>, Palette> = {
  standard: { enemy: 'rgba(255,70,45,0.95)', enemyDim: 'rgba(255,90,60,0.55)', enemyText: 'rgba(255,120,90,0.9)', friend: 'rgba(110,190,255,0.85)', warn: '#d8432c', ok: '#5fbf4a', ink: '#fff' },
  redGreen: { enemy: 'rgba(255,150,20,0.98)', enemyDim: 'rgba(255,160,40,0.6)', enemyText: 'rgba(255,185,90,0.95)', friend: 'rgba(60,140,255,0.95)', warn: '#ff9a14', ok: '#64aaff', ink: '#111' },
  blueYellow: { enemy: 'rgba(235,40,95,0.98)', enemyDim: 'rgba(235,60,110,0.6)', enemyText: 'rgba(255,120,160,0.95)', friend: 'rgba(40,215,205,0.95)', warn: '#eb285f', ok: '#28d7cd', ink: '#fff' },
  contrast: { enemy: 'rgba(255,230,0,1)', enemyDim: 'rgba(255,230,0,0.7)', enemyText: 'rgba(255,240,90,1)', friend: 'rgba(255,255,255,0.95)', warn: '#ffe600', ok: '#ffffff', ink: '#111' },
};

const SUB_SCALE: Record<SubSize, number> = { S: 0.85, M: 1, L: 1.4, XL: 1.8 };

function defaults(): AccessPrefs {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    colorBlind: false, cbMode: 'off', subSize: 'M', subBg: 0.55, reduceMotion: reduce, reduceFlash: reduce, touch: 'auto', touchSens: 1,
    padSens: 1, padSwap: false, padAssist: true, oneHand: false,
  };
}

/** Saved preferences from older versions: one 'reduce shake and flashes' switch, a colour-blind on/off. */
export function migrate(saved: Partial<AccessPrefs>): Partial<AccessPrefs> {
  const out = { ...saved };
  if (out.reduceFlash === undefined && out.reduceMotion !== undefined) out.reduceFlash = out.reduceMotion;
  if (out.cbMode === undefined && out.colorBlind !== undefined) out.cbMode = out.colorBlind ? 'redGreen' : 'off';
  if (out.cbMode !== undefined && !(out.cbMode in PALETTE) && out.cbMode !== 'off') out.cbMode = 'off';
  if (out.cbMode !== undefined) out.colorBlind = out.cbMode !== 'off';
  if (out.subSize !== undefined && !(out.subSize in SUB_SCALE)) out.subSize = 'M';
  return out;
}

export class Access {
  prefs: AccessPrefs = defaults();
  private listeners: (() => void)[] = [];

  constructor(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
      const raw = storage?.getItem(STORE_KEY);
      if (raw) Object.assign(this.prefs, migrate(JSON.parse(raw)));
    } catch { /* storage unavailable */ }
  }

  get shake() { return this.prefs.reduceMotion ? 0.25 : 1; }
  get flash() { return this.prefs.reduceFlash ? 0.3 : 1; }
  get hitStop() { return this.prefs.reduceMotion ? 0 : 1; }
  get palette(): Palette { return this.prefs.cbMode !== 'off' ? PALETTE[this.prefs.cbMode] ?? PALETTE.redGreen : PALETTE.standard; }
  markerColor(enemy: boolean) { return enemy ? this.palette.enemy : this.palette.friend; }

  /** Colour-blind mode: an extra shape inside enemy brackets (a cross), so foes never rely on colour. */
  enemyGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    if (!this.prefs.colorBlind) return;
    const r = Math.max(3, s * 0.28);
    ctx.save();
    ctx.lineWidth = this.prefs.cbMode === 'contrast' ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
    ctx.restore();
  }

  set<K extends keyof AccessPrefs>(k: K, v: AccessPrefs[K]) {
    this.prefs[k] = v;
    if (k === 'cbMode') this.prefs.colorBlind = v !== 'off';
    if (k === 'colorBlind') this.prefs.cbMode = v ? (this.prefs.cbMode === 'off' ? 'redGreen' : this.prefs.cbMode) : 'off';
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.prefs)); } catch { /* storage unavailable */ }
    this.apply();
  }

  onChange(f: () => void) { this.listeners.push(f); }

  /** Push the preferences into the page (CSS variables and body classes). */
  apply() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    const p = this.prefs, pal = this.palette;
    root.setProperty('--subs-scale', String(SUB_SCALE[p.subSize] ?? 1));
    root.setProperty('--subs-bg', String(Math.max(0, Math.min(1, p.subBg))));
    root.setProperty('--cb-enemy', pal.warn);
    root.setProperty('--cb-friend', pal.ok);
    root.setProperty('--cb-enemy-text', pal.enemyText);
    root.setProperty('--cb-ink', pal.ink);
    const body = document.body.classList;
    body.toggle('calm', p.reduceMotion);
    body.toggle('noflash', p.reduceFlash);
    body.toggle('cb', p.colorBlind);
    for (const m of ['redGreen', 'blueYellow', 'contrast'] as const) body.toggle(`cb-${m}`, p.cbMode === m);
    body.toggle('one-hand', p.oneHand);
    for (const f of this.listeners) f();
  }
}

export const access = new Access();
