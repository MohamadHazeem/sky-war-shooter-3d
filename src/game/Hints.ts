import type { UI } from '../ui/UI';
import type { Game } from './Game';
import { STATION_ORDER, StationId } from '../world/B17Layout';
import { ENEMY_VARIANTS, EnemyType } from '../world/EnemyTypes';
import { tx } from '../i18n';

// Context hints: a one-off tip the first time something happens (once per profile,
// remembered in localStorage). Shown with UI.tip, at most one every GAP seconds; hints
// that arrive meanwhile wait in a short queue.

const KEY = 'sws3d.hints.v1';
const GAP = 8;          // s of play between hints
const SHOW_MS = 6500;
const POLL = 0.25;      // s between checks of the game state

export type HintId = 'perk' | 'heavy' | 'overheat' | 'hangar' | 'seat' | 'boss';

const HEAVY: EnemyType[] = ['bf110', 'ju88', 'me410', 'he111'];

export class Hints {
  private seen: Set<string>;
  private queue: { id: HintId; text: string }[] = [];
  private lastShow = -1e9;
  private clock = 0;      // s of play (paused time doesn't count)
  private pollT = 0;
  private perks0 = 0;
  private threats: Partial<Record<StationId, number>> = {};
  enabled = true;

  constructor(private game: Game, private ui: UI) {
    let list: string[] = [];
    try { list = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* storage unavailable */ }
    this.seen = new Set(Array.isArray(list) ? list : []);
  }

  has(id: HintId) { return this.seen.has(id); }

  markSeen(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* storage unavailable */ }
  }

  reset() {
    this.seen.clear();
    try { localStorage.removeItem(KEY); } catch { /* */ }
  }

  // New mission: forget what was queued, remember the perk count it starts with
  onMissionStart() {
    this.queue = [];
    this.perks0 = this.game.prog.perks.length;
  }

  trigger(id: HintId, text: string) {
    if (!this.enabled || this.seen.has(id) || this.queue.some((q) => q.id === id)) return;
    this.queue.push({ id, text });
  }

  update(dt: number) {
    const g = this.game;
    const m = g.mission;
    if (!m || m.tutorial || !this.enabled) return;
    // the hangar is a full-screen panel over the HUD: its hint goes inside it
    if (g.state === 'paused') { this.hangarHint(); return; }
    this.hangarVisit = false;
    if (g.state !== 'playing') return;
    this.clock += dt;
    this.pollT -= dt;
    if (this.pollT <= 0) { this.pollT = POLL; this.detect(); }
    if (this.queue.length && this.clock - this.lastShow >= GAP && g.world.time > 3) {
      const h = this.queue.shift()!;
      this.lastShow = this.clock;
      this.markSeen(h.id);
      this.ui.tip(`<span class="hint-k">${tx('TIP')}</span> ${tx(h.text)}`, SHOW_MS);
    }
  }

  private detect() {
    const g = this.game, w = g.world, m = g.mission!;
    // first perk
    if (g.prog.perks.length > this.perks0) {
      this.perks0 = g.prog.perks.length;
      this.trigger('perk', 'That card at the top was a <b>field upgrade</b>: a few kills or a cleared wave earns one, and it works straight away — for the rest of this mission.');
    }
    // first heavy enemy type; first boss
    for (const f of w.fighters('axis')) {
      if (!f.alive) continue;
      const a = f as any;
      if (a.boss || a.isBoss) this.trigger('boss', `<b>${f.label} — a boss!</b> It soaks up a lot of fire: stay on it with steady bursts and keep the lead on it. Big reward when it goes down.`);
      if (HEAVY.includes(f.enemyType as EnemyType) && w.player && f.pos.distanceTo(w.player.pos) < 2500) {
        const v = ENEMY_VARIANTS[f.enemyType as EnemyType];
        this.trigger('heavy', `<b>${v.label}</b> — a heavy twin: slow but tough. Hold longer bursts on it and aim for the engines.`);
      }
    }
    if (m.role !== 'gunner') return;
    // first overheated barrel
    if (g.gunner.state.overheated) this.trigger('overheat', 'Barrel overheated! Fire in <b>short bursts</b> of half a second and watch the <b>Barrel</b> bar bottom-left — it cools when you let go.');
    // first time a gun position other than the player's is under attack
    g.gunner.threatsByStation(this.threats);
    const here = this.threats[g.gunner.station] ?? 0;
    if (here === 0 && STATION_ORDER.some((id) => id !== g.gunner.station && (this.threats[id] ?? 0) > 0)) {
      this.trigger('seat', 'Fighters are attacking <b>another gun position</b>. Its seat badge lights up bottom-left — press its number key (<kbd>1</kbd>–<kbd>5</kbd>) to move there.');
    }
  }

  // shown for the whole first visit (the hangar re-renders its panel on every purchase)
  private hangarVisit = false;
  private hangarHint() {
    const panel = document.querySelector('#hangar.show .hwrap');
    if (!panel) { this.hangarVisit = false; return; }
    if (!this.hangarVisit) {
      if (this.seen.has('hangar')) return;
      this.hangarVisit = true;
      this.markSeen('hangar');
    }
    if (panel.querySelector('.hint-hangar')) return;
    const note = document.createElement('div');
    note.className = 'hint-hangar';
    note.innerHTML = `<span class="hint-k">${tx('FIRST HANGAR VISIT')}</span> ${tx('Spend the merit you just earned: a new aircraft or weapon, or permanent upgrades. Everything you buy is kept for every mission. When you\'re ready, press <kbd>Launch</kbd> (or <kbd>Enter</kbd>).')}`;
    panel.insertBefore(note, panel.children[2] ?? null);
  }
}
