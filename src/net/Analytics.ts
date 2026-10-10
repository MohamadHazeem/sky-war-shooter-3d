// Privacy-friendly gameplay statistics.
//
// One anonymous document per mission goes to Firestore (`analytics_events`, append-only,
// unreadable by clients). It folds the mission's events together — mission_start (settings
// snapshot, device class), seat switches, ability uses, perks awarded, fps samples and
// mission_end — so there is at most ONE write per mission, sent when the mission ends (or is
// abandoned). No personal data: no names, no user id, no free text, no precise device data;
// screen size, frame rate and duration are bucketed or rounded.
//
// Off when the player switches "Share anonymous gameplay stats" off in Settings, or when the
// browser sends Do-Not-Track / Global Privacy Control.

import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import type { Mission } from '../game/Missions';
import type { DebriefData } from '../ui/UI';
import { leaderboardMode } from '../game/Modes';
import { fbConnect } from './Leaderboard';
import { tx } from '../i18n';

const OPT_KEY = 'sws3d.shareStats';   // '0' = off (default on)

export function dntEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = (typeof window !== 'undefined' ? window : {}) as { doNotTrack?: string };
  return n.doNotTrack === '1' || n.doNotTrack === 'yes' || w.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true;
}

export function statsOptIn(): boolean {
  try { return localStorage.getItem(OPT_KEY) !== '0'; } catch { return true; }
}
export function setStatsOptIn(on: boolean) {
  try { localStorage.setItem(OPT_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
/** Stats are only collected and sent when both the toggle and the browser allow it. */
export function statsAllowed(): boolean { return statsOptIn() && !dntEnabled(); }

// ---- bucketing (pure, unit-tested) ----
export function screenBucket(w: number, h: number): string {
  const s = Math.min(w, h), l = Math.max(w, h);
  if (s < 500) return 'phone';
  if (s < 820 || l < 1100) return 'tablet';
  if (l < 1700) return 'laptop';
  if (l < 2600) return 'desktop';
  return 'large';
}
export function fpsBucket(fps: number): string {
  return fps < 20 ? '<20' : fps < 30 ? '20-30' : fps < 45 ? '30-45' : fps < 58 ? '45-58' : '58+';
}
export function modeOf(m: Pick<Mission, 'id' | 'role' | 'duration'> & { tutorial?: boolean }, board: string | null): string {
  if (m.tutorial) return 'tutorial';
  const p = board?.split('-')[0];
  if (p && ['acehunt', 'timeattack', 'daily'].includes(p)) return p;
  if (m.duration === Infinity || m.id.startsWith('survival')) return 'survival';
  if (/^m\d{1,2}$/.test(m.id)) return 'campaign';
  return 'other';
}
const cleanId = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'unknown';
const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(v) ? v : 0)));

const STATIONS = ['waistL', 'waistR', 'top', 'ball', 'tail'];
const ABILITIES = ['mustangs', 'overdrive', 'focus'];

interface Pending {
  mission: Mission;
  seats: Record<string, number>;    // seconds at each gun position
  seatSwitches: number;
  lastSeat: string | null;
  abilities: Record<string, number>;
  fps: number[];                    // one sample per second of play
  settings: Record<string, string | boolean>;
  device: Record<string, string | boolean | number>;
  // last live figures: an abandoned mission is reported after the world was already reset
  snap: { time: number; kills: number; shots: number; hits: number; bombersLost: number; score: number };
}

export interface AnalyticsDoc {
  v: 1;
  event: 'mission';
  mission: string; mode: string; role: 'gunner' | 'pilot';
  outcome: 'success' | 'fail' | 'aborted'; success: boolean;
  duration: number; kills: number; accuracy: number; bombersLost: number; rounds: number; shots: number; deaths: number; score: number;
  seatSwitches: number; seats: Record<string, number>; abilities: Record<string, number>; perks: string;
  settings: Record<string, string | boolean>; device: Record<string, string | boolean | number>;
  fpsAvg: number; fpsP10: number; fpsBucket: string;
  dev: boolean;
}

class Analytics {
  private game: Game | null = null;
  private engine: Engine | null = null;
  private gamepad: () => boolean = () => false;
  private cur: Pending | null = null;
  private lastSample = 0;
  /** The last document built (sent or not) — dev hooks and tests read it. */
  last: AnalyticsDoc | null = null;
  lastResult: 'sent' | 'skipped' | 'failed' | null = null;

