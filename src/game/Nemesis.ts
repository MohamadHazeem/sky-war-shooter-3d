// Nemesis: a persistent roster of named (fictional) Luftwaffe Experten who remember the player.
// Pure data and maths plus guarded localStorage (sws3d.nemesis.v1, mirrored by the cloud save
// like every sws3d.* key), so it is unit-tested in Node. The in-mission side (appearances,
// trait AI, radio, the HUD dossier card, rewards, the debrief lines) is NemesisRuntime.ts; the
// "Luftwaffe Experten" screen is ui/NemesisScreen.ts; the markings are world/AceLook.ts.
//
// - ROSTER_SIZE aces are on strength at any time. Each has a name, rank, unit, aircraft, a
//   personal colour and emblem, victories and a style trait that drives his AI.
// - applyEncounter() commits what happened when he met the player: victories for damage done,
//   crewmen wounded and aircraft shot down (with promotion up the rank ladder); patches and a
//   grudge when he escaped damaged; death (or a bail-out and a spell in hospital) when he was
//   shot down. Dead aces leave the roster (kept in `fallen` for the dossiers) and a new man is
//   promoted from the ranks so the roster stays full.
// - Every ace has a price on his head (bounty); the most wanted one pays double.
import { tx, isAr } from '../i18n';

export const NEMESIS_KEY = 'sws3d.nemesis.v1';
export const ROSTER_SIZE = 8;
export const FALLEN_KEEP = 12;
export const HISTORY_KEEP = 12;
export const HIT_CLAIM = 8;            // hits on the player's aircraft that count as "shot him up" (a victory claim)
export const SCAR_HEALTH = 0.6;        // escaping below this health leaves patches and a grudge
export const MOST_WANTED_MULT = 2;
export const HOSPITAL_MISSIONS = 2;    // a bailed-out ace is back after this many missions
export const MAX_SCARS = 4;
export const MAX_GRUDGE = 3;

// ---------------- data ----------------

export type Trait = 'headon' | 'sun' | 'straggler' | 'tailgun' | 'escorts' | 'jet' | 'sturmbock' | 'biggun';
export type AceType = 'fw190' | 'bf109' | 'me262' | 'me410';
export const TRAIT_IDS: Trait[] = ['headon', 'sun', 'straggler', 'tailgun', 'escorts', 'jet', 'sturmbock', 'biggun'];

export interface TraitDef { label: string; blurb: string; types: AceType[]; units: string[] }
export const TRAITS: Record<Trait, TraitDef> = {
  headon: { label: 'Head-on specialist', blurb: 'Comes in from twelve o\'clock high and never turns away first.', types: ['fw190'], units: ['JG 26', 'JG 1', 'JG 11'] },
  sun: { label: 'Attacks out of the sun', blurb: 'Climbs up-sun and dives out of the glare, where the gunners cannot look.', types: ['bf109'], units: ['JG 2', 'JG 27', 'JG 26'] },
  straggler: { label: 'Hunts stragglers', blurb: 'Circles the box and pounces on any bomber that falls behind.', types: ['bf109', 'fw190'], units: ['JG 3', 'JG 11'] },
  tailgun: { label: 'Goes for the tail gunner', blurb: 'Kills the tail gun first: then the bomber is blind from behind.', types: ['fw190'], units: ['JG 1', 'JG 26'] },
  escorts: { label: 'Fights the escorts', blurb: 'Leaves the bombers to his wingmen and goes looking for Mustangs.', types: ['bf109'], units: ['JG 300', 'JG 27'] },
  jet: { label: 'Jet ace (Me 262)', blurb: 'One slashing pass at five hundred miles an hour, then gone.', types: ['me262'], units: ['JG 7', 'KG 51'] },
  sturmbock: { label: 'Sturmbock (armoured Fw 190)', blurb: 'Armour plate and heavy cannon: closes from astern to point-blank range.', types: ['fw190'], units: ['JG 3', 'JG 300', 'JG 4'] },
  biggun: { label: 'Zerstörer ace (Me 410)', blurb: 'Stands off at two kilometres and fires his 50 mm cannon.', types: ['me410'], units: ['ZG 26', 'ZG 76'] },
};

