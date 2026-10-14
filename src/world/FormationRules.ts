/** Formation policy, independent of renderer, wall clock and random-number source. */
export type FormationStatus = 'station' | 'damaged' | 'straggler' | 'lost';
export type FormationLoss = 'spin' | 'split' | 'explode' | 'glide' | 'ditch' | 'fold';
export const LOSS_PROFILES = {
  spin: { chutes: 4, duration: 30 }, split: { chutes: 3, duration: 26 },
  explode: { chutes: 0, duration: 20 }, glide: { chutes: 5, duration: 55 },
  ditch: { chutes: 0, duration: 18 },
  fold: { chutes: 3, duration: 30 },   // the wing that was shot through folds up and off where it was hit
} as const;
export function formationStatus(previous: FormationStatus, alive: boolean, engines: number, integrity: number, straggling: boolean): FormationStatus {
  if (previous === 'lost' || !alive) return 'lost';
  if (engines >= 2 || straggling) return 'straggler';
  return engines > 0 || integrity < 0.95 ? 'damaged' : 'station';
}
export function lossKind(cause: string, roll: number): FormationLoss {
  if (cause === 'ditch') return 'ditch';
  if (cause === 'tail' || cause === 'fuselageAft') return 'split';
  if (cause === 'all engines') return 'glide';
  if (cause.startsWith('wing')) return 'fold';
  if (cause === 'cockpit') return 'spin';
  return roll < 0.3 ? 'explode' : roll < 0.6 ? 'split' : roll < 0.8 ? 'spin' : 'glide';
}
export interface FormationMember {
  status: FormationStatus; player: boolean; slot: number;
}
/** Stable succession: the earliest serviceable ship leads, next is deputy. */
export function leadIndex(members: readonly FormationMember[], after = -1): number {
  for (let i = after + 1; i < members.length; i++) if (members[i].status === 'station' || members[i].status === 'damaged') return i;
  return -1;
}
/** Tightening preserves each ship's lane and order; never routes a ship through the player's slot. */
export function formationCompression(members: readonly FormationMember[]): number {
  let missing = 0;
  for (const m of members) if (m.status === 'lost' || m.status === 'straggler') missing++;
  return Math.max(0.78, 1 - missing * 0.045);
}
export function chutesDue(kind: FormationLoss, age: number): number {
  return Math.max(0, Math.min(LOSS_PROFILES[kind].chutes, Math.floor((age - 2.5) / 1.1) + 1));
}
export function companionDitchDue(campaign: boolean, progress: number, engines: number, integrity: number, controllable: boolean): boolean {
  return campaign && controllable && progress >= 0.75 && progress < 0.96 && (engines >= 2 || integrity < 0.4);
}
export const FORMATION_RADIO = {
  damage: 'Number two is feathered. We are holding station.',
  straggler: 'We are dropping back. Keep those fighters off us!',
  lead: 'Deputy lead taking over. Close up on me.',
  reform: 'Box is re-formed. Keep your spacing.',
  ditch: 'We cannot make the coast. Putting her down in the sea.',
  kill: 'Got him! He is going down behind the box.',
  chutes3: 'I see two... three chutes!', chutes4: 'I see three... four chutes!', chutes5: 'I see four... five chutes!',
} as const;
export const SQUADRONS = [
  { name: 'Red flight', art: 'script', color: '#a93e32' },
  { name: 'Blue flight', art: 'wings', color: '#465a8b' },
  { name: 'Gold flight', art: 'lightning', color: '#c6a85e' },
] as const;
