// Picks the graphics preset for this device on first launch (and from Settings → "Detect best
// settings"): a short, silent benchmark of the title menu scene (clouds, formation, living sky),
// GPU-synced frame times at the starting preset, then the preset above when there is plenty of
// room. The decision itself is pure (render/QualityPick.ts).
//  - First launch only (no saved quality): Game marks the pick pending (firstRunGraphics) and it
//    runs once the menu is idle: title screen up, assets in, no input for a moment.
//  - Any click, key or wheel during the run (or the tab hiding) aborts it and puts the previous
//    preset back; a first-launch pick stays pending until the next launch.
//  - A preset chosen in Settings always wins (the Settings screen clears the pending mark).
import type { Engine, Quality } from '../core/Engine';
import type { Game } from './Game';
import type { Settings } from '../ui/UI';
import { isTouchDevice } from '../core/Touch';
import { isMissionReady } from '../core/Preload';
import { deviceTiers, frameStats, pickQuality, needsRecoveryProbe, MIN_FRAMES, PICK_SCALE, type DeviceInfo, type FrameStats, type Tier } from '../render/QualityPick';
import { toast } from './Share';
import { t } from '../i18n';

export function deviceInfo(): DeviceInfo {
  const scr = typeof screen !== 'undefined' ? screen : null;
  const reducedData = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches;
  const saveData = !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  return {
    touch: isTouchDevice(),
    cores: navigator.hardwareConcurrency,
    memoryGB: (navigator as { deviceMemory?: number }).deviceMemory,
    shortSide: scr ? Math.min(scr.width, scr.height) : Math.min(innerWidth, innerHeight),
    reducedData: reducedData || saveData,
  };
}

// First launch (no saved quality): start from the device-class guess, benchmark pending
export function firstRunGraphics(s: Settings) {
  s.quality = deviceTiers(deviceInfo()).start;
  s.gfxAuto = 'pending';
  s.graphicsMode = 'auto';
}

export interface BenchOptions {
  sync?: boolean;       // run the frames back to back (dev / headless playtests: hidden tabs have no rAF)
}
export interface BenchResult { quality: Quality; from: Quality; start: FrameStats; recovered?: FrameStats; scale: number; upper?: FrameStats; refreshHz: number }

// Frames per phase: a few warm-up frames (shader programs, render targets) are not timed;
// After MIN_FRAMES valid samples, stop at `frames` or `ms`. Very slow devices must
// not keep High just because the time budget expired before enough samples arrived.
// Three stream atlases take 24 frame slots to bake; measuring them would under-pick the GPU.
const WARM = 32;
const START_PHASE = { frames: 90, ms: 1400 };
const RECOVERY_PHASE = { frames: 48, ms: 900 };
const UPPER_PHASE = { frames: 60, ms: 900 };
const IDLE_MS = 1500;        // no input for this long before a first-launch run
const ASSET_WAIT_MS = 8000;  // start without the background downloads after this long

export class AutoGraphics {
  running = false;
  last: BenchResult | null = null;
  private aborted = false;
  private wake: (() => void) | null = null;
  private lastInput = performance.now();
  private readonly bootAt = performance.now();
  private readonly onInput = () => {
    this.lastInput = performance.now();
    if (this.running) this.abort();
  };

