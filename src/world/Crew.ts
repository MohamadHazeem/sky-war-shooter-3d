import { STATIONS, StationId } from './B17Layout';

// B-17 crew roster for gunner missions: who sits where, and who has been wounded.
// Data and state only; World decides when someone is hit, the HUD draws the list.

export type CrewId = 'pilot' | 'copilot' | 'nav' | 'bombardier' | 'engineer' | 'radio' | 'ball' | 'waistL' | 'waistR' | 'tail';

export interface CrewMember {
  id: CrewId;
  label: string;   // HUD panel label
  speaker: string; // radio speaker
  name: string;    // crewman's name (gun positions reuse the names printed on the stations)
  spot: string;    // where he is, for radio calls
}

// Panel order: forward crew first, then the gun positions
export const CREW: CrewMember[] = [
  { id: 'pilot', label: 'Pilot', speaker: 'Pilot', name: 'Capt. Hal Brenner', spot: 'up front in the cockpit' },
  { id: 'copilot', label: 'Co-Pilot', speaker: 'Co-Pilot', name: 'Lt. Frank Doyle', spot: 'up front in the cockpit' },
  { id: 'nav', label: 'Navigator', speaker: 'Navigator', name: 'Lt. Eli Stern', spot: 'at the nav table' },
  { id: 'bombardier', label: 'Bombardier', speaker: 'Bombardier', name: 'Lt. Ray Kessler', spot: 'in the nose' },
  { id: 'engineer', label: 'Engineer', speaker: 'Engineer', name: STATIONS.top.crew, spot: 'at the top turret' },
  { id: 'radio', label: 'Radio', speaker: 'Radio', name: 'Sgt. Tom Gallo', spot: 'at the radio' },
  { id: 'ball', label: 'Ball', speaker: 'Ball Turret', name: STATIONS.ball.crew, spot: 'in the ball turret' },
  { id: 'waistL', label: 'Waist L', speaker: 'Waist', name: STATIONS.waistL.crew, spot: 'at the left waist gun' },
  { id: 'waistR', label: 'Waist R', speaker: 'Waist', name: STATIONS.waistR.crew, spot: 'at the right waist gun' },
  { id: 'tail', label: 'Tail', speaker: 'Tail', name: STATIONS.tail.crew, spot: 'in the tail' },
];

const BY_ID = new Map<CrewId, CrewMember>(CREW.map((m) => [m.id, m]));
export const crewMember = (id: CrewId): CrewMember => BY_ID.get(id)!;

// The crewman who mans each gun station (the player's own gun is one of these)
export const STATION_CREW: Record<StationId, CrewId> = { waistL: 'waistL', waistR: 'waistR', top: 'engineer', ball: 'ball', tail: 'tail' };

export class Crew {
  private hurt = new Set<CrewId>();
  // Called whenever a crew position is hit (the crew roster tracks who sits there)
  onWound: ((id: CrewId) => void) | null = null;

  // Live set, read by the HUD on each update (no per-frame allocation)
  get wounded(): ReadonlySet<CrewId> { return this.hurt; }
  get woundedCount(): number { return this.hurt.size; }

  reset() { this.hurt.clear(); }

  wound(id: CrewId) { this.hurt.add(id); this.onWound?.(id); }

  transferWound(from: CrewId, to: CrewId) { if (this.hurt.delete(from)) this.hurt.add(to); }

  // A replacement (or a patched-up crewman) is at this position again
  heal(id: CrewId) { this.hurt.delete(id); }

  // Wound a random crewman who is still fit, leaving out `skip` (the player's own position).
  // Returns who was hit, or null when nobody eligible is left.
  woundRandom(skip?: CrewId): CrewMember | null {
    const fit = CREW.filter((m) => m.id !== skip && !this.hurt.has(m.id));
    if (fit.length === 0) return null;
    const m = fit[Math.floor(Math.random() * fit.length)];
    this.hurt.add(m.id);
    this.onWound?.(m.id);
    return m;
  }
}
