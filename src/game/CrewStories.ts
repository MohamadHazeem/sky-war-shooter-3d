// Crew stories and morale (Phase 11 goal 11): the ten men of the Sky Queen as people, not only
// gun skills. Pure data and logic (type-only imports), unit-tested in Node.
//
// - Traits: two per man, each with a small mechanical lean (losses hit a worrier harder, a
//   cheerful man bounces back, a superstitious man cares more about his ritual, a tough one
//   tires more slowly). Text in PERSONA, numbers in LEAN.
// - Morale 0-100 and fatigue 0-100 per man. Inside the normal band they change nothing; high
//   morale lifts a man's role skills up to +6%, low morale or exhaustion drags them down
//   (performanceMult, read by CrewRoster.roleStat, so AI gunnery, spotting, repairs, first aid
//   and the pilots' nerve all follow it).
// - Bonds: friendships and friction between pairs (-100..100). Flying together through a good
//   mission brings men closer; a bad one sharpens old friction; a wounded or lost friend hurts.
// - Letters from home arrive between missions; the player can help one man write back per
//   break (a morale lift; bad news needs the reply most).
// - Rituals and superstitions: rolled at take-off. A broken ritual unsettles the man for that
//   mission (a superstitious man more so).
// - Reactions to losses: a crewman killed, heavy group losses, a wounded friend.
// - A 48-hour pass every five missions: everyone rests.
// - Journal: the latest happenings for the hangar, and short written vignettes for the crew room.
//
// Game hooks: CrewRoster.beginMission -> beginSortie, CrewRoster.finish -> endSortie,
// CrewRoster.roleStat -> performanceMult. UI: ui/CrewStoriesPanel.ts, ui/CrewRoomScene.ts.
import type { ManId } from './CrewRoster';

export const STORY_MEN: ManId[] = ['brenner', 'doyle', 'stern', 'kessler', 'mendez', 'gallo', 'reilly', 'price', 'walsh', 'dawson'];
// English surnames for the texts (the phrase tables translate them; kept here so this file needs no roster import)
export const SURNAME: Record<ManId, string> = {
  brenner: 'Brenner', doyle: 'Doyle', stern: 'Stern', kessler: 'Kessler', mendez: 'Mendez',
  gallo: 'Gallo', reilly: 'Reilly', price: 'Price', walsh: 'Walsh', dawson: 'Dawson',
};

// ---------------- personalities ----------------

export type Trait = 'Calm' | 'Protective' | 'Joker' | 'Sentimental' | 'Precise' | 'Worrier' | 'Proud' | 'Superstitious'
  | 'Practical' | 'Devout' | 'Talkative' | 'Loyal' | 'Cocky' | 'Daring' | 'Laconic' | 'Stubborn' | 'Cheerful' | 'Lucky' | 'Quiet' | 'Tough';

/** What a trait does, in one line (shown under the trait). */
export const TRAIT_HELP: Record<Trait, string> = {
  Calm: 'Losses shake him less.',
  Protective: 'Takes a wounded crewmate hard.',
  Joker: 'Lifts the hut when spirits are low.',
  Sentimental: 'Letters from home mean the world to him.',
  Precise: 'A broken ritual barely bothers him.',
  Worrier: 'Losses weigh on him longer.',
  Proud: 'Good missions lift him higher.',
  Superstitious: 'A broken ritual rattles him.',
  Practical: 'Tires a little more slowly.',
  Devout: 'Finds his feet again after losses.',
  Talkative: 'Makes friends quickly.',
  Loyal: 'Takes a wounded crewmate hard.',
  Cocky: 'Good missions lift him higher.',
  Daring: 'Losses shake him less.',
  Laconic: 'Slow to make friends, slow to fall out.',
  Stubborn: 'Holds a grudge.',
  Cheerful: 'Bounces back quickly.',
  Lucky: 'A broken ritual rattles him.',
  Quiet: 'Tires a little more slowly.',
  Tough: 'Tires a little more slowly.',
};

