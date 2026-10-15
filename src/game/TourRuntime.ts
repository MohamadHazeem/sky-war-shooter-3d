// The Tour in a mission (Tour.ts holds the rules): the carried damage and the repair patches on
// the player's Fortress, who of the tour's crew flies, crew effectiveness from morale and
// fatigue, the wounds taken, and the outcome booked on the debrief.
//
// Game hooks (MissionFlow): beforeCrew(m) before crewRoster.beginMission, start() after it,
// capture() before crewRoster.endMission and debrief(...) at the end of showDebrief.
import type { Game } from './Game';
import type { Mission } from './Missions';
import { CREW, crewMember, type CrewId } from '../world/Crew';
import { crewRoster, ROOKIES } from './CrewRoster';
import { RepairPatches } from './RepairPatches';
import {
  applySortie, crewFactor, effectiveDanger, flyingAt, isTourId, loadTour, manName, parseTourId, POSITIONS, saveTour, SCHEDULE, startHealth,
  type Danger, type SortieOutcome, type TourReport, type TourState,
} from './Tour';

interface Flight { state: TourState; stage: number; opt: number; danger: Danger; title: string }

export class TourRuntime {
  private flight: Flight | null = null;
  private wounded = new Set<CrewId>();
  private serious = new Set<CrewId>();
  private outcome: Pick<SortieOutcome, 'zones' | 'shipLost' | 'ditched' | 'escaped'> | null = null;
  readonly patches = new RepairPatches();

  constructor(private g: Game) {}

  /** The tour flight in progress (null outside tour missions). */
  get active() { return this.flight; }

  /** MissionFlow.startMission, before crewRoster.beginMission: is this the tour's current mission? */
  beforeCrew(m: Mission) {
    this.flight = null; this.outcome = null;
    this.wounded.clear(); this.serious.clear();
    crewRoster.tourOut = null;
    const at = isTourId(m.id) ? parseTourId(m.id) : null;
    const s = at ? loadTour() : null;
    if (!at || !s || s.complete || s.event || at.stage !== s.done) return;   // replays fly as written
    const o = SCHEDULE[at.stage].options[at.opt];
    if (!o) return;
    this.flight = { state: s, stage: at.stage, opt: at.opt, danger: effectiveDanger(at.stage, o, s.maxEffort), title: o.title };
    crewRoster.tourOut = (id) => {
      const man = s.crew.find((c) => c.key === id);
      return !man ? 'gone' : man.status === 'fit' ? false : 'rest';
    };
  }

  /** After crewRoster.beginMission: the ship's carried damage, patches, names and crew factor. */
  start() {
    const f = this.flight, g = this.g;
    const pb = g.world.playerBomber;
    if (!f || !pb) { this.patches.attach(null); return; }
    const s = f.state;
    for (const z of pb.zones) z.hp = z.maxHp * startHealth(z.name, s.ship.wear[z.name] ?? 0);
    const seed = parseInt(s.ship.serial.replace(/\D/g, ''), 10) || s.seed;
    this.patches.set(s.ship.patches, seed);
    this.patches.attach(g.gunner.waist);
    this.patches.setOutside(pb.root, pb.model, s.ship.patches, seed);
    // the radio names whoever actually sits at each position (tour replacements, spares)
    for (const pos of POSITIONS) {
      if (crewRoster.occupant(pos)) continue;
      const man = flyingAt(s, pos);
      crewMember(pos).name = man ? manName(man) : ROOKIES[pos].call;
    }
    g.world.aiGunnerFactor *= crewFactor(s);
    const crew = g.world.crew, prev = crew.onWound;
    crew.onWound = (c) => {
      this.wounded.add(c);
      prev?.(c);   // the roster rolls how bad it is for its own men; a stand-in rolls the same odds here
      const id = crewRoster.occupant(c);
      if (id ? crewRoster.serious.has(id) : Math.random() < 0.25) this.serious.add(c);
    };
  }

  /** Top of showDebrief, before crewRoster.endMission clears the mission's crew state. */
  capture() {
    const f = this.flight, g = this.g;
    if (!f) return;
    const pb = g.world.playerBomber;
    const ditched = !!g.ditching.ditched;
    const lost = ditched || !pb || !pb.alive;
    const zones: Record<string, number> = {};
    if (pb) for (const z of pb.zones) zones[z.name] = Math.max(0, z.hp) / z.maxHp;
    const esc = g.b17Damage.escape;
    const escaped = esc.length ? CREW.filter((_, i) => esc[i]?.escaped).map((c) => c.id) : undefined;
    this.outcome = { zones, shipLost: lost, ditched, escaped };
  }

  /** End of showDebrief: book the sortie on the tour. Returns the report, or null outside the tour. */
  debrief(m: Mission, success: boolean, kills: number, merit: number): { state: TourState; report: TourReport } | null {
    const f = this.flight;
    this.flight = null;
    this.patches.attach(null);
    if (!f || !isTourId(m.id)) return null;
    if (!this.outcome) this.capture();
    const o = this.outcome!;
    const fresh = loadTour();
    if (!fresh || fresh.done !== f.stage || fresh.complete) return null;   // booked elsewhere meanwhile
    const maxEffort = fresh.maxEffort;
    const res = applySortie(fresh, {
      success, kills, shipLost: !!o.shipLost, ditched: o.ditched, escaped: o.escaped, zones: o.shipLost ? undefined : o.zones,
      wounded: [...this.wounded], serious: [...this.serious], danger: f.danger, title: f.title,
    });
    if (maxEffort && success && merit > 0) {
      const bonus = Math.round(merit * 0.5);
      this.g.prog.earn(bonus);
      res.report.lines.splice(1, 0, { text: 'Maximum effort: +{n} merit.', vars: { n: bonus }, tone: 'good' });
    }
    saveTour(res.state);
    return res;
  }
}