  constructor(private engine: Engine, private game: Game) {
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, this.onInput, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.running) this.abort(); });
    game.ui.detectGraphics = () => this.run();
    if (game.settings.gfxAuto === 'pending') this.waitForIdle();
  }

  // First launch: poll until the menu is idle, then run once (an aborted run waits for the next launch)
  private waitForIdle() {
    const tick = () => {
      if (this.game.settings.gfxAuto !== 'pending' || this.running) return;
      if (!this.idle()) { setTimeout(tick, 400); return; }
      void this.run();
    };
    setTimeout(tick, 400);
  }

  private idle(): boolean {
    const now = performance.now();
    const title = document.getElementById('title');
    return this.game.state === 'menu' && !!title?.classList.contains('show') && !document.hidden
      && !this.engine.refreshProbing && now - this.lastInput > IDLE_MS && now - this.bootAt > IDLE_MS
      && (isMissionReady() || now - this.bootAt > ASSET_WAIT_MS);
  }

  abort() {
    this.aborted = true;
    this.wake?.();
  }

  // Run the benchmark and apply the pick. null when aborted (the previous preset is back).
  async run(o: BenchOptions = {}): Promise<BenchResult | null> {
    if (this.running) return null;
    if (!o.sync && document.hidden) return null;   // no frames in a hidden tab
    const e = this.engine, g = this.game;
    const from = e.quality, scaleBefore = e.renderScale, state = g.state;
    const dev = deviceTiers(deviceInfo());
    this.running = true;
    this.aborted = false;
    let last = performance.now();
    // one timed frame in the next frame slot (or at once in sync mode); NaN when aborted
    const next = (): Promise<number> => {
      if (o.sync) return Promise.resolve(this.aborted ? NaN : e.timedFrame(1 / 60));
      return new Promise((res) => {
        this.wake = () => { e.loopOverride = undefined; this.wake = null; res(NaN); };
        e.loopOverride = () => {
          e.loopOverride = undefined; this.wake = null;
          if (this.aborted) { res(NaN); return; }
          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
          last = now;
          res(e.timedFrame(dt));
        };
      });
    };
    const phase = async (tier: Tier, p: { frames: number; ms: number }, scale = 1): Promise<FrameStats | null> => {
      if (e.quality !== tier) e.setQuality(tier);
      // Fixed scale: dynamic resolution sits out both full-budget and recovery samples.
      if (e.renderScale !== scale) { e.renderScale = scale; e.resize(); }
      const ms: number[] = [];
      for (let i = 0; i < WARM; i++) if (Number.isNaN(await next())) return null;
      const t0 = performance.now();
      while (ms.length < p.frames && (ms.length < MIN_FRAMES || performance.now() - t0 < p.ms)) {
        const v = await next();
        if (Number.isNaN(v) || g.state !== state) return null;
        ms.push(v);
      }
      return frameStats(ms);
    };
    try {
      const start = await phase(dev.start, START_PHASE);
      if (!start) return this.restore(from, scaleBefore);
      const refreshHz = e.refreshHz;
      let recovered: FrameStats | undefined;
      if (needsRecoveryProbe(start, refreshHz)) {
        const recovery = await phase(dev.start, RECOVERY_PHASE, PICK_SCALE);
        if (!recovery) return this.restore(from, scaleBefore);
        recovered = recovery;
      }
      let pick = pickQuality({ tier: dev.start, stats: start, refreshHz, cap: dev.cap, recovered });
      let upper: FrameStats | undefined;
      if (pick.tryUpper) {
        const up = await phase(upperOf(dev.start), UPPER_PHASE);
        if (!up) return this.restore(from, scaleBefore);
        upper = up;
        pick = pickQuality({ tier: dev.start, stats: start, refreshHz, cap: dev.cap, upper, recovered });
      }
      const scale = recovered && pick.quality === dev.start ? PICK_SCALE : 1;
      const res: BenchResult = { quality: pick.quality, from, start, upper, recovered, scale, refreshHz };
      this.last = res;
      this.apply(pick.quality, scale);
      return res;
    } finally {
      this.running = false;
      this.wake = null;
      e.loopOverride = undefined;
    }
  }

  private restore(q: Quality, scale: number): null {
    const e = this.engine;
    if (e.quality !== q) e.setQuality(q);
    if (e.renderScale !== scale) { e.renderScale = scale; e.resize(); }
    return null;
  }

  // Save the pick (a fresh start for dynamic resolution) and say so
  private apply(q: Quality, scale: number) {
    const s = this.game.settings;
    s.quality = q;
    s.graphicsMode = 'auto';
    delete s.gfxAuto;
    this.engine.resetDynamicResolution(scale);
    this.game.applySettings();   // applies the preset (if the run ended on another), saves
    this.engine.resize();
    const name = t(`settings.q.${q}`);
    toast(t('settings.gfxPicked', { q: name.charAt(0).toUpperCase() + name.slice(1) }), 5000);
  }
}

const upperOf = (t: Tier): Tier => (t === 'low' ? 'medium' : t === 'medium' ? 'high' : 'ultra');