interface Lean { loss: number; cheer: number; faith: number; stamina: number; letters: number; bond: number; grudge: number; pride: number; care: number }
const N: Lean = { loss: 1, cheer: 0, faith: 1, stamina: 1, letters: 1, bond: 1, grudge: 1, pride: 1, care: 1 };
const TRAIT_LEAN: Record<Trait, Partial<Lean>> = {
  Calm: { loss: 0.7 }, Daring: { loss: 0.75 }, Worrier: { loss: 1.4 }, Devout: { cheer: 1 },
  Protective: { care: 1.5 }, Loyal: { care: 1.4 }, Joker: { cheer: 1.5 }, Cheerful: { cheer: 2 },
  Sentimental: { letters: 1.5 }, Precise: { faith: 0.5 }, Superstitious: { faith: 2 }, Lucky: { faith: 1.6 },
  Proud: { pride: 1.4 }, Cocky: { pride: 1.5 }, Practical: { stamina: 0.85 }, Quiet: { stamina: 0.9 }, Tough: { stamina: 0.8 },
  Talkative: { bond: 1.4 }, Laconic: { bond: 0.7, grudge: 0.7 }, Stubborn: { grudge: 1.6 },
};

export interface Persona {
  traits: [Trait, Trait];
  ritual: string;          // what he does before every mission
  broken: string;          // journal line when the ritual goes wrong ({who})
  family: string[];        // who writes to him
}

export const PERSONA: Record<ManId, Persona> = {
  brenner: { traits: ['Calm', 'Protective'], ritual: 'Pats the Sky Queen\'s nose before he climbs aboard.',
    broken: 'The truck was late and {who} never got to pat the Sky Queen\'s nose. He flew the whole mission with his jaw set.', family: ['his wife, Ruth', 'his father'] },
  doyle: { traits: ['Joker', 'Sentimental'], ritual: 'Hums the same four bars on the take-off roll.',
    broken: '{who} lost the tune on the take-off roll and couldn\'t find it again all day.', family: ['his sister, Maureen', 'his mother'] },
  stern: { traits: ['Precise', 'Worrier'], ritual: 'Sharpens exactly three pencils for the nav table.',
    broken: 'One of {who}\'s three pencils snapped over the Channel. He did the arithmetic with two and didn\'t like it.', family: ['his mother', 'his old headmaster'] },
  kessler: { traits: ['Proud', 'Superstitious'], ritual: 'Wears the same pair of socks every mission.',
    broken: '{who} couldn\'t find his socks this morning. He flew in a borrowed pair and talked about nothing else.', family: ['his girl, Betty', 'his brother'] },
  mendez: { traits: ['Practical', 'Devout'], ritual: 'Kisses his Saint Christopher medal at the hatch.',
    broken: 'The chain on {who}\'s Saint Christopher broke at the hatch. He flew with the medal in his glove.', family: ['his mother', 'his father'] },
  gallo: { traits: ['Talkative', 'Loyal'], ritual: 'Tunes the set to one dance tune before engine start.',
    broken: 'Static on every band before engine start. {who} never got his song and sulked to the target.', family: ['his mother', 'his kid brother, Sal'] },
  reilly: { traits: ['Cocky', 'Daring'], ritual: 'Climbs into the ball left foot first.',
    broken: '{who} went into the ball right foot first. He climbed back out and did it again, but the damage was done.', family: ['his girl, Peggy', 'his grandmother'] },
  price: { traits: ['Laconic', 'Stubborn'], ritual: 'Chews one stick of gum from take-off to the English coast.',
    broken: '{who} ran out of gum. He says it\'s nothing. He hasn\'t said much else.', family: ['his father', 'the foreman at the ranch'] },
  walsh: { traits: ['Cheerful', 'Lucky'], ritual: 'Keeps a rabbit\'s foot in his flak vest.',
    broken: '{who} left the rabbit\'s foot on his bunk. He went white when he noticed at altitude.', family: ['his mother', 'his girl, Annie'] },
  dawson: { traits: ['Quiet', 'Tough'], ritual: 'Carries a photograph of the farm in his breast pocket.',
    broken: '{who} put the farm photograph in the wrong pocket and spent the whole mission patting his jacket.', family: ['his father', 'his little sister, June'] },
};

