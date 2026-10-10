import { STATION_ORDER, StationDef, StationId } from '../world/B17Layout';

// Per-mission combat record for the debrief: the things rounds fired and hits alone don't say.
// Fed from Game's kill event; rounds fired and hits come from world.stats.
export class CombatTally {
  bestStreak = 0;
  closestKill = Infinity; // metres from the player's aircraft when the kill was confirmed
  private gunKills = new Map<StationId, { label: string; kills: number }>();

  reset() {
    this.bestStreak = 0;
    this.closestKill = Infinity;
    this.gunKills.clear();
  }

  // gun: the gun position that was firing (gunner missions), null when flying the P-51
  recordKill(streak: number, distance: number, gun: StationDef | null) {
    if (streak > this.bestStreak) this.bestStreak = streak;
    if (distance < this.closestKill) this.closestKill = distance;
    if (gun) {
      const e = this.gunKills.get(gun.id) ?? { label: gun.label, kills: 0 };
      e.kills++;
      this.gunKills.set(gun.id, e);
    }
  }

  // Kills per gun position in crew order, only the positions that scored
  killsByGun(): { label: string; kills: number }[] {
    const out: { label: string; kills: number }[] = [];
    for (const id of STATION_ORDER) {
      const e = this.gunKills.get(id);
      if (e) out.push({ label: e.label, kills: e.kills });
    }
    return out;
  }
}