export interface RankDef { name: string; short: string; at: number }
// Luftwaffe officer ranks; `at` is the victory count that earns the promotion
export const ACE_RANKS: RankDef[] = [
  { name: 'Leutnant', short: 'Lt.', at: 0 },
  { name: 'Oberleutnant', short: 'Oblt.', at: 20 },
  { name: 'Hauptmann', short: 'Hptm.', at: 40 },
  { name: 'Major', short: 'Maj.', at: 65 },
  { name: 'Oberstleutnant', short: 'Obstlt.', at: 95 },
  { name: 'Oberst', short: 'Obst.', at: 130 },
];
export const rankForVictories = (v: number) => { let r = 0; while (r < ACE_RANKS.length - 1 && v >= ACE_RANKS[r + 1].at) r++; return r; };

// Fictional names only (no real pilots). Arabic for every word lives in i18n/ar/nemesis.ts.
export const FIRST_NAMES = ['Heinz', 'Walter', 'Erich', 'Günther', 'Hans', 'Josef', 'Wolfgang', 'Gerhard', 'Helmut', 'Friedrich', 'Karl', 'Ernst', 'Werner', 'Rudolf', 'Egon', 'Anton', 'Horst', 'Dieter'];
// also the recorded radio names (tools/voice/lines.json `vars`): keep both lists in step
export const SURNAMES = ['Brückner', 'Dorn', 'Eckhardt', 'Faber', 'Gebhardt', 'Hollmann', 'Kranz', 'Lindner', 'Neumeyer', 'Ostermann', 'Pfeiffer', 'Reuter',
  'Sauer', 'Thalberg', 'Vossberg', 'Wendt', 'Zeller', 'Kaltenbach', 'Riedel', 'Stahl', 'Winterfeld', 'Haller', 'Ritter', 'Engel'];

export interface ColourDef { hex: string; name: string }
export const COLOURS: ColourDef[] = [
  { hex: '#e8b923', name: 'Yellow' }, { hex: '#c0392b', name: 'Red' }, { hex: '#2e6fc1', name: 'Blue' }, { hex: '#efefe8', name: 'White' },
  { hex: '#1d1d1d', name: 'Black' }, { hex: '#2f9e55', name: 'Green' }, { hex: '#e0711c', name: 'Orange' }, { hex: '#8a3fae', name: 'Violet' },
];

// Personal emblems as SVG path data in a 64x64 box (fill-rule evenodd): the dossier draws them as
// SVG, AceLook paints them on the tail through Path2D.
export type EmblemId = 'spade' | 'heart' | 'wolf' | 'bolt' | 'wings' | 'devil' | 'crown' | 'star';
export const EMBLEMS: Record<EmblemId, { label: string; d: string }> = {
  spade: { label: 'Ace of spades', d: 'M32 6 C24 18 8 26 8 38 C8 46 16 51 24 47 C27 45 29 43 30 41 C29 48 26 54 22 58 L42 58 C38 54 35 48 34 41 C35 43 37 45 40 47 C48 51 56 46 56 38 C56 26 40 18 32 6 Z' },
  heart: { label: 'Red heart', d: 'M32 56 C14 42 6 32 6 22 C6 13 13 8 20 8 C26 8 30 12 32 16 C34 12 38 8 44 8 C51 8 58 13 58 22 C58 32 50 42 32 56 Z' },
  wolf: { label: 'Wolf\'s head', d: 'M12 8 L24 22 L40 22 L52 8 L54 30 C54 44 44 56 32 58 C20 56 10 44 10 30 Z M21 33 L29 36 L21 39 Z M43 33 L35 36 L43 39 Z M28 48 L32 52 L36 48 Z' },
  bolt: { label: 'Lightning bolt', d: 'M38 4 L14 36 L29 36 L22 60 L50 24 L35 24 L46 4 Z' },
  wings: { label: 'Eagle\'s wings', d: 'M32 30 C24 18 12 14 2 16 C10 20 14 26 16 32 C22 32 28 34 32 42 C36 34 42 32 48 32 C50 26 54 20 62 16 C52 14 40 18 32 30 Z' },
  devil: { label: 'Red devil', d: 'M14 6 L22 20 C26 18 38 18 42 20 L50 6 L50 24 C54 30 54 40 50 46 C46 54 40 58 32 58 C24 58 18 54 14 46 C10 40 10 30 14 24 Z M21 31 L29 35 L21 38 Z M43 31 L35 35 L43 38 Z M23 45 L32 50 L41 45 L32 47 Z' },
  crown: { label: 'Crown', d: 'M6 48 L10 16 L22 32 L32 10 L42 32 L54 16 L58 48 Z M6 52 L58 52 L58 60 L6 60 Z' },
  star: { label: 'Staffel star', d: 'M32 4 L39 24 L60 24 L43 37 L49 58 L32 45 L15 58 L21 37 L4 24 L25 24 Z' },
};
export const EMBLEM_IDS = Object.keys(EMBLEMS) as EmblemId[];

