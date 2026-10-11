/** Pure selection rules shared by the score and its regression tests. */
export type ScoreMode = 'day' | 'night' | 'field' | 'train' | 'boss';
export function scoreMode(mission: string | undefined, boss: boolean): ScoreMode {
  if (boss) return 'boss';
  return mission === 'night-pilot' ? 'night' : mission === 'raid-pilot' ? 'field' : mission === 'strafe-pilot' ? 'train' : 'day';
}
export function modeThreat(threat: number, mode: ScoreMode, coned: number): number {
  if (mode === 'boss') return Math.max(threat, 0.9);
  return mode === 'night' && coned > 0 ? Math.max(threat, Math.min(0.9, 0.58 + coned * 0.08)) : threat;
}