const LEANS = {} as Record<ManId, Lean>;
for (const id of STORY_MEN) {
  const l = { ...N };
  for (const t of PERSONA[id].traits) for (const [k, v] of Object.entries(TRAIT_LEAN[t]) as [keyof Lean, number][]) l[k] = k === 'cheer' ? l[k] + v : l[k] * v;
  LEANS[id] = l;
}
export const lean = (id: ManId): Readonly<Lean> => LEANS[id];

// ---------------- bonds ----------------

export type PairKey = `${ManId}|${ManId}`;
export const pairKey = (a: ManId, b: ManId): PairKey => (STORY_MEN.indexOf(a) < STORY_MEN.indexOf(b) ? `${a}|${b}` : `${b}|${a}`);
export const pairOf = (k: PairKey) => k.split('|') as [ManId, ManId];

/** Where each relationship starts, and why. */
export const BONDS: { a: ManId; b: ManId; v: number; why: string }[] = [
  { a: 'brenner', b: 'doyle', v: 60, why: 'Trained together in Texas. Finish each other\'s checklists.' },
  { a: 'price', b: 'walsh', v: 55, why: 'Back to back at the waist guns every mission.' },
  { a: 'gallo', b: 'reilly', v: 45, why: 'Two city boys who share every parcel from home.' },
  { a: 'reilly', b: 'dawson', v: 35, why: 'The two loneliest seats in the ship. They talk on the interphone.' },
  { a: 'mendez', b: 'gallo', v: 30, why: 'Mendez fixes the set, Gallo fixes Mendez\'s letters.' },
  { a: 'walsh', b: 'dawson', v: 25, why: 'Card partners. They never win.' },
  { a: 'doyle', b: 'stern', v: 20, why: 'Doyle sings, Stern pretends to mind.' },
  { a: 'stern', b: 'kessler', v: -25, why: 'They argue about every initial point.' },
  { a: 'price', b: 'gallo', v: -30, why: 'Gallo never stops talking. Price never starts.' },
  { a: 'kessler', b: 'mendez', v: -15, why: 'Mendez thinks the bomb run is four minutes too long.' },
];
export const BOND_WHY: Partial<Record<PairKey, string>> = Object.fromEntries(BONDS.map((b) => [pairKey(b.a, b.b), b.why]));

export const FRIENDS = 40, RIVALS = -20;
export function bondLabel(v: number): string {
  return v >= 70 ? 'Like brothers' : v >= FRIENDS ? 'Friends' : v > RIVALS ? 'Getting along' : v > -50 ? 'Friction' : 'At odds';
}

// ---------------- letters ----------------

export interface LetterDef { text: string; bad?: boolean }
/** Letter texts: {from} is the sender (PERSONA.family). Bad news needs a reply most. */
export const LETTERS: LetterDef[] = [
  { text: 'A letter from {from}: the whole street asks after him.' },
  { text: 'A letter from {from} with a photograph and a pressed flower.' },
  { text: 'A parcel from {from}: socks, cigarettes and a fruitcake.' },
  { text: 'A letter from {from}: the harvest came in early this year.' },
  { text: 'A letter from {from}: they listen to every news bulletin about the bombers.' },
  { text: 'A letter from {from}, three weeks late and read until it tore.' },
  { text: 'Bad news from {from}: someone at home is ill.', bad: true },
  { text: 'A short letter from {from}. Something is wrong at home, and it doesn\'t say what.', bad: true },
];

// ---------------- crew-room vignettes ----------------

/** Written vignettes for the crew room: chosen from the crew's state ({a}, {b}, {from}). */
export const VIGNETTE_TEXT = {
  letter: '{a} reads a letter from {from} by the stove, twice, then folds it into his jacket.',
  badLetter: '{a} has been sitting on his bunk with the same letter for an hour. Nobody asks.',
  friends: '{a} and {b} split a parcel from home without saying a word about it.',
  friction: '{a} and {b} sit at opposite ends of the hut tonight.',
  madeUp: '{a} and {b} share a cigarette by the door. Whatever it was between them, it\'s over.',
  tired: '{a} fell asleep in his flying boots before the lights went out.',
  high: '{a} is teaching the hut a card trick nobody can work out.',
  low: '{a} stares at the stove and doesn\'t touch his supper.',
  memorial: 'Nobody has moved {a}\'s things from his bunk. {b} won\'t let them.',
  ritual: '{a} is already laying out tomorrow\'s ritual on his blanket, just so.',
} as const;
export type VignetteKind = keyof typeof VIGNETTE_TEXT;