export type Fate = 'down' | 'bailed' | 'escaped' | 'withdrew';

export interface Encounter {
  n: number;            // the player's mission number (NemesisState.missions)
  place: string;        // English, e.g. 'Bremen', 'the Reich'
  mission: string;      // mission title (English)
  role: 'gunner' | 'pilot';
  fate: Fate;
  byPlayer: boolean;    // shot down by the player (down / bailed)
  hits: number;         // his hits on the player's aircraft
  wounded: string[];    // crew calls he wounded ('Sgt. Reilly')
  downed: number;       // allied aircraft he shot down (including the player's)
  downedUs: boolean;    // he shot down the player's aircraft
  gained: number;       // victories gained
  promotedTo?: number;  // new rank index
  scarred: boolean;     // left with patches
  payout?: number;      // merit paid for him
  date: number;
}

export type AceStatus = 'active' | 'injured' | 'dead';

export interface AceRecord {
  id: string;
  first: string;
  last: string;
  rank: number;
  unit: string;
  type: AceType;
  trait: Trait;
  color: string;
  emblem: EmblemId;
  victories: number;
  status: AceStatus;
  returnAt: number;     // injured: on strength again from this mission number
  recovered: boolean;   // back from hospital, not met since (radio line)
  scars: number;        // patches on his aircraft
  grudge: number;       // 0..3: how much he wants the player
  joined: number;       // mission number he joined the roster
  promotedFrom: string; // '' or the name of the ace whose place he took
  history: Encounter[];
}

export interface AceSnap { first: string; last: string; rank: number; unit: string; victories: number }
export interface ReportItem { id: string; ace: AceSnap; enc: Encounter; replacement?: AceSnap }
export interface MissionReport { n: number; mission: string; place: string; campaign: boolean; items: ReportItem[] }

export interface NemesisState {
  v: 1;
  seq: number;
  missions: number;
  aces: AceRecord[];      // on strength (active or injured)
  fallen: AceRecord[];    // killed in action, newest first
  kills: number;          // Experten shot down by the player (including bail-outs)
  last: MissionReport | null;
}

// ---------------- helpers ----------------

type Rng = () => number;
const pick = <T>(a: readonly T[], rng: Rng): T => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
const irange = (a: number, b: number, rng: Rng) => a + Math.floor(rng() * (b - a + 1));
export const round50 = (n: number) => Math.round(n / 50) * 50;
export const snap = (a: AceRecord): AceSnap => ({ first: a.first, last: a.last, rank: a.rank, unit: a.unit, victories: a.victories });

export function emptyNemesis(): NemesisState {
  return { v: 1, seq: 0, missions: 0, aces: [], fallen: [], kills: 0, last: null };
}

