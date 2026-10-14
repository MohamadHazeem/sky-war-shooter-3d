import type { Mission } from '../game/Missions';
import type { Vector3 } from 'three';

export const PACK_IDS = ['sturm', 'hornisse', 'airBomb', 'jetSlash', 'multiAxis'] as const;
export type PackTactic = typeof PACK_IDS[number];
export const STURM = { distance: 3800, closing: 285, fireRange: 900, armour: 1.55, spacing: 65 };
export const AIR_BOMB = { warning: 8, fuse: 4.5, height: 420, radius: 105, damage: 85 };
export const PACK = {
  sturm: { count: 8, speaker: 'Navigator', radio: 'Wedge at twelve! Armoured Focke-Wulfs, level! Open fire early!', tip: 'New tactic: Sturm wedge — top turret, chin or nose; fire early.', cue: 'STURM WEDGE' },
  hornisse: { count: 2, speaker: 'Navigator', radio: 'Me 410s at one kilometre! Keep firing at the heavy cannon ships!', tip: 'New tactic: Me 410 stand-off — hold sustained fire at long range.', cue: 'BIG GUN' },
  airBomb: { count: 3, speaker: 'Top Turret', radio: 'Fighters holding high at twelve! Air bombs! Top turret, stop them dropping!', tip: 'New tactic: air bombs — top turret; hit the high fighters before release.', cue: 'AIR BOMBS' },
  jetSlash: { count: 2, speaker: 'Tail', radio: 'Jets slashing in from six! Tail gunner, take the brief shot!', tip: 'New tactic: jet slash — tail gun; lead early, the pass is brief.', cue: 'JET' },
  multiAxis: { count: 4, speaker: 'Pilot', radio: 'Three and nine together! Pick one pair and break their attack!', tip: 'New tactic: two axes — pick a waist gun and stop one pair first.', cue: 'PINCER' },
} as const;

/** Leader points toward the bombers; each pair steps back, away from them. */
export function sturmSlot(i: number, out: Vector3) {
  const rank = Math.ceil(i / 2);
  return out.set(i === 0 ? 0 : (i % 2 ? -1 : 1) * rank * STURM.spacing, 0, rank * 48);
}

/** Latest lesson first, then revisit earlier ones on subsequent rounds. No custom-mode leaks. */
export function scheduledTactic(m: Mission, round: number): PackTactic | null {
  if (m.role === 'gunner' && !m.tutorial && !m.naval && m.tactics) return m.tactics[round % m.tactics.length] ?? null;
  if (m.role !== 'gunner' || m.tutorial || m.naval || m.specials === false || m.enemyTypes) return null;
  const survival = m.id === 'survival-gunner';
  if (!survival && !/^m\d+$/.test(m.id) && !/^tour2-\d+-\d+$/.test(m.id)) return null;
  const unlocked = Math.min(5, survival ? round : Math.floor(m.number / 2));
  if (unlocked < 1) return null;
  return PACK_IDS[survival ? (round - 1) % unlocked : (unlocked - 1 + round) % unlocked];
}

export class TacticSchedule {
  private sent = -1;
  reset() { this.sent = -1; }
  next(m: Mission, round: number, elapsed: number, remaining: number, enemies: number, blocked: boolean): PackTactic | null {
    if (this.sent === round || elapsed < 25 || remaining < 35 || blocked) return null;
    const id = scheduledTactic(m, round);
    if (!id || enemies + PACK[id].count > 32) return null;
    this.sent = round;
    return id;
  }
}
