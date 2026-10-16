// ShareCardModel: what goes on a share card (ui/ShareCard.ts draws it). Pure, unit-tested in Node.
// Two cards: the mission card at every debrief and the tour card at the Tour's "Going Home" finale.
// Texts are English keys; the drawing side translates them with tx().
import { medalDef } from './Career';

export interface CardTile { label: string; value: string }
export interface CardMedal { name: string; count: number; ribbon: string | null }

export interface CardModel {
  kind: 'mission' | 'tour';
  kicker: string;                  // small line above the title
  title: string;                   // mission title / "Going Home"
  caption: { key: string; vars: Record<string, string> };   // typed on the print: 'B-17G "{ship}" · {date}'
  crew: { name: string; pos: string }[];   // tour card: the men who came home, listed under the print
  stamp: { text: string; good: boolean };
  tiles: CardTile[];               // up to 4
  marks: number;                   // victory marks painted under the tiles (capped)
  extraMarks: number;              // kills beyond the cap ("+12")
  medals: CardMedal[];             // up to MEDALS_MAX, most important first
  moreMedals: number;
  nose: { id: string; name: string } | null;   // the player's B-17 nose art (gunner sorties and the Tour)
}

export const MARKS_MAX = 24;   // two rows of 12 Fw 190 silhouettes on the mission card
export const MEDALS_MAX = 5;

const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const n0 = (v: number) => Math.max(0, Math.round(v || 0)).toLocaleString('en-US');

/** Medals as a list with counts, de-duplicated, known medals (with ribbons) first, then by count. */
export function medalList(medals: string[] | Record<string, number>): { list: CardMedal[]; more: number } {
  const counts = new Map<string, number>();
  if (Array.isArray(medals)) for (const m of medals) counts.set(m, (counts.get(m) ?? 0) + 1);
  else for (const [m, c] of Object.entries(medals)) if (c > 0) counts.set(m, Math.floor(c));
  const all = [...counts].map(([name, count]) => ({ name, count, ribbon: medalDef(name)?.ribbon ?? null }))
    .sort((a, b) => Number(!!b.ribbon) - Number(!!a.ribbon) || b.count - a.count);
  return { list: all.slice(0, MEDALS_MAX), more: Math.max(0, all.length - MEDALS_MAX) };
}

export interface MissionCardInput {
  title: string;
  date: string;               // the mission's historical date line
  role: 'gunner' | 'pilot';
  success: boolean;
  survival?: boolean;
  waves?: number;
  kills: number;
  accuracy: number;           // 0..1
  rounds?: number;
  score: number;
  bombersLost: number;
  bombersTotal: number;
  medals: string[];
  ship: string;               // the player's bomber name
  nose: string;               // nose art id
}

export function missionCard(i: MissionCardInput): CardModel {
  const kills = Math.max(0, Math.round(i.kills || 0));
  const { list, more } = medalList(i.medals);
  const third: CardTile = i.survival
    ? { label: 'ROUNDS SURVIVED', value: n0(i.waves ?? 0) }
    : i.role === 'gunner'
      ? { label: 'BOMBERS HOME', value: `${n0(i.bombersTotal - i.bombersLost)}/${n0(i.bombersTotal)}` }
      : { label: 'BOMBERS LOST', value: n0(i.bombersLost) };
  return {
    kind: 'mission',
    kicker: i.role === 'gunner' ? 'B-17 GUNNER · MISSION REPORT' : 'P-51 ESCORT · MISSION REPORT',
    title: i.title,
    caption: i.role === 'gunner' ? { key: 'B-17G "{ship}" · {date}', vars: { ship: i.ship, date: i.date } } : { key: 'P-51D Mustang · {date}', vars: { date: i.date } },
    crew: [],
    stamp: i.survival ? { text: 'SURVIVAL', good: i.success } : i.success ? { text: 'MISSION COMPLETE', good: true } : { text: 'DID NOT RETURN', good: false },
    tiles: [
      { label: 'KILLS', value: n0(kills) },
      { label: 'ACCURACY', value: (i.rounds ?? 1) > 0 ? pct(i.accuracy) : '—' },
      third,
      { label: 'SCORE', value: n0(i.score) },
    ],
    marks: Math.min(MARKS_MAX, kills), extraMarks: Math.max(0, kills - MARKS_MAX),
    medals: list, moreMedals: more,
    nose: i.role === 'gunner' ? { id: i.nose, name: i.ship } : null,
  };
}

export interface TourCardInput {
  sorties: number;
  kills: number;
  ships: string[];            // every Fortress flown, the last one is the one that came home
  patches: number;
  home: { name: string; pos: string }[];
  fallen: number;
  wounded: number;
  medals: Record<string, number>;
  nose: string;
}

export function tourCard(i: TourCardInput): CardModel {
  const kills = Math.max(0, Math.round(i.kills || 0));
  const { list, more } = medalList(i.medals);
  const ship = i.ships[i.ships.length - 1] ?? 'Sky Queen';
  return {
    kind: 'tour',
    kicker: 'THE TOUR · 25 MISSIONS · LUCKY BASTARD CLUB',
    title: 'Going Home',
    caption: { key: 'B-17G "{ship}" · 401st Bomb Squadron', vars: { ship } },
    crew: i.home.slice(0, 10).map((m) => ({ name: m.name, pos: m.pos })),
    stamp: { text: 'TOUR COMPLETE', good: true },
    tiles: [
      { label: 'SORTIES', value: n0(i.sorties) },
      { label: 'KILLS', value: n0(kills) },
      { label: 'FORTRESSES', value: n0(i.ships.length) },
      { label: 'CREW HOME', value: `${n0(i.home.length)}/${n0(i.home.length + i.fallen + i.wounded)}` },
    ],
    marks: 0, extraMarks: 0,   // the crew roster takes the marks' room; kills are on the tile
    medals: list, moreMedals: more,
    nose: { id: i.nose, name: ship },
  };
}

/** Share text that goes with the image: an English key and its vars (the caller translates it with tx). */
export function cardText(c: CardModel): { key: string; vars: Record<string, string> } {
  const kills = c.tiles.find((t) => t.label === 'KILLS')?.value ?? '0';
  if (c.kind === 'tour') return { key: 'Twenty-five missions and {kills} kills: my crew came home. The Tour in Sky War Shooter 3D', vars: { kills } };
  return { key: c.stamp.good ? 'Came home from \'{title}\' with {kills} kills — Sky War Shooter 3D' : 'Went down over \'{title}\' with {kills} kills — Sky War Shooter 3D', vars: { title: c.title, kills } };
}

export function cardFileName(c: CardModel, now = new Date()): string {
  const slug = c.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'card';
  return `sky-war-shooter-3d-${c.kind}-${slug}-${now.toISOString().slice(0, 10)}.png`;
}
