// The single "threat" value (0..1) that drives the adaptive score (Music.setThreat):
//   ~0.05      nothing in the air (lull, between rounds)
//   0.15-0.45  fighters around, at a distance: tension
//   0.45-0.8   the sky fills, fighters close in: combat
//   >= 0.82    climax: a boss (or ace) in the fight, ON FIRE, or the final wave pressing hard
// Pure: the caller passes the enemies and the player's state, so it is unit-tested in Node.
import { roundDef, type Mission } from '../game/Missions';

export interface V3 { x: number; y: number; z: number }
export interface ThreatEnemy { pos: V3; boss?: boolean; ace?: boolean }
export interface ThreatInput {
  active: boolean;                      // a mission is being played (false: menus, debrief, hangar)
  enemies: readonly ThreatEnemy[];      // enemies pressing the attack
  listener: V3 | null;                  // where the player is
  integrity?: number;                   // player's aircraft 0..1 (1 = undamaged)
  onFire?: boolean;                     // streak ON FIRE
  finalWave?: boolean;                  // the last stretch of the mission
}

// The final stretch of a mission: the second half of a campaign mission's last round, the
// last 40% of a survival round from round 3 on, or the last scripted wave.
export function finalStretch(m: Mission | null, roundIdx: number, roundTime: number, waveIdx: number): boolean {
  if (!m) return false;
  if (m.round) {
    const n = m.rounds ?? 1, dur = roundDef(m, roundIdx).duration;
    if (!Number.isFinite(n)) return roundIdx >= 2 && roundTime >= dur * 0.6;
    return roundIdx >= n - 1 && roundTime >= dur * 0.5;
  }
  return m.waves.length > 0 && waveIdx >= m.waves.length - 1;
}

export const CLIMAX = 0.82;
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (v: number, lo = 0, hi = 1) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function computeThreat(i: ThreatInput): number {
  if (!i.active) return 0;
  const hurt = 1 - clamp(i.integrity ?? 1);
  if (!i.enemies.length) return clamp(0.05 + 0.1 * hurt + (i.onFire ? 0.15 : 0));
  // crowd: each enemy weighs 1 within 400 m, fading to 0.15 at 4 km; aces and bosses count double
  let w = 0, nearest = Infinity, boss = false;
  for (const e of i.enemies) {
    const d = i.listener ? dist(e.pos, i.listener) : 2000;
    if (!Number.isFinite(d)) continue;
    nearest = Math.min(nearest, d);
    w += clamp(1 - (d - 400) / 3600, 0.15, 1) * (e.boss || e.ace ? 2 : 1);
    boss ||= !!e.boss;
  }
  const crowd = 1 - Math.exp(-w / 3);                       // 1 close: 0.28, 3: 0.63, 6: 0.86
  const prox = clamp(1 - (nearest - 300) / 2200);           // someone within 300 m: 1
  let t = 0.14 + 0.42 * crowd + 0.22 * prox + 0.18 * hurt;
  if (i.finalWave) t += 0.14;
  if (boss) t = Math.max(t, 0.9);
  if (i.onFire) t = Math.max(t, 0.88);
  return clamp(t);
}