// counters derived from an ace's history with the player
export function record(a: AceRecord) {
  const h = a.history;
  return {
    met: h.length,
    wounded: h.flatMap((e) => e.wounded),
    downedUs: h.filter((e) => e.downedUs).length,
    shotUp: h.filter((e) => e.hits >= HIT_CLAIM).length,
    escapes: h.filter((e) => e.fate === 'escaped').length,
    downs: h.filter((e) => (e.fate === 'down' || e.fate === 'bailed') && e.byPlayer).length,
  };
}

// merit for shooting him down (before the most-wanted double)
export function bounty(a: AceRecord): number {
  const r = record(a);
  return round50(250 + a.victories * 6 + a.grudge * 150 + r.wounded.length * 120 + r.downedUs * 200 + a.scars * 40);
}

// the most wanted: the highest price among the aces on strength (active first)
export function mostWanted(st: NemesisState): AceRecord | null {
  const pool = st.aces.filter((a) => a.status === 'active');
  const src = pool.length ? pool : st.aces;
  let best: AceRecord | null = null, bb = -1;
  for (const a of src) { const b = bounty(a); if (b > bb) { bb = b; best = a; } }
  return best;
}

export const payoutFor = (st: NemesisState, a: AceRecord) => bounty(a) * (mostWanted(st)?.id === a.id ? MOST_WANTED_MULT : 1);

// ---------------- roster ----------------

// A new Experte. fresh = promoted from the ranks (fewer victories, a junior rank).
export function generateAce(st: NemesisState, rng: Rng = Math.random, fresh = false): AceRecord {
  const used = new Set([...st.aces, ...st.fallen.slice(0, 6)].map((a) => a.last));
  const lasts = SURNAMES.filter((s) => !used.has(s));
  const last = pick(lasts.length ? lasts : SURNAMES, rng);
  // the least represented trait on the roster, ties broken at random
  const count = (t: Trait) => st.aces.filter((a) => a.trait === t).length;
  const min = Math.min(...TRAIT_IDS.map(count));
  const trait = pick(TRAIT_IDS.filter((t) => count(t) === min), rng);
  const def = TRAITS[trait];
  const colours = COLOURS.filter((c) => !st.aces.some((a) => a.color === c.hex));
  const emblems = EMBLEM_IDS.filter((e) => !st.aces.some((a) => a.emblem === e));
  const victories = fresh ? irange(12, 30, rng) : irange(22, 88, rng);
  const rank = Math.max(0, rankForVictories(victories) - (rng() < 0.3 ? 1 : 0));
  st.seq++;
  return {
    id: `x${st.seq}`, first: pick(FIRST_NAMES, rng), last, rank, unit: pick(def.units, rng), type: pick(def.types, rng), trait,
    color: pick(colours.length ? colours : COLOURS, rng).hex, emblem: pick(emblems.length ? emblems : EMBLEM_IDS, rng),
    victories, status: 'active', returnAt: 0, recovered: false, scars: 0, grudge: 0, joined: st.missions, promotedFrom: '', history: [],
  };
}

// Top the roster up to ROSTER_SIZE. The first fill is seasoned Experten; later ones are promoted
// from the ranks. Returns the newcomers.
export function ensureRoster(st: NemesisState, rng: Rng = Math.random): AceRecord[] {
  const fresh = st.seq > 0;
  const out: AceRecord[] = [];
  while (st.aces.length < ROSTER_SIZE) {
    const a = generateAce(st, rng, fresh);
    st.aces.push(a);
    out.push(a);
  }
  return out;
}

// A new mission begins: count it, discharge the injured whose time is up
export function beginMission(st: NemesisState): AceRecord[] {
  st.missions++;
  const back: AceRecord[] = [];
  for (const a of st.aces) {
    if (a.status === 'injured' && st.missions >= a.returnAt) { a.status = 'active'; a.recovered = true; back.push(a); }
  }
  return back;
}

export interface PickOpts { role: 'gunner' | 'pilot'; exclude?: ReadonlySet<string> }