  install(engine: Engine, game: Game, gamepad?: () => boolean) {
    this.engine = engine; this.game = game;
    if (gamepad) this.gamepad = gamepad;
    engine.add({ update: (dt) => this.tick(dt) });
    game.abilities.onUse = (id) => this.abilityUsed(id);
  }

  missionStart(m: Mission) {
    if (this.cur) this.abandon();           // restarted without finishing
    const g = this.game, e = this.engine;
    if (!g || !e) return;
    const s = g.settings;
    let lang = 'en';
    try { lang = (document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase(); } catch { /* */ }
    const touch = typeof document !== 'undefined' && document.body.classList.contains('touch');
    this.cur = {
      mission: m, seats: {}, seatSwitches: 0,
      lastSeat: m.role === 'gunner' ? g.gunner.station : null,
      abilities: {}, fps: [],
      snap: { time: 0, kills: 0, shots: 0, hits: 0, bombersLost: 0, score: 0 },
      settings: {
        quality: s.quality, aimAssist: s.aimAssist ?? 'high', difficulty: s.difficulty, flightMode: s.flightMode,
        language: /^[a-z]{2}$/.test(lang) ? lang : 'xx', touch, gamepad: this.gamepad(),
      },
      device: {
        screen: screenBucket(screen?.width || innerWidth, screen?.height || innerHeight),
        touch: (navigator.maxTouchPoints ?? 0) > 0,
        dpr: Math.min(4, Math.round((devicePixelRatio || 1) * 2) / 2),
      },
    };
    this.lastSample = performance.now();
  }

  abilityUsed(id: string) {
    if (!this.cur || !ABILITIES.includes(id)) return;
    this.cur.abilities[id] = Math.min(999, (this.cur.abilities[id] ?? 0) + 1);
  }

  missionEnd(m: Mission, d: DebriefData) {
    const g = this.game;
    if (!this.cur || this.cur.mission !== m || !g) { this.cur = null; return; }
    const w = g.world;
    const died = !d.success && (!w.player?.alive || w.crewWounded >= 4);
    void this.flush(d.success ? 'success' : 'fail', {
      duration: d.time, kills: d.kills, accuracy: d.accuracy, bombersLost: d.bombersLost,
      rounds: d.survival || m.round ? d.waves ?? 0 : 0, shots: d.rounds ?? w.stats.shots, deaths: died ? 1 : 0, score: d.score,
    });
  }

  // Per frame: seat time and switches, one fps sample per second of active play,
  // and missions left for the menu without a debrief.
  // dt is mission time (what the seat shares are measured in); fps is sampled on the wall clock.
  private tick(dt: number) {
    const g = this.game, c = this.cur, e = this.engine;
    if (!g || !c || !e) return;
    if (g.state === 'menu' || g.mission !== c.mission) { this.abandon(); return; }
    const now = performance.now();
    const live = g.state === 'playing' && !g.photo.active && !e.paused;
    if (!live) { this.lastSample = now; return; }
    const w = g.world, sn = c.snap;
    sn.time = w.time; sn.kills = w.stats.kills; sn.shots = w.stats.shots; sn.hits = w.stats.hits; sn.bombersLost = w.stats.bombersLost; sn.score = g.currentScore;
    if (c.mission.role === 'gunner') {
      const st = g.gunner.station;
      c.seats[st] = (c.seats[st] ?? 0) + dt;
      if (c.lastSeat && st !== c.lastSeat) c.seatSwitches++;
      c.lastSeat = st;
    }
    if (now - this.lastSample >= 1000 && document.visibilityState !== 'hidden') {
      this.lastSample = now;
      if (c.fps.length < 7200) c.fps.push(e.fps);
    }
  }

  private abandon() {
    const g = this.game, c = this.cur;
    if (!g || !c) { this.cur = null; return; }
    const sn = c.snap;
    if (sn.time < 10) { this.cur = null; return; }  // a misclick, not a mission
    void this.flush('aborted', {
      duration: sn.time, kills: sn.kills, accuracy: sn.shots > 0 ? sn.hits / sn.shots : 0,
      bombersLost: sn.bombersLost, rounds: 0, shots: sn.shots, deaths: 0, score: sn.score,
    });
  }

  /** Builds the mission document (pure apart from reading the pending state). */
  build(outcome: AnalyticsDoc['outcome'], r: { duration: number; kills: number; accuracy: number; bombersLost: number; rounds: number; shots: number; deaths: number; score: number }): AnalyticsDoc | null {
    const c = this.cur, g = this.game;
    if (!c || !g) return null;
    const m = c.mission;
    const fps = [...c.fps].sort((a, b) => a - b);
    const avg = fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : this.engine?.fps ?? 60;
    const p10 = fps.length ? fps[Math.floor(fps.length * 0.1)] : avg;
    const seats: Record<string, number> = {};
    for (const k of STATIONS) if (c.seats[k]) seats[k] = clampInt(c.seats[k], 36000);
    const abilities: Record<string, number> = {};
    for (const k of ABILITIES) if (c.abilities[k]) abilities[k] = clampInt(c.abilities[k], 999);
    const perks = g.prog.perks.map((p) => String(p).replace(/[^a-z0-9_]/gi, '').toLowerCase()).join(',').slice(0, 600);
    return {
      v: 1, event: 'mission',
      mission: cleanId(m.id), mode: modeOf(m, leaderboardMode(m)), role: m.role,
      outcome, success: outcome === 'success',
      duration: clampInt(r.duration, 36000), kills: clampInt(r.kills, 5000),
      accuracy: Math.round(Math.max(0, Math.min(1, r.accuracy || 0)) * 1000) / 1000,
      bombersLost: clampInt(r.bombersLost, 100), rounds: clampInt(r.rounds, 500), shots: clampInt(r.shots, 1000000),
      deaths: clampInt(r.deaths, 1), score: clampInt(r.score, 5000000),
      seatSwitches: clampInt(c.seatSwitches, 10000), seats, abilities, perks,
      settings: c.settings, device: c.device,
      fpsAvg: clampInt(avg, 500), fpsP10: clampInt(p10, 500), fpsBucket: fpsBucket(avg),
      dev: !!import.meta.env?.DEV,
    };
  }

  private async flush(outcome: AnalyticsDoc['outcome'], r: Parameters<Analytics['build']>[1]) {
    const doc = this.build(outcome, r);
    this.cur = null;
    if (!doc) return;
    this.last = doc;
    if (!statsAllowed()) { this.lastResult = 'skipped'; return; }
    try {
      const { db, uid, fs } = await fbConnect();
      // the per-player stamp (only a timestamp) rate-limits writes in firestore.rules
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, 'analytics_limits', uid), { last: fs.serverTimestamp() });
      batch.set(fs.doc(fs.collection(db, 'analytics_events')), { ...doc, createdAt: fs.serverTimestamp() });
      await batch.commit();
      this.lastResult = 'sent';
    } catch (err) {
      this.lastResult = 'failed';
      console.warn('Analytics: write failed', err);
    }
  }
}

