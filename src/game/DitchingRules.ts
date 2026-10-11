/** Route distance is a narrative estimate: there is no geographic flight route in World. */
export function coastDistanceKm(progress: number): number {
  return Math.max(0, Math.min(80, (1 - progress) * 240));
}
export interface DitchState {
  campaign: boolean; gunner: boolean; coop: boolean; controllable: boolean;
  enginesOut: number; integrity: number; leaking: boolean;
  initialEnginesOut?: number;
  /** structural integrity at mission start (Last Light starts already damaged) */
  initialIntegrity?: number;
  progress: number; coastKm: number; ending: boolean;
}
export function shouldDitch(s: DitchState): boolean {
  if (!s.campaign || !s.gunner || s.coop || !s.controllable) return false;
  // Two engines alone still permit a belly landing when close to England.
  const beyondLanding = s.enginesOut >= 3 || s.integrity < 0.22 || (s.leaking && s.enginesOut >= 2);
  // Last Light starts on two engines: its authored handicap alone must not force failure.
  // Integrity counts only once it has fallen well below where the mission started.
  const deteriorated = s.enginesOut > (s.initialEnginesOut ?? 0) || s.integrity < Math.min(0.5, (s.initialIntegrity ?? 1) - 0.15) || s.leaking;
  if (s.ending) return beyondLanding;
  // Missions that start crippled (Last Light, The Long Way Home) are about nursing her home:
  // no mid-mission ditching, only the end-of-mission rule above.
  if ((s.initialEnginesOut ?? 0) >= 2) return false;
  return deteriorated && s.progress >= 0.75 && s.coastKm > 25 && (s.enginesOut >= 2 || beyondLanding);
}
export function ditchSuccess(bombsRequired: boolean, bombsDropped: boolean, success: boolean): boolean {
  return bombsRequired ? bombsDropped : success;
}
export const DITCH_TEXT = {
  tag: 'THE CHANNEL · DITCHING', brace: 'Crew in ditching positions', impact: 'Brace for impact',
  rafts: 'Launch the dinghies', rescue: 'Picked up by the RAF Air-Sea Rescue',
  success: 'Objectives met. Ditched in the Channel; bomber lost, crew rescued.',
  failure: 'Objectives not met. Ditched in the Channel; bomber lost, crew rescued.',
  merit: 'Ditched · bomber lost · crew rescued', achievement: 'Goldfish Club',
  achievementDesc: 'Survive ditching and be rescued from the sea.',
} as const;
export const DITCH_RADIO = [
  ['Pilot', "We're not going to make it — prepare for ditching."],
  ['Co-Pilot', 'Crew in ditching positions. Brace! Brace!'],
  ['Pilot', 'Everybody out! Launch the dinghies and stay together.'],
  ['Radio', 'Rescue launch in sight! Firing a flare.'],
  ['Co-Pilot', 'All ten accounted for. Picked up by the RAF Air-Sea Rescue.'],
] as const;