// Who turns up: aces with a grudge or a history with the player are likelier
export function pickAce(st: NemesisState, o: PickOpts, rng: Rng = Math.random): AceRecord | null {
  const pool = st.aces.filter((a) => a.status === 'active' && !o.exclude?.has(a.id));
  if (!pool.length) return null;
  const weight = (a: AceRecord) => {
    let w = 1 + 1.5 * a.grudge + (a.history.length ? 0.8 : 0) + (a.recovered ? 0.6 : 0);
    if (o.role === 'pilot') w *= a.trait === 'escorts' ? 1.6 : a.trait === 'biggun' ? 0.5 : a.trait === 'tailgun' ? 0.7 : 1;
    else w *= a.trait === 'tailgun' || a.trait === 'sun' ? 1.3 : 1;
    return w;
  };
  let tot = 0;
  for (const a of pool) tot += weight(a);
  let r = rng() * tot;
  for (const a of pool) { r -= weight(a); if (r <= 0) return a; }
  return pool[pool.length - 1];
}

export interface EncounterInput {
  fate: Fate;
  byPlayer: boolean;
  hits: number;
  wounded: string[];
  downed: number;
  downedUs: boolean;
  health: number;       // 0..1 when he left (escaped / withdrew)
  place: string;
  mission: string;
  role: 'gunner' | 'pilot';
  campaign?: boolean;
}

export interface EncounterResult { ace: AceRecord; enc: Encounter; promotedTo: number | null; replacement: AceRecord | null; payout: number; wasMostWanted: boolean }

// Commit one meeting with the player. Mutates the state (and saves nothing: the caller does).
export function applyEncounter(st: NemesisState, id: string, inp: EncounterInput, rng: Rng = Math.random): EncounterResult | null {
  const a = st.aces.find((x) => x.id === id);
  if (!a) return null;
  const wasMostWanted = mostWanted(st)?.id === a.id;
  const shotDown = inp.fate === 'down' || inp.fate === 'bailed';
  const payout = shotDown && inp.byPlayer ? bounty(a) * (wasMostWanted ? MOST_WANTED_MULT : 1) : 0;
  // victories: every aircraft he brought down, every man he wounded, and a claim for shooting us up
  const shotUp = inp.hits >= HIT_CLAIM && !inp.downedUs;
  const gained = Math.max(0, inp.downed) + inp.wounded.length + (shotUp ? 1 : 0);
  a.victories += gained;
  const rank = Math.max(a.rank, rankForVictories(a.victories));
  const promotedTo = rank > a.rank ? rank : null;
  a.rank = rank;
  const scarred = inp.fate === 'escaped' || inp.fate === 'bailed';
  if (scarred) { a.scars = Math.min(MAX_SCARS, a.scars + 1); a.grudge = Math.min(MAX_GRUDGE, a.grudge + 1); }
  // hurting us makes it personal too (he wants the rest of the crew)
  else if (gained > 0 && a.grudge === 0 && rng() < 0.5) a.grudge = 1;
  a.recovered = false;
  const enc: Encounter = {
    n: st.missions, place: inp.place, mission: inp.mission, role: inp.role, fate: inp.fate, byPlayer: shotDown && inp.byPlayer,
    hits: inp.hits, wounded: [...inp.wounded], downed: inp.downed, downedUs: inp.downedUs, gained, scarred, date: Date.now(),
  };
  if (promotedTo !== null) enc.promotedTo = promotedTo;
  if (payout) enc.payout = payout;
  a.history.push(enc);
  if (a.history.length > HISTORY_KEEP) a.history.splice(0, a.history.length - HISTORY_KEEP);
  if (shotDown && inp.byPlayer) st.kills++;
  let replacement: AceRecord | null = null;
  if (inp.fate === 'bailed') {
    a.status = 'injured';
    a.returnAt = st.missions + HOSPITAL_MISSIONS + 1;
  } else if (inp.fate === 'down') {
    a.status = 'dead';
    st.aces = st.aces.filter((x) => x !== a);
    st.fallen.unshift(a);
    if (st.fallen.length > FALLEN_KEEP) st.fallen.length = FALLEN_KEEP;
    replacement = generateAce(st, rng, true);
    replacement.promotedFrom = `${ACE_RANKS[a.rank].short} ${a.first} ${a.last}`;
    // his successor flies the same unit and wants the crew that killed him
    replacement.unit = a.unit;
    if (inp.byPlayer) replacement.grudge = 1;
    st.aces.push(replacement);
  }
  // the mission's report (debrief and campaign intelligence)
  if (!st.last || st.last.n !== st.missions) st.last = { n: st.missions, mission: inp.mission, place: inp.place, campaign: !!inp.campaign, items: [] };
  st.last.items.push({ id: a.id, ace: snap(a), enc, ...(replacement ? { replacement: snap(replacement) } : {}) });
  return { ace: a, enc, promotedTo, replacement, payout, wasMostWanted };
}

