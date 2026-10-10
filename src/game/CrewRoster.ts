// Crew with personalities: ten named crewmen with portraits, voices, gun skills, levels,
// wounds and seat assignments. Persisted in localStorage (sws3d.crew.v1).
//
// - Skills (accuracy, traverse, burst discipline) drive the AI gunners on the player's own
//   B-17 (aiGunnerSkill, read by World.bomberGunners) and give the player a small bonus at
//   the seat the crewman mans (crewSeatLoadout, wrapped around the GunnerController loadout).
// - XP from kills made at his station, by the player or by the AI gunner, levels 1-10.
// - A crewman wounded in a round sits out the next round; wounded in the last round he
//   misses the next mission. A replacement rookie (low skill) takes his gun meanwhile.
//   The Crew Chief perk, a flesh wound, the flight surgeon or merit points can heal him.
// - The hangar roster (ui/CrewPanel.ts) assigns gunners to the five gun stations; the
//   sixth enlisted man works the radio. A specialist in his own seat gets a skill bonus.
//
// Game hooks: beginMission / onKill / onRoundStart / endMission (see each method).
import { CREW, CrewId, crewMember } from '../world/Crew';
import { STATIONS, STATION_ORDER, StationId, inArc } from '../world/B17Layout';
import type { PortraitLook } from '../render/Portraits';
import type { Loadout } from './Upgrades';
import type { World } from '../world/World';
import { VOICE_LINES } from '../audio/voiceLines';

export type ManId = 'brenner' | 'doyle' | 'stern' | 'kessler' | 'mendez' | 'gallo' | 'reilly' | 'price' | 'walsh' | 'dawson';
export type Post = StationId | 'radio';                        // the six enlisted positions
export type Stat = 'acc' | 'trav' | 'disc';
export type BonusKind = 'traverse' | 'spread' | 'heat' | 'rate' | 'damage';

export interface ManDef {
  id: ManId;
  rank: 'Capt.' | 'Lt.' | 'Sgt.';
  first: string;
  last: string;
  nick: string;
  bio: string;
  call: string;            // name in radio calls (matches the recorded crew-wound lines)
  home: CrewId;            // his trade / default position
  voice: string;           // radio speaker: his surname, an alias of his recorded voice role
  gunner: boolean;         // enlisted gunners can be assigned to any gun station
  specialty: StationId | null;
  base: Record<Stat, number>;  // 0-100 at level 1
  bonus?: { kind: BonusKind; amount: number; what: string };
  look: PortraitLook;
}

export const POSTS: Post[] = ['top', 'radio', 'ball', 'waistL', 'waistR', 'tail'];
export const POST_CREW: Record<Post, CrewId> = { top: 'engineer', radio: 'radio', ball: 'ball', waistL: 'waistL', waistR: 'waistR', tail: 'tail' };
export const POST_LABEL: Record<Post, string> = { top: 'Top Turret', radio: 'Radio Room', ball: 'Ball Turret', waistL: 'Left Waist', waistR: 'Right Waist', tail: 'Tail Gun' };
export const STAT_LABEL: Record<Stat, string> = { acc: 'Accuracy', trav: 'Traverse', disc: 'Discipline' };

