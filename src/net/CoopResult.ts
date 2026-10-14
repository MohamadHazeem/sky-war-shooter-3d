import type { DebriefData } from '../ui/UI';

export interface GunnerScore { kills: number; hits: number; shots: number; score: number }
export const emptyGunnerScore = (): GunnerScore => ({ kills: 0, hits: 0, shots: 0, score: 0 });
export function mergeCrew(host: GunnerScore, guest: GunnerScore) {
  return { kills: host.kills + guest.kills, hits: host.hits + guest.hits, shots: host.shots + guest.shots, score: host.score + guest.score };
}

// Personal combat points stay with their gunner. Shared bonuses are split equally; rounding
// assigns the remainder to the guest so the two awards always add up to the crew pool.
export function splitCrewScore(score: number, host: GunnerScore, guest: GunnerScore): [number, number] {
  const shared = Math.max(0, score - host.score - guest.score);
  const h = Math.min(score, Math.round(host.score + shared / 2));
  return [h, score - h];
}
export interface CoopDebrief {
  t: 'debrief'; v: 2; run: number; crew: GunnerScore;
  host: DebriefData; guest: DebriefData;
}
export function buildCoopDebrief(run: number, common: DebriefData, host: GunnerScore, guest: GunnerScore, combatLosses: number, wounded: boolean): CoopDebrief {
  const shares = splitCrewScore(common.score, host, guest);
  const factor = common.success ? 1 : 0.5;
  const hostMerit = Math.round(shares[0] * factor);
  const merit = [hostMerit, Math.round(common.score * factor) - hostMerit];
  const personal = (p: GunnerScore, i: number): DebriefData => {
    const accuracy = p.shots ? Math.min(1, p.hits / p.shots) : 0;
    const medals: string[] = [];
    if (p.kills >= 5) medals.push('Distinguished Flying Cross', 'Ace in a Day');
    if (p.kills >= 8 && combatLosses <= 1) medals.push('Silver Star');
    if (common.success && p.shots >= 150 && accuracy >= 0.25) medals.push("Gunner's Wings");
    if (wounded) medals.push('Purple Heart');
    return { ...common, coop: true, personalScore: shares[i], kills: p.kills, rounds: p.shots, hits: p.hits, accuracy, medals,
      merit: merit[i], nextAvailable: false };
  };
  return { t: 'debrief', v: 2, run, crew: { ...mergeCrew(host, guest), score: common.score }, host: personal(host, 0), guest: personal(guest, 1) };
}

export function isCoopDebrief(x: any): x is CoopDebrief {
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const d = (v: any) => v && v.coop === true && typeof v.success === 'boolean' && typeof v.title === 'string' && typeof v.reason === 'string' &&
    ['kills', 'rounds', 'hits', 'accuracy', 'time', 'score', 'personalScore', 'merit', 'bombersLost', 'bombersTotal', 'waves'].every(k => n(v[k])) &&
    v.accuracy <= 1 && Array.isArray(v.medals) && v.medals.every((m: unknown) => typeof m === 'string');
  return x?.t === 'debrief' && x.v === 2 && Number.isSafeInteger(x.run) && x.run > 0 &&
    x.crew && ['kills', 'hits', 'shots', 'score'].every(k => n(x.crew[k])) && d(x.host) && d(x.guest) && x.host.score === x.guest.score;
}

// Personal combat credit plus an equal share of crew bonuses. Includes departed members so
// reconnects cannot redistribute their earned points to the remaining players.
export function crewDebriefs(run: number, common: DebriefData, members: readonly GunnerScore[], losses: number, wounded: boolean): DebriefData[] {
  const base = members.reduce((sum, p) => sum + p.score, 0);
  const shared = Math.max(0, common.score - base), factor = common.success ? 1 : .5;
  let assigned = 0, points = 0;
  return members.map((p, i) => {
    const share = Math.min(common.score - points, p.score + Math.floor(shared / members.length) + (i < shared % members.length ? 1 : 0));
    points += share;
    const d = buildCoopDebrief(run, common, p, emptyGunnerScore(), losses, wounded).host;
    d.personalScore = share;
    d.merit = i === members.length - 1 ? Math.round(common.score * factor) - assigned : Math.floor(share * factor);
    assigned += d.merit;
    return d;
  });
}