// Where a mission is flown, for the history lines: 'Port facilities, Bremen' -> 'Bremen',
// 'Escort — Leipzig' -> 'Leipzig', 'Return leg — over the Netherlands' -> 'the Netherlands'
export function placeOf(m: { id: string; target: string; number: number }): string {
  if (m.id.startsWith('acehunt-')) return 'the Ruhr';
  if (m.id.startsWith('survival-') || m.id.startsWith('daily-') || m.id.startsWith('custom') || m.id.startsWith('weekly')) return 'the Reich';
  const t = m.target ?? '';
  let p = t.includes('—') ? t.split('—').pop()! : t.includes(',') ? t.split(',').pop()! : '';
  p = p.trim().replace(/^over /, '');
  return p && /^[A-Za-zÄÖÜäöüß' .-]+$/.test(p) && p.length < 24 ? p : 'the Reich';
}

// ---------------- persistence ----------------

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const FATES: Fate[] = ['down', 'bailed', 'escaped', 'withdrew'];

function cleanEnc(e: any): Encounter | null {
  if (!e || typeof e !== 'object') return null;
  const out: Encounter = {
    n: num(e.n, 0), place: str(e.place, 'the Reich'), mission: str(e.mission, ''), role: e.role === 'pilot' ? 'pilot' : 'gunner',
    fate: FATES.includes(e.fate) ? e.fate : 'withdrew', byPlayer: !!e.byPlayer, hits: Math.max(0, num(e.hits, 0)),
    wounded: Array.isArray(e.wounded) ? e.wounded.filter((x: unknown) => typeof x === 'string').slice(0, 10) : [],
    downed: Math.max(0, num(e.downed, 0)), downedUs: !!e.downedUs, gained: Math.max(0, num(e.gained, 0)), scarred: !!e.scarred, date: num(e.date, 0),
  };
  if (typeof e.promotedTo === 'number') out.promotedTo = Math.max(0, Math.min(ACE_RANKS.length - 1, e.promotedTo));
  if (typeof e.payout === 'number') out.payout = Math.max(0, e.payout);
  return out;
}

function cleanAce(a: any): AceRecord | null {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.last !== 'string') return null;
  const trait: Trait = TRAIT_IDS.includes(a.trait) ? a.trait : 'headon';
  const types = ['fw190', 'bf109', 'me262', 'me410'];
  return {
    id: a.id, first: str(a.first, 'Hans'), last: a.last, rank: Math.max(0, Math.min(ACE_RANKS.length - 1, Math.floor(num(a.rank, 0)))),
    unit: str(a.unit, TRAITS[trait].units[0]), type: types.includes(a.type) ? a.type : TRAITS[trait].types[0], trait,
    color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : COLOURS[0].hex, emblem: EMBLEM_IDS.includes(a.emblem) ? a.emblem : 'star',
    victories: Math.max(0, Math.floor(num(a.victories, 20))), status: a.status === 'injured' || a.status === 'dead' ? a.status : 'active',
    returnAt: num(a.returnAt, 0), recovered: !!a.recovered, scars: Math.max(0, Math.min(MAX_SCARS, num(a.scars, 0))),
    grudge: Math.max(0, Math.min(MAX_GRUDGE, num(a.grudge, 0))), joined: num(a.joined, 0), promotedFrom: str(a.promotedFrom, ''),
    history: Array.isArray(a.history) ? a.history.map(cleanEnc).filter((e: Encounter | null): e is Encounter => !!e).slice(-HISTORY_KEEP) : [],
  };
}