// ---------------- journal texts ----------------

export const JOURNAL_TEXT = {
  wounded: '{b} hasn\'t left {a}\'s side since they carried him off the ship.',
  killed: '{b} sat on {a}\'s empty bunk for an hour and didn\'t say a word.',
  killedAll: 'The hut is quiet tonight. Everyone is thinking about {a}.',
  heavy: '{n} ships lost today. {a} keeps counting the empty bunks across the field.',
  pass: 'A 48-hour pass. The crew scatters to London and the village pub, and comes back rested.',
  closer: '{a} and {b} have been through it together now. They\'re closer for it.',
  falling: '{a} and {b} had words after the mission. The hut took sides.',
  madeUp: '{a} and {b} have patched things up.',
  exhausted: '{a} is running on nothing. The flight surgeon has his eye on him.',
  shaken: '{a} is badly shaken. He needs a good mission, or a letter from home.',
  reply: '{a} wrote back to {from}, with your help. He seems lighter for it.',
} as const;

export type EntryKind = 'letter' | 'ritual' | 'bond' | 'loss' | 'pass' | 'mood' | 'reply';
export interface Entry { n: number; kind: EntryKind; text: string; vars?: Record<string, string | number> }
export interface Letter { id: number; man: ManId; from: string; text: string; bad: boolean; n: number; replied: boolean }

// ---------------- morale, fatigue, performance ----------------

export const MORALE_START = 60, MORALE_HIGH = 75, MORALE_LOW = 40;
export const FATIGUE_EFFECT = 50;
export const PASS_EVERY = 5;
export const REPLY_MORALE = 8, REPLY_MORALE_BAD = 12;

/**
 * Skill multiplier from morale and fatigue: exactly 1 inside the normal band (morale 40-75,
 * fatigue up to 50); up to +6% in high spirits; down to -15% shaken and -12% exhausted.
 */
export function performanceMult(morale: number, fatigue: number): number {
  const m = Math.max(0, Math.min(100, morale)), f = Math.max(0, Math.min(100, fatigue));
  let k = 1;
  if (m > MORALE_HIGH) k += ((m - MORALE_HIGH) / (100 - MORALE_HIGH)) * 0.06;
  else if (m < MORALE_LOW) k -= ((MORALE_LOW - m) / MORALE_LOW) * 0.15;
  if (f > FATIGUE_EFFECT) k -= ((f - FATIGUE_EFFECT) / (100 - FATIGUE_EFFECT)) * 0.12;
  return k;
}

export function moraleLabel(m: number): string { return m >= MORALE_HIGH ? 'High spirits' : m >= MORALE_LOW ? 'Holding up' : m >= 20 ? 'Low' : 'Shaken'; }
export function fatigueLabel(f: number): string { return f < 25 ? 'Fresh' : f < FATIGUE_EFFECT ? 'Tired' : f < 75 ? 'Weary' : 'Exhausted'; }

// ---------------- state ----------------

export interface ManMood { morale: number; fatigue: number; ritualBroken: boolean }
export interface Sortie {
  success: boolean;
  flew: ManId[];                         // men aboard (rookies left out)
  wounded: ManId[];                      // hit this mission
  killed: ManId[];                       // lost for good this mission
  kills: Partial<Record<ManId, number>>; // kills at each man's gun
  lost: number;                          // bombers lost from the formation
}

interface Saved {
  v: 1; n: number; replyAt: number; nextLetter: number;
  men: Partial<Record<ManId, Partial<ManMood>>>;
  bonds: Partial<Record<PairKey, number>>;
  letters: Letter[]; journal: Entry[]; dead: ManId[];
}