export const analytics = new Analytics();

/** Settings panel section: the opt-out toggle, clearly worded. */
export function mountStatsToggle(host: HTMLElement | null) {
  if (!host) return;
  host.querySelector('.stats-optin')?.remove();
  const dnt = dntEnabled();
  const box = document.createElement('div');
  box.className = 'lb-panel stats-optin';
  box.innerHTML = `<div class="hud-label">${tx('PRIVACY')}</div>
    <label class="setting">${tx('Share anonymous gameplay stats')} <select data-stats ${dnt ? 'disabled' : ''}>
      <option value="1">${tx('On')}</option><option value="0" ${!statsOptIn() || dnt ? 'selected' : ''}>${tx('Off')}</option></select></label>
    <div class="lb-status">${tx(dnt
      ? 'Your browser asks sites not to track you (Do Not Track), so no stats are sent.'
      : 'One anonymous summary per mission (mission, result, kills, accuracy, gun positions used, settings, screen size and frame rate) helps balance the game. No name, account or personal data is sent.')}</div>`;
  const anchor = host.querySelector('[data-back]')?.closest('.row');
  if (anchor) anchor.insertAdjacentElement('beforebegin', box); else host.appendChild(box);
  box.querySelector<HTMLSelectElement>('[data-stats]')!.addEventListener('input', (e) => setStatsOptIn((e.target as HTMLSelectElement).value === '1'));
}