export function sanitizeNemesis(raw: unknown): NemesisState | null {
  if (!raw || typeof raw !== 'object' || (raw as any).v !== 1) return null;
  const r = raw as any;
  const st = emptyNemesis();
  st.seq = Math.max(0, Math.floor(num(r.seq, 0)));
  st.missions = Math.max(0, Math.floor(num(r.missions, 0)));
  st.kills = Math.max(0, Math.floor(num(r.kills, 0)));
  const seen = new Set<string>();
  const list = (v: unknown) => (Array.isArray(v) ? v.map(cleanAce).filter((a): a is AceRecord => !!a && !seen.has(a.id) && !!seen.add(a.id)) : []);
  st.aces = list(r.aces).filter((a) => a.status !== 'dead').slice(0, ROSTER_SIZE);
  st.fallen = list(r.fallen).map((a) => ({ ...a, status: 'dead' as const })).slice(0, FALLEN_KEEP);
  // ids must stay unique as new aces are numbered
  for (const a of [...st.aces, ...st.fallen]) { const n = Number(a.id.slice(1)); if (Number.isFinite(n)) st.seq = Math.max(st.seq, n); }
  const l = r.last;
  if (l && typeof l === 'object' && Array.isArray(l.items)) {
    const items: ReportItem[] = [];
    for (const it of l.items) {
      const enc = cleanEnc(it?.enc);
      if (!enc || typeof it.id !== 'string' || !it.ace) continue;
      const s = (x: any): AceSnap => ({ first: str(x?.first, ''), last: str(x?.last, ''), rank: Math.max(0, Math.min(ACE_RANKS.length - 1, num(x?.rank, 0))), unit: str(x?.unit, ''), victories: Math.max(0, num(x?.victories, 0)) });
      items.push({ id: it.id, ace: s(it.ace), enc, ...(it.replacement ? { replacement: s(it.replacement) } : {}) });
    }
    st.last = { n: num(l.n, 0), mission: str(l.mission, ''), place: str(l.place, 'the Reich'), campaign: !!l.campaign, items };
  }
  return st;
}

export function loadNemesis(rng: Rng = Math.random): NemesisState {
  let st: NemesisState | null = null;
  try { st = typeof localStorage === 'undefined' ? null : sanitizeNemesis(JSON.parse(localStorage.getItem(NEMESIS_KEY) ?? 'null')); } catch { st = null; }
  st ??= emptyNemesis();
  ensureRoster(st, rng);
  return st;
}

export function saveNemesis(st: NemesisState) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(NEMESIS_KEY, JSON.stringify(st)); } catch { /* storage unavailable */ }
}

// ---------------- display text (localised) ----------------
// Names, ranks, units, places and traits are translated word by word through the phrase
// tables (i18n/ar/nemesis.ts); sentences are templates with {name} etc. filled with those.

export const rankShort = (r: number) => tx(ACE_RANKS[Math.max(0, Math.min(ACE_RANKS.length - 1, r))].short);
export const rankName = (r: number) => tx(ACE_RANKS[Math.max(0, Math.min(ACE_RANKS.length - 1, r))].name);
export const personName = (a: { first: string; last: string }) => `${tx(a.first)} ${tx(a.last)}`;
export const aceName = (a: { first: string; last: string; rank: number }) => `${rankShort(a.rank)} ${personName(a)}`;
// 'Hauptmann Heinz Dorn'; Arabic puts the definite rank before the name ('النقيب هاينتس دورن')
export const fullRankName = (a: { first: string; last: string; rank: number }) => (isAr() ? aceName(a) : `${rankName(a.rank)} ${personName(a)}`);
export const unitLabel = (u: string) => tx(u);
export const traitLabel = (t: Trait) => tx(TRAITS[t].label);
export const placeLabel = (p: string) => tx(p);
const listSep = () => (isAr() ? '، ' : ', ');
const crewList = (names: string[]) => names.map((n) => tx(n)).join(listSep());