export const MEN: ManDef[] = [
  { id: 'brenner', rank: 'Capt.', first: 'Hal', last: 'Brenner', nick: 'Skipper', call: 'Capt. Hal Brenner', home: 'pilot', voice: 'Pilot', gunner: false, specialty: null,
    bio: 'Flew crop dusters over Kansas. Has brought every crew home so far.', base: { acc: 50, trav: 50, disc: 70 },
    look: { skin: '#e2b48f', hair: '#5b4128', hat: 'crush', hatColor: '#5d5e3e', jacket: 'a2', bg: '#4c6a8c', jaw: 1.08, brows: 0.4, smile: 0.3, insignia: 'bars' } },
  { id: 'doyle', rank: 'Lt.', first: 'Frank', last: 'Doyle', nick: 'Irish', call: 'Lt. Frank Doyle', home: 'copilot', voice: 'Co-Pilot', gunner: false, specialty: null,
    bio: 'Boston Irish. Sings on the interphone when he thinks nobody is listening.', base: { acc: 50, trav: 50, disc: 50 },
    look: { skin: '#f0c4a2', hair: '#a8461e', hat: 'crush', hatColor: '#6b6a48', jacket: 'a2', bg: '#3f7a52', jaw: 0.95, brows: -0.3, smile: 0.9, freckles: true, insignia: 'bars' } },
  { id: 'stern', rank: 'Lt.', first: 'Eli', last: 'Stern', nick: 'Prof', call: 'Lt. Eli Stern', home: 'nav', voice: 'Navigator', gunner: false, specialty: null,
    bio: 'Maths teacher from Philadelphia. Never missed an initial point.', base: { acc: 50, trav: 50, disc: 60 },
    look: { skin: '#e8bd98', hair: '#2b2018', hat: 'none', jacket: 'olive', bg: '#7a6a44', jaw: 0.9, brows: -0.2, smile: 0.1, moustache: true, insignia: 'bars' } },
  { id: 'kessler', rank: 'Lt.', first: 'Ray', last: 'Kessler', nick: 'Deadeye', call: 'Lt. Ray Kessler', home: 'bombardier', voice: 'Bombardier', gunner: false, specialty: null,
    bio: 'Swears by his Norden sight and the same pair of socks every mission.', base: { acc: 60, trav: 50, disc: 50 },
    look: { skin: '#d9a77f', hair: '#3a2a1a', hat: 'garrison', hatColor: '#5a5d3c', jacket: 'a2', bg: '#7d3f36', jaw: 1.02, brows: 0.8, smile: 0.2, insignia: 'bars' } },
  { id: 'mendez', rank: 'Sgt.', first: 'Luis', last: 'Mendez', nick: 'Wrench', call: 'Sgt. Mendez', home: 'engineer', voice: 'Mendez', gunner: true, specialty: 'top',
    bio: 'Flight engineer from San Antonio. Can fix anything with safety wire.', base: { acc: 52, trav: 50, disc: 60 },
    bonus: { kind: 'heat', amount: 0.12, what: 'barrel heat' },
    look: { skin: '#c48c62', hair: '#1d1612', hat: 'cap', hatColor: '#4d5a3a', jacket: 'olive', bg: '#8c6a2e', jaw: 1.1, brows: 0.3, smile: 0.5, moustache: true, insignia: 'chevrons' } },
  { id: 'gallo', rank: 'Sgt.', first: 'Tom', last: 'Gallo', nick: 'Sparks', call: 'Sgt. Tom Gallo', home: 'radio', voice: 'Gallo', gunner: true, specialty: null,
    bio: 'Radio operator from Brooklyn. Fills in on any gun, never stops talking.', base: { acc: 46, trav: 52, disc: 48 },
    bonus: { kind: 'rate', amount: 0.06, what: 'rate of fire' },
    look: { skin: '#dcac84', hair: '#231a14', hat: 'none', jacket: 'b3', bg: '#55607a', jaw: 0.96, brows: -0.5, smile: 1, stubble: true, insignia: 'chevrons' } },
  { id: 'reilly', rank: 'Sgt.', first: 'Mick', last: 'Reilly', nick: 'Shorty', call: 'Sgt. Reilly', home: 'ball', voice: 'Reilly', gunner: true, specialty: 'ball',
    bio: 'Five foot four and proud of it. The only man aboard who likes the ball.', base: { acc: 50, trav: 56, disc: 46 },
    bonus: { kind: 'spread', amount: 0.12, what: 'gun spread' },
    look: { skin: '#f2c7a6', hair: '#c9a04a', hat: 'helmet', hatColor: '#5e3c26', jacket: 'b3', bg: '#6c4d7a', jaw: 0.88, brows: -0.1, smile: 0.6, freckles: true, goggles: true, insignia: 'chevrons' } },
  { id: 'price', rank: 'Sgt.', first: 'Earl', last: 'Price', nick: 'Tex', call: 'Sgt. Price', home: 'waistL', voice: 'Price', gunner: true, specialty: 'waistL',
    bio: 'West Texas ranch hand. Shoots like he is after coyotes.', base: { acc: 56, trav: 46, disc: 50 },
    bonus: { kind: 'damage', amount: 0.08, what: 'damage' },
    look: { skin: '#d3a072', hair: '#6b4a2a', hat: 'garrison', hatColor: '#6a6a46', jacket: 'b3', bg: '#9a6a3a', jaw: 1.12, brows: 0.6, smile: 0, stubble: true, insignia: 'chevrons' } },
  { id: 'walsh', rank: 'Sgt.', first: 'Danny', last: 'Walsh', nick: 'Lucky', call: 'Sgt. Walsh', home: 'waistR', voice: 'Walsh', gunner: true, specialty: 'waistR',
    bio: 'Never been scratched. Keeps a rabbit\'s foot in his flak vest.', base: { acc: 48, trav: 50, disc: 56 },
    bonus: { kind: 'rate', amount: 0.07, what: 'rate of fire' },
    look: { skin: '#eebd9a', hair: '#2d2d2d', hat: 'cap', hatColor: '#3f4a5c', jacket: 'a2', bg: '#3c6e6a', jaw: 0.94, brows: -0.2, smile: 0.8, insignia: 'chevrons' } },
  { id: 'dawson', rank: 'Sgt.', first: 'Joe', last: 'Dawson', nick: 'Hawkeye', call: 'Sgt. Dawson', home: 'tail', voice: 'Dawson', gunner: true, specialty: 'tail',
    bio: 'Iowa farm boy with the sharpest eyes in the group. Rides backwards and likes it.', base: { acc: 60, trav: 52, disc: 50 },
    bonus: { kind: 'traverse', amount: 0.1, what: 'traverse speed' },
    look: { skin: '#f0c09a', hair: '#d8b25a', hat: 'helmet', hatColor: '#4f3420', jacket: 'b3', bg: '#3e5f8a', jaw: 1, brows: 0.5, smile: 0.2, insignia: 'chevrons' } },
];