export const STORE_KEY = 'sws3d.crewstories.v1';
const JOURNAL_MAX = 14;
const LETTER_KEEP = 3;            // unanswered letters fade after this many missions
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isMan = (v: unknown): v is ManId => typeof v === 'string' && (STORY_MEN as string[]).includes(v);

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const defaultStore = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export class CrewStories {
  n = 0;                                   // missions the crew has flown together (completed gunner sorties)
  men = {} as Record<ManId, ManMood>;
  bonds = {} as Record<PairKey, number>;
  letters: Letter[] = [];
  journal: Entry[] = [];
  dead = new Set<ManId>();
  /** The break number in which the one reply was already written (one per break). */
  replyAt = -1;
  private nextLetter = 1;
  private listeners: (() => void)[] = [];

  constructor(private rng: () => number = Math.random, private store: Store | null = defaultStore()) {
    this.reset();
    this.load();
  }

  reset() {
    this.n = 0; this.replyAt = -1; this.nextLetter = 1;
    for (const id of STORY_MEN) this.men[id] = { morale: MORALE_START, fatigue: 0, ritualBroken: false };
    this.bonds = {} as Record<PairKey, number>;
    for (const b of BONDS) this.bonds[pairKey(b.a, b.b)] = b.v;
    this.letters = []; this.journal = []; this.dead.clear();
  }

  private load() {
    try {
      const s = JSON.parse(this.store?.getItem(STORE_KEY) ?? 'null') as Saved | null;
      if (!s || typeof s !== 'object' || s.v !== 1) return;
      this.n = Math.max(0, Math.floor(num(s.n, 0)));
      this.replyAt = Math.floor(num(s.replyAt, -1));
      this.nextLetter = Math.max(1, Math.floor(num(s.nextLetter, 1)));
      for (const id of STORY_MEN) {
        const v = s.men?.[id];
        if (v) this.men[id] = { morale: clamp(num(v.morale, MORALE_START)), fatigue: clamp(num(v.fatigue, 0)), ritualBroken: false };
      }
      for (const [k, v] of Object.entries(s.bonds ?? {})) {
        const [a, b] = k.split('|');
        if (isMan(a) && isMan(b) && a !== b) this.bonds[pairKey(a, b)] = clamp(num(v, 0), -100, 100);
      }
      if (Array.isArray(s.letters)) this.letters = s.letters.filter((l) => l && isMan(l.man) && typeof l.text === 'string').slice(-12);
      if (Array.isArray(s.journal)) this.journal = s.journal.filter((e) => e && typeof e.text === 'string').slice(0, JOURNAL_MAX);
      if (Array.isArray(s.dead)) for (const id of s.dead) if (isMan(id)) this.dead.add(id);
    } catch { /* storage unavailable or corrupt: defaults */ }
  }

  save() {
    try {
      this.store?.setItem(STORE_KEY, JSON.stringify({
        v: 1, n: this.n, replyAt: this.replyAt, nextLetter: this.nextLetter,
        men: this.men, bonds: this.bonds, letters: this.letters, journal: this.journal, dead: [...this.dead],
      } satisfies Saved));
    } catch { /* */ }
  }

  on(f: () => void) { this.listeners.push(f); }
  private emit() { for (const f of this.listeners) f(); }

  // ---------- queries ----------
  morale(id: ManId) { return this.men[id].morale; }
  fatigue(id: ManId) { return this.men[id].fatigue; }
  /** CrewRoster.roleStat hook: 1 in the normal band. */
  mult(id: ManId) { const m = this.men[id]; return m ? performanceMult(m.morale, m.fatigue) : 1; }
  bond(a: ManId, b: ManId) { return a === b ? 0 : this.bonds[pairKey(a, b)] ?? 0; }
  /** Friends and friction worth showing (strongest first). */
  notableBonds(): { a: ManId; b: ManId; v: number }[] {
    return (Object.entries(this.bonds) as [PairKey, number][])
      .filter(([, v]) => v >= FRIENDS || v <= RIVALS)
      .map(([k, v]) => { const [a, b] = pairOf(k); return { a, b, v }; })
      .sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  }
  friendsOf(id: ManId) { return STORY_MEN.filter((o) => o !== id && this.bond(id, o) >= FRIENDS); }
  /** Unanswered letters, newest first. */
  inbox() { return this.letters.filter((l) => !l.replied && !this.dead.has(l.man)).sort((a, b) => b.id - a.id); }
  get canReply() { return this.replyAt !== this.n; }

  // ---------- between missions ----------

  /** The player helps a man write back (one reply per break). */
  reply(letterId: number): boolean {
    const l = this.letters.find((x) => x.id === letterId);
    if (!l || l.replied || !this.canReply || this.dead.has(l.man)) return false;
    l.replied = true;
    this.replyAt = this.n;
    const k = lean(l.man).letters;
    this.bump(l.man, (l.bad ? REPLY_MORALE_BAD : REPLY_MORALE) * k);
    this.log('reply', JOURNAL_TEXT.reply, { a: SURNAME[l.man], from: l.from });
    this.save(); this.emit();
    return true;
  }

  // ---------- mission hooks ----------

  /** Take-off (CrewRoster.beginMission): rituals for the men aboard; a broken one unsettles him for this mission. */
  beginSortie(flying: ManId[]) {
    for (const id of STORY_MEN) this.men[id].ritualBroken = false;
    for (const id of flying) {
      if (this.dead.has(id)) continue;
      const faith = lean(id).faith;
      if (this.rng() < 0.07 * faith) {
        this.men[id].ritualBroken = true;
        this.bump(id, -6 * faith);
        this.log('ritual', PERSONA[id].broken, { who: SURNAME[id] });
      }
    }
    this.save(); this.emit();
  }

  /** Landing (CrewRoster.finish, completed gunner missions only). */
  endSortie(s: Sortie) {
    this.n++;
    const flew = new Set(s.flew.filter((id) => !this.dead.has(id)));
    const hurt = new Set(s.wounded);
    const heavy = s.lost >= 3;
    const killed = s.killed.filter((id) => !this.dead.has(id));
    for (const id of killed) this.dead.add(id);
    const alive = STORY_MEN.filter((id) => !this.dead.has(id));

    for (const id of alive) {
      const m = this.men[id], L = lean(id);
      // fatigue: the mission (harder when the group was mauled or he was hit), then the break
      if (flew.has(id)) m.fatigue += (14 + (heavy ? 8 : 0) + (hurt.has(id) ? 6 : 0)) * L.stamina;
      m.fatigue -= flew.has(id) ? 8 : 25;
      // morale: the result, his own guns, his own wound, the group's losses
      if (flew.has(id)) {
        m.morale += s.success ? 5 * L.pride : -7;
        m.morale += Math.min(6, 2 * (s.kills[id] ?? 0)) * L.pride;
      }
      if (hurt.has(id)) m.morale -= 5;
      if (heavy) m.morale -= 6 * L.loss;
      else m.morale -= Math.max(0, s.lost) * 1.5 * L.loss;
      if (m.fatigue > 70) m.morale -= 4;
      m.morale += L.cheer;
      // drift back toward the middle
      m.morale += (MORALE_START - m.morale) * 0.08;
    }

    // a wounded crewmate: his friends feel it
    for (const w of hurt) {
      if (this.dead.has(w)) continue;
      const friend = alive.filter((o) => o !== w && this.bond(w, o) >= FRIENDS).sort((a, b) => this.bond(w, b) - this.bond(w, a))[0];
      for (const o of alive) if (o !== w && this.bond(w, o) >= FRIENDS) this.bump(o, -4 * lean(o).care, false);
      if (friend) { this.log('loss', JOURNAL_TEXT.wounded, { a: SURNAME[w], b: SURNAME[friend] }); this.shift(w, friend, 6); }
    }
    // a man lost for good: everyone, his friends most
    for (const k of killed) {
      for (const o of alive) this.bump(o, (-12 - Math.max(0, this.bond(k, o)) * 0.2) * lean(o).loss, false);
      const friend = alive.filter((o) => this.bond(k, o) > 0).sort((a, b) => this.bond(k, b) - this.bond(k, a))[0];
      this.log('loss', friend ? JOURNAL_TEXT.killed : JOURNAL_TEXT.killedAll, { a: SURNAME[k], ...(friend ? { b: SURNAME[friend] } : {}) });
    }
    if (heavy) {
      const worrier = alive.slice().sort((a, b) => lean(b).loss - lean(a).loss)[0];
      if (worrier) this.log('loss', JOURNAL_TEXT.heavy, { n: s.lost, a: SURNAME[worrier] });
    }

    // bonds: through it together (a good mission) or at each other's throats (a bad one)
    const aboard = alive.filter((id) => flew.has(id));
    for (let i = 0; i < aboard.length; i++) for (let j = i + 1; j < aboard.length; j++) {
      const a = aboard[i], b = aboard[j];
      const before = this.bond(a, b);
      const pace = (lean(a).bond + lean(b).bond) / 2;
      const grudge = before < 0 ? Math.max(lean(a).grudge, lean(b).grudge) : 1;
      if (s.success) this.shift(a, b, (heavy ? 3 : 1.5) * pace / grudge);
      else if (before < 0) this.shift(a, b, -4 * Math.max(lean(a).grudge, lean(b).grudge));
      const after = this.bond(a, b);
      if (before < 0 && after >= 0) this.log('bond', JOURNAL_TEXT.madeUp, { a: SURNAME[a], b: SURNAME[b] });
      else if (before < FRIENDS && after >= FRIENDS) this.log('bond', JOURNAL_TEXT.closer, { a: SURNAME[a], b: SURNAME[b] });
      else if (before > -50 && after <= -50) this.log('bond', JOURNAL_TEXT.falling, { a: SURNAME[a], b: SURNAME[b] });
    }
    // friends aboard together steady each other; friction grates
    for (const a of aboard) {
      let d = 0;
      for (const b of aboard) if (a !== b) { const v = this.bond(a, b); if (v >= 70) d += 1; else if (v <= -50) d -= 1.5; }
      this.bump(a, Math.max(-3, Math.min(2, d)), false);
    }

    // a 48-hour pass every few missions
    if (this.n % PASS_EVERY === 0) {
      for (const id of alive) { this.men[id].fatigue -= 35; this.bump(id, 6, false); }
      this.log('pass', JOURNAL_TEXT.pass);
    }

    // mail call
    for (const l of this.letters) if (!l.replied && this.n - l.n >= LETTER_KEEP) l.replied = true;
    let mail = 0;
    for (const id of alive) {
      if (mail >= 2 || this.rng() >= 0.22) continue;
      const def = LETTERS[Math.floor(this.rng() * LETTERS.length)];
      const fam = PERSONA[id].family;
      const from = fam[Math.floor(this.rng() * fam.length)];
      const L = lean(id);
      this.letters.push({ id: this.nextLetter++, man: id, from, text: def.text, bad: !!def.bad, n: this.n, replied: false });
      this.bump(id, (def.bad ? -10 : 6) * L.letters, false);
      this.log('letter', def.text, { from, who: SURNAME[id] });
      mail++;
    }
    this.letters = this.letters.slice(-12);

    // clamp, then the men who need watching
    for (const id of alive) {
      const m = this.men[id];
      m.fatigue = clamp(m.fatigue); m.morale = clamp(m.morale); m.ritualBroken = false;
    }
    const worn = alive.filter((id) => this.men[id].fatigue >= 75).sort((a, b) => this.men[b].fatigue - this.men[a].fatigue)[0];
    if (worn) this.log('mood', JOURNAL_TEXT.exhausted, { a: SURNAME[worn] });
    const low = alive.filter((id) => this.men[id].morale < 20).sort((a, b) => this.men[a].morale - this.men[b].morale)[0];
    if (low) this.log('mood', JOURNAL_TEXT.shaken, { a: SURNAME[low] });
    this.save(); this.emit();
  }

  // ---------- crew room ----------

  /** Up to `max` short written vignettes for the men in the room, from the crew's current state. */
  vignettes(present: readonly ManId[], max = 2): { kind: VignetteKind; text: string; vars: Record<string, string> }[] {
    const here = present.filter((id) => !this.dead.has(id));
    const out: { kind: VignetteKind; text: string; vars: Record<string, string>; prio: number }[] = [];
    const add = (kind: VignetteKind, prio: number, vars: Record<string, string>) => out.push({ kind, text: VIGNETTE_TEXT[kind], vars, prio });
    const S = (id: ManId) => SURNAME[id];
    // the fallen first
    for (const k of this.dead) {
      const friend = here.filter((o) => this.bond(k, o) > 0).sort((a, b) => this.bond(k, b) - this.bond(k, a))[0];
      if (friend) { add('memorial', 10, { a: S(k), b: S(friend) }); break; }
    }
    // this break's mail
    const mail = this.letters.filter((l) => l.n === this.n && here.includes(l.man)).sort((a, b) => +b.bad - +a.bad)[0];
    if (mail) add(mail.bad ? 'badLetter' : 'letter', mail.bad ? 8 : 6, { a: S(mail.man), from: mail.from });
    // friends and friction (a reconciliation this break comes first)
    const madeUp = this.journal.find((e) => e.n === this.n && e.kind === 'bond' && e.text === JOURNAL_TEXT.madeUp);
    if (madeUp?.vars && here.some((id) => S(id) === madeUp.vars!.a) && here.some((id) => S(id) === madeUp.vars!.b)) add('madeUp', 7, { a: String(madeUp.vars.a), b: String(madeUp.vars.b) });
    const pairs = this.notableBonds().filter((p) => here.includes(p.a) && here.includes(p.b));
    const rival = pairs.find((p) => p.v <= RIVALS);
    const friend = pairs.find((p) => p.v >= FRIENDS);
    if (rival) add('friction', rival.v <= -50 ? 6 : 3, { a: S(rival.a), b: S(rival.b) });
    if (friend) add('friends', 3 + (this.n % 2), { a: S(friend.a), b: S(friend.b) });
    // the men to watch
    const tired = here.slice().sort((a, b) => this.men[b].fatigue - this.men[a].fatigue)[0];
    if (tired && this.men[tired].fatigue >= FATIGUE_EFFECT) add('tired', 5, { a: S(tired) });
    const low = here.slice().sort((a, b) => this.men[a].morale - this.men[b].morale)[0];
    if (low && this.men[low].morale < MORALE_LOW) add('low', 5, { a: S(low) });
    const high = here.slice().sort((a, b) => this.men[b].morale - this.men[a].morale)[0];
    if (high && this.men[high].morale >= MORALE_HIGH) add('high', 4, { a: S(high) });
    const superstitious = here.filter((id) => lean(id).faith > 1.5);
    if (superstitious.length) add('ritual', 1, { a: S(superstitious[this.n % superstitious.length]) });
    // most important first; one line per man where possible
    out.sort((a, b) => b.prio - a.prio);
    const picked: typeof out = [];
    const used = new Set<string>();
    for (const v of out) {
      if (picked.length >= max) break;
      if (used.has(v.vars.a)) continue;
      picked.push(v); used.add(v.vars.a); if (v.vars.b) used.add(v.vars.b);
    }
    for (const v of out) if (picked.length < max && !picked.includes(v)) picked.push(v);
    return picked.map(({ kind, text, vars }) => ({ kind, text, vars }));
  }

  // ---------- internals ----------

  private bump(id: ManId, d: number, clampNow = true) {
    const m = this.men[id];
    if (!m || this.dead.has(id)) return;
    m.morale += d;
    if (clampNow) m.morale = clamp(m.morale);
  }

  private shift(a: ManId, b: ManId, d: number) {
    if (a === b) return;
    const k = pairKey(a, b);
    this.bonds[k] = clamp((this.bonds[k] ?? 0) + d, -100, 100);
  }

  private log(kind: EntryKind, text: string, vars?: Record<string, string | number>) {
    this.journal.unshift({ n: this.n, kind, text, vars });
    if (this.journal.length > JOURNAL_MAX) this.journal.length = JOURNAL_MAX;
  }
}

export const crewStories = new CrewStories();

/** Every English text this module can show (the phrase tables must cover them all). */
export function storyTexts(): string[] {
  const out = new Set<string>();
  for (const id of STORY_MEN) {
    const p = PERSONA[id];
    for (const t of p.traits) { out.add(t); out.add(TRAIT_HELP[t]); }
    out.add(p.ritual); out.add(p.broken); for (const f of p.family) out.add(f);
  }
  for (const b of BONDS) out.add(b.why);
  for (const l of LETTERS) out.add(l.text);
  for (const t of Object.values(VIGNETTE_TEXT)) out.add(t);
  for (const t of Object.values(JOURNAL_TEXT)) out.add(t);
  for (const v of [100, 70, 45, 0, -30, -60]) out.add(bondLabel(v));
  for (const v of [90, 50, 30, 10]) out.add(moraleLabel(v));
  for (const v of [10, 30, 60, 90]) out.add(fatigueLabel(v));
  return [...out];
}

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).swsStories = crewStories;