// One line per meeting, for the dossier history
export function encounterText(e: Encounter): string {
  const place = placeLabel(e.place);
  const parts: string[] = [];
  if (e.fate === 'down') parts.push(e.byPlayer ? tx('Over {place}: you shot him down.', { place }) : tx('Over {place}: shot down by the formation.', { place }));
  else if (e.fate === 'bailed') parts.push(e.byPlayer ? tx('Over {place}: you shot him down, but he bailed out.', { place }) : tx('Over {place}: shot down, but he bailed out.', { place }));
  else if (e.fate === 'escaped') parts.push(tx('Over {place}: badly shot up, he escaped.', { place }));
  else parts.push(tx('Over {place}: he broke off and went home.', { place }));
  if (e.wounded.length) parts.push(tx('He wounded {crew}.', { crew: crewList(e.wounded) }));
  if (e.downedUs) parts.push(e.role === 'pilot' ? tx('He shot you down.') : tx('He shot down your bomber.'));
  const others = e.downed - (e.downedUs ? 1 : 0);
  if (others > 0) parts.push(others === 1 ? tx('He claimed one of ours.') : tx('He claimed {n} of ours.', { n: others }));
  if (!e.wounded.length && !e.downedUs && e.hits >= HIT_CLAIM) parts.push(tx('He shot up your aircraft.'));
  if (e.promotedTo !== undefined) parts.push(tx('Promoted to {rank}.', { rank: rankName(e.promotedTo) }));
  if (e.payout) parts.push(tx('+{n} merit.', { n: e.payout }));
  return parts.join(' ');
}

// Debrief / campaign intelligence report lines for one meeting
export function reportLines(it: ReportItem): string[] {
  const e = it.enc, name = aceName(it.ace);
  const out: string[] = [];
  if (e.fate === 'down') out.push(e.byPlayer ? tx('{name} — shot down by you. +{n} merit.', { name, n: e.payout ?? 0 }) : tx('{name} — shot down by the formation.', { name }));
  else if (e.fate === 'bailed') out.push(e.byPlayer ? tx('{name} — shot down by you, +{n} merit. He bailed out and will be back.', { name, n: e.payout ?? 0 }) : tx('{name} — shot down. He bailed out and will be back.', { name }));
  else if (e.fate === 'escaped') out.push(tx('{name} — escaped badly damaged. He will return with a grudge.', { name }));
  else out.push(tx('{name} — broke off and went home.', { name }));
  if (e.wounded.length) out.push(tx('{name} wounded {crew}.', { name, crew: crewList(e.wounded) }));
  if (e.downedUs) out.push(e.role === 'pilot' ? tx('{name} shot you down.', { name }) : tx('{name} shot down your bomber.', { name }));
  if (e.gained > 0 && e.fate !== 'down') out.push(tx('{name} now claims {n} victories.', { name, n: it.ace.victories }));
  if (e.promotedTo !== undefined) out.push(tx('{name} has been promoted to {rank}.', { name: personName(it.ace), rank: rankName(e.promotedTo) }));
  if (it.replacement) out.push(tx('{name} of {unit} is promoted from the ranks to take his place.', { name: aceName(it.replacement), unit: unitLabel(it.replacement.unit) }));
  return out;
}

// What the crew remembers about him (HUD dossier card); '' for a first meeting
export function memoryText(a: AceRecord): string {
  const h = a.history;
  for (let i = h.length - 1; i >= 0; i--) {
    const e = h[i], place = placeLabel(e.place);
    if (e.wounded.length) return tx('Wounded {crew} over {place}', { crew: crewList(e.wounded), place });
    if (e.downedUs) return tx('Shot us down over {place}', { place });
  }
  const e = h[h.length - 1];
  if (!e) return '';
  const place = placeLabel(e.place);
  if (a.recovered) return tx('Bailed out over {place}, back from hospital', { place });
  if (e.fate === 'escaped') return tx('Escaped us damaged over {place}', { place });
  return tx('Met over {place}', { place });
}