const BY_ID = new Map<ManId, ManDef>(MEN.map((m) => [m.id, m]));
export const manDef = (id: ManId): ManDef => BY_ID.get(id)!;
export const GUNNERS = MEN.filter((m) => m.gunner);

// Replacements while a man is out: one per position (their names match recorded radio lines)
export interface Rookie { call: string; last: string; look: PortraitLook }
const rookieLook = (skin: string, hair: string, bg: string, hat: PortraitLook['hat']): PortraitLook => ({ skin, hair, hat, jacket: 'olive', bg, rookie: true, smile: -0.3, brows: -0.8, jaw: 0.9 });
export const ROOKIES: Record<CrewId, Rookie> = {
  pilot: { call: 'Capt. Bill Morrow', last: 'Morrow', look: rookieLook('#e6b896', '#4a3420', '#555', 'crush') },
  copilot: { call: 'Lt. Jim Carver', last: 'Carver', look: rookieLook('#efc6a4', '#7a5a32', '#555', 'crush') },
  nav: { call: 'Lt. Ed Pruitt', last: 'Pruitt', look: rookieLook('#e9bf9c', '#2a221a', '#555', 'none') },
  bombardier: { call: 'Lt. Sam Ortega', last: 'Ortega', look: rookieLook('#c99467', '#1a1410', '#555', 'garrison') },
  engineer: { call: 'Sgt. Kowalski', last: 'Kowalski', look: rookieLook('#f1c8a8', '#b89a5a', '#555', 'cap') },
  radio: { call: 'Sgt. Hughes', last: 'Hughes', look: rookieLook('#e4b48e', '#5c4026', '#555', 'none') },
  ball: { call: 'Sgt. Baker', last: 'Baker', look: rookieLook('#f3caa8', '#8c5a2a', '#555', 'helmet') },
  waistL: { call: 'Sgt. Russo', last: 'Russo', look: rookieLook('#d8a47c', '#1e1813', '#555', 'garrison') },
  waistR: { call: 'Sgt. Novak', last: 'Novak', look: rookieLook('#efc2a0', '#c2a466', '#555', 'cap') },
  tail: { call: 'Sgt. Fisher', last: 'Fisher', look: rookieLook('#ebbc98', '#3b2a1c', '#555', 'helmet') },
};
const ROOKIE_SKILL = 24;

// ---------- levels ----------
export const MAX_CREW_LEVEL = 10;
export const xpFor = (level: number) => 75 * (level - 1) * level;   // L2 150, L5 1500, L10 6750
export const levelOf = (xp: number) => { let l = 1; while (l < MAX_CREW_LEVEL && xp >= xpFor(l + 1)) l++; return l; };
export const STAT_PER_LEVEL = 4;
const SPECIALIST_BONUS = 12;  // skill points in his own seat
export const XP_KILL = 100, XP_MISSION_OK = 60, XP_MISSION_FAIL = 25;
export const HEAL_COST = 300;

// recorded in each gunner's own voice (tools/voice/lines.json; speaker = his surname alias)
const LEVEL_LINES = [VOICE_LINES.crew_levelup_1.text, VOICE_LINES.crew_levelup_2.text, VOICE_LINES.crew_levelup_3.text];

// ---------- AI skill ----------
export interface AISkill {
  spread: number;  // multiplier on the AI gunner's cone of fire
  leadC: number;   // lead fraction: centre ...
  leadW: number;   // ... and random half-width (default 0.9 ± 0.7, as before the crew)
  react: number;   // multiplier on the retarget interval (traverse: faster on a new target)
  burst: number;   // multiplier on burst length (discipline: shorter controlled bursts)
  engage: number;  // multiplier on the chance to open fire (discipline: fires more often)
}
export const DEFAULT_SKILL: Readonly<AISkill> = Object.freeze({ spread: 1, leadC: 0.9, leadW: 0.7, react: 1, burst: 1, engage: 1 });

interface ManState { xp: number; kills: number; missions: number; rest: number; wounds: number; seen: number }
interface Saved { v: 1; men: Partial<Record<ManId, Partial<ManState>>>; seats: Partial<Record<Post, ManId>> }

const KEY = 'sws3d.crew.v1';
const DEFAULT_SEATS: Record<Post, ManId> = { top: 'mendez', radio: 'gallo', ball: 'reilly', waistL: 'price', waistR: 'walsh', tail: 'dawson' };
const fresh = (): ManState => ({ xp: 0, kills: 0, missions: 0, rest: 0, wounds: 0, seen: 1 });
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// What the game hands the roster (structural, so this file needs no UI import)
interface RosterUI { banner(a: string, b: string, ms?: number): void; feed(text: string, kind?: 'mine' | 'loss' | ''): void }
type Victim = { team: string; pos: { clone(): any; distanceTo(v: any): number } };

export type RosterEvent = 'mission' | 'change' | 'levelup';

export class CrewRoster {
  men = {} as Record<ManId, ManState>;
  seats: Record<Post, ManId> = { ...DEFAULT_SEATS };
  // ---- this mission ----
  active = false;
  private world: World | null = null;
  private ui: RosterUI | null = null;
  private occ = {} as Record<CrewId, ManId | null>;   // null = a rookie mans it
  readonly wounded = new Set<ManId>();   // hit this round, not yet replaced
  readonly benched = new Set<ManId>();   // sitting out this round
  readonly resting = new Set<ManId>();   // sitting out this whole mission
  private flew = new Set<ManId>();
  notes: string[] = [];                 // latest roster news for the hangar (heals, level-ups)
  private skillCache: Partial<Record<StationId, AISkill>> = {};
  private listeners: ((e: RosterEvent, who?: ManId) => void)[] = [];

  constructor() {
    for (const m of MEN) this.men[m.id] = fresh();
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
      if (s && typeof s === 'object') {
        for (const m of MEN) {
          const v = s.men?.[m.id];
          if (!v) continue;
          const st = this.men[m.id];
          st.xp = Math.max(0, num(v.xp, 0)); st.kills = Math.max(0, num(v.kills, 0)); st.missions = Math.max(0, num(v.missions, 0));
          st.rest = Math.max(0, Math.min(1, num(v.rest, 0))); st.wounds = Math.max(0, num(v.wounds, 0)); st.seen = num(v.seen, levelOf(st.xp));
        }
        // seats: six distinct gunners, else fall back to the default crew positions
        const seats = { ...DEFAULT_SEATS, ...(s.seats ?? {}) } as Record<Post, ManId>;
        const ids = POSTS.map((p) => seats[p]);
        if (ids.every((id) => BY_ID.get(id)?.gunner) && new Set(ids).size === POSTS.length) this.seats = seats;
      }
    } catch { /* storage unavailable or corrupt: defaults */ }
    this.placeAll();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, men: this.men, seats: this.seats } satisfies Saved)); } catch { /* */ }
  }

  on(f: (e: RosterEvent, who?: ManId) => void) { this.listeners.push(f); }
  private emit(e: RosterEvent, who?: ManId) { this.skillCache = {}; for (const f of this.listeners) f(e, who); }

  // ---------- queries ----------
  level(id: ManId) { return levelOf(this.men[id].xp); }
  stat(id: ManId, s: Stat) { return Math.min(100, manDef(id).base[s] + STAT_PER_LEVEL * (this.level(id) - 1)); }
  postOf(id: ManId): Post | null { return POSTS.find((p) => this.seats[p] === id) ?? null; }
  // out now, or (wounded this round) out from the next round
  isOut(id: ManId) { return this.resting.has(id) || this.benched.has(id) || this.wounded.has(id) || (!this.active && this.men[id].rest > 0); }
  // who is at a crew position right now (null = rookie replacement)
  occupant(c: CrewId): ManId | null { return this.occ[c] ?? null; }
  rookie(c: CrewId): Rookie { return ROOKIES[c]; }
  isWounded(id: ManId) { return this.wounded.has(id); }
  // HUD: the position is hit (its man, or the rookie standing in)
  posWounded(c: CrewId) { return this.active && !!this.world?.crew.wounded.has(c); }

  // Player's seat bonus from the crewman who mans it: full value in his specialty seat,
  // half elsewhere (three quarters for the all-rounder), +5% per level above 1.
  bonusAt(station: StationId, id: ManId): number {
    const d = manDef(id);
    if (!d.bonus) return 0;
    const fit = d.specialty === station ? 1 : d.specialty === null ? 0.75 : 0.5;
    return d.bonus.amount * fit * (1 + 0.05 * (this.level(id) - 1));
  }

  seatMult(station: StationId, kind: BonusKind): number {
    if (!this.active) return 1;
    const id = this.occ[POST_CREW[station]];
    if (!id) return 1;
    const d = manDef(id);
    if (d.bonus?.kind !== kind) return 1;
    const a = this.bonusAt(station, id);
    return kind === 'spread' || kind === 'heat' ? 1 - a : 1 + a;
  }

  // Effective gun skill 0..100 at a station (specialist bonus, wounded penalty, rookies)
  effSkill(station: StationId, s: Stat, id: ManId | null): number {
    if (!id) return ROOKIE_SKILL;
    let v = this.stat(id, s) + (manDef(id).specialty === station ? SPECIALIST_BONUS : 0);
    if (this.wounded.has(id)) v *= 0.7;
    return Math.min(100, v);
  }

  aiSkill(station: StationId): AISkill {
    if (!this.active) return DEFAULT_SKILL;
    let k = this.skillCache[station];
    if (k) return k;
    const id = this.occ[POST_CREW[station]];
    const n = (s: Stat) => Math.max(0.05, Math.min(1, this.effSkill(station, s, id) / 100));
    const a = n('acc'), t = n('trav'), d = n('disc');
    // skill 50 reproduces the old AI gunner exactly
    k = { spread: 1.45 - 0.9 * a, leadC: 0.9 + 0.2 * (a - 0.5), leadW: 0.7 * (1.4 - 0.8 * a), react: 1.4 - 0.8 * t, burst: 1.3 - 0.6 * d, engage: 0.7 + 0.6 * d };
    this.skillCache[station] = k;
    return k;
  }

  // ---------- assignment ----------
  swap(a: Post, b: Post) {
    if (a === b) return;
    const t = this.seats[a]; this.seats[a] = this.seats[b]; this.seats[b] = t;
    this.save();
    if (!this.active) this.placeAll();
    this.emit('change');
  }

  // Flight surgeon (merit points): back on duty straight away
  heal(id: ManId, why = 'Flight surgeon') {
    this.men[id].rest = 0;
    this.resting.delete(id); this.wounded.delete(id); this.benched.delete(id);
    this.note(`${why}: ${manDef(id).call} is fit for duty`);
    this.save();
    if (!this.active) this.placeAll();
    this.emit('change');
  }

  private note(t: string) { this.notes.unshift(t); this.notes.length = Math.min(this.notes.length, 4); }

  // ---------- mission hooks ----------

  // Game.startMission, after ui.hud(): who flies, rookies for resting men, HUD panel.
  beginMission(world: World, ui: RosterUI, role: 'gunner' | 'pilot') {
    this.world = world; this.ui = ui;
    this.wounded.clear(); this.benched.clear(); this.resting.clear(); this.flew.clear();
    this.active = role === 'gunner';
    world.crew.onWound = this.active ? (c) => this.onWound(c) : null;
    if (!this.active) { this.placeAll(); this.emit('mission'); return; }
    for (const m of MEN) if (this.men[m.id].rest > 0) this.resting.add(m.id);
    this.place();
    for (const m of MEN) if (this.resting.has(m.id)) {
      const pos = m.gunner ? POST_CREW[this.postOf(m.id)!] : m.home;
      ui.feed(`${m.call} is resting — ${ROOKIES[pos].call} (rookie) takes his place`, 'loss');
    }
    this.emit('mission');
  }

  // Game kill event (every kill): XP to the man at the station that made it.
  onKill(victim: Victim, byPlayer: boolean) {
    const w = this.world;
    if (!this.active || !w || victim.team !== 'axis') return;
    const pb = w.playerBomber;
    if (!pb || !pb.alive) return;
    let station: StationId | null = null;
    if (byPlayer) station = w.player === pb && w.playerStation ? w.playerStation.id : null;
    else {
      // AI kill: the player's ship must be the nearest bomber, the fighter inside a manned gun's arc
      const d0 = victim.pos.distanceTo(pb.pos);
      if (d0 > 900 || w.bombers().some((b) => b !== pb && b.alive && victim.pos.distanceTo(b.pos) < d0)) return;
      let best = Infinity;
      for (const id of STATION_ORDER) {
        if (w.playerStation && w.player === pb && w.playerStation.id === id) continue; // the player's own gun
        const st = STATIONS[id];
        const local = pb.worldToLocal(victim.pos.clone()).sub(st.pivot);
        const d = local.length();
        if (d < best && inArc(st, local)) { best = d; station = id; }
      }
    }
    if (!station) return;
    const man = this.occ[POST_CREW[station]];
    if (!man) return;
    this.men[man].kills++;
    this.award(man, XP_KILL, true);
  }

  // Game.startNextRound: heal by perk or luck, replace this round's wounded with rookies.
  onRoundStart(perks: readonly string[] = []) {
    if (!this.active) return;
    const ui = this.ui;
    if (perks.includes('medic') && this.wounded.size) {
      const id = [...this.wounded][0];
      this.wounded.delete(id);
      ui?.feed(`Crew Chief patched up ${manDef(id).call} — back on his gun`, 'mine');
    }
    for (const id of [...this.wounded]) if (Math.random() < 0.2) {
      this.wounded.delete(id);
      ui?.feed(`${manDef(id).call}: just a scratch — staying on his gun`, 'mine');
    }
    this.benched.clear();
    for (const id of this.wounded) this.benched.add(id);
    this.wounded.clear();
    this.place();
    // every position now has a fit man (or a fresh rookie) in it
    for (const c of CREW) this.world?.crew.heal(c.id);
    for (const id of this.benched) {
      const m = manDef(id);
      const pos = m.gunner ? POST_CREW[this.postOf(id)!] : m.home;
      ui?.feed(`${ROOKIES[pos].call} (rookie) takes over from ${m.call}`, 'loss');
    }
    this.emit('change');
  }

  // Game.showDebrief: mission XP, rest for the wounded, the flight surgeon's rounds.
  endMission(success: boolean) {
    if (!this.active) return;
    this.active = false;
    for (const m of MEN) {
      const st = this.men[m.id];
      if (this.resting.has(m.id)) { st.rest = Math.max(0, st.rest - 1); continue; }
      if (this.flew.has(m.id)) { st.missions++; this.award(m.id, success ? XP_MISSION_OK : XP_MISSION_FAIL, false); }
      if (this.wounded.has(m.id)) {
        st.rest = 1;
        if (success && Math.random() < 0.3) { st.rest = 0; this.note(`Flight surgeon: ${m.call}'s wound was light, fit for the next mission`); }
        else this.note(`${m.call} is wounded and misses the next mission`);
      }
    }
    if (this.world) this.world.crew.onWound = null;
    this.wounded.clear(); this.benched.clear(); this.resting.clear(); this.flew.clear();
    this.save();
    this.placeAll();
    this.emit('change');
  }

  // ---------- internals ----------

  private onWound(c: CrewId) {
    const id = this.occ[c];
    if (id) {
      this.wounded.add(id);
      this.men[id].wounds++;
      this.save();
    }
    this.emit('change', id ?? undefined);
  }

  private award(id: ManId, xp: number, loud: boolean) {
    const st = this.men[id];
    const before = levelOf(st.xp);
    st.xp += xp;
    const after = levelOf(st.xp);
    this.save();
    if (after <= before) { this.emit('change', id); return; }
    const m = manDef(id);
    this.note(`${m.call} reached level ${after}`);
    if (loud && this.ui && this.world) {
      const gain = `+${STAT_PER_LEVEL * (after - before)} accuracy, traverse and discipline`;
      this.ui.banner(`LEVEL ${after} · ${m.rank.toUpperCase()} ${m.last.toUpperCase()}`, `"${m.nick}" — ${gain}`, 2800);
      if (m.gunner) this.world.callout('lvl_' + id, m.voice, LEVEL_LINES[Math.floor(Math.random() * LEVEL_LINES.length)], 0, 2);
    }
    this.emit('levelup', id);
  }

  // Positions this mission: resting/benched men are replaced by the position's rookie
  private place() {
    for (const p of POSTS) {
      const id = this.seats[p];
      this.occ[POST_CREW[p]] = this.resting.has(id) || this.benched.has(id) ? null : id;
    }
    for (const m of MEN) if (!m.gunner) this.occ[m.home] = this.resting.has(m.id) || this.benched.has(m.id) ? null : m.id;
    for (const c of CREW) {
      const id = this.occ[c.id];
      if (id) this.flew.add(id);
      // radio calls ("Sgt. Dawson is hit at the left waist gun!") name whoever is there now
      crewMember(c.id).name = id ? manDef(id).call : ROOKIES[c.id].call;
    }
    this.skillCache = {};
  }

  // Out of a mission (menu / hangar): everyone at his seat, resting men replaced
  private placeAll() {
    for (const p of POSTS) { const id = this.seats[p]; this.occ[POST_CREW[p]] = this.men[id].rest > 0 ? null : id; }
    for (const m of MEN) if (!m.gunner) this.occ[m.home] = this.men[m.id].rest > 0 ? null : m.id;
    this.flew.clear();
    for (const c of CREW) { const id = this.occ[c.id]; crewMember(c.id).name = id ? manDef(id).call : ROOKIES[c.id].call; }
  }
}

export const crewRoster = new CrewRoster();

// World.bomberGunners hook: skill of the AI gunner at one of the player's stations
// (DEFAULT_SKILL for the other bombers and outside gunner missions).
export function aiGunnerSkill(station: StationId | null | undefined): Readonly<AISkill> {
  return station ? crewRoster.aiSkill(station) : DEFAULT_SKILL;
}

// GunnerController.applyLoadout hook: the same loadout, with the crewman's seat bonus folded
// into traverse / spread / heat / rate / damage for whichever station the player is at.
export function crewSeatLoadout(l: Loadout, station: () => StationId): Loadout {
  const o = Object.create(l) as Loadout;
  for (const k of ['traverse', 'spread', 'heat', 'rate', 'damage'] as const) {
    Object.defineProperty(o, k, { get: () => l[k] * crewRoster.seatMult(station(), k), enumerable: true });
  }
  return o;
}

if (import.meta.env.DEV) (window as any).swsCrew = crewRoster;
