/** One policy for shared DOM/canvas HUDs. Missing/old saves use Standard. */
export type HudDetail = 'minimal' | 'standard' | 'full';
export const hudDetail = (value?: string): HudDetail => value === 'minimal' || value === 'full' ? value : 'standard';
const minimal = { status: false, feed: false, objective: false, abilities: false, toasts: false, extras: false, popups: false, hints: false, radar: false, markers: false };
const standard = { status: true, feed: true, objective: true, abilities: true, toasts: true, extras: false, popups: true, hints: true, radar: false, markers: false };
const full = { status: true, feed: true, objective: true, abilities: true, toasts: true, extras: true, popups: true, hints: true, radar: true, markers: true };
export const hudVisibility = (detail?: string) => detail === 'minimal' ? minimal : detail === 'full' ? full : standard;
export const abilityVisible = (detail: HudDetail, ready: boolean) => detail === 'full' || (detail === 'standard' && ready);
export const controlsHintVisible = (missions: number) => missions > 0 && missions <= 2;
/** The "H — controls" reminder: early missions only, live play only (not paused, ending, cut-scenes or photo
 *  mode), for the first seconds the player actually has control; never over Minimal or the open card. */
export const CONTROLS_HINT_SECONDS = 12;
export const controlsHintShown = (o: { missions: number; detail: HudDetail; playing: boolean; t: number; cardOpen: boolean }) =>
  o.detail !== 'minimal' && controlsHintVisible(o.missions) && o.playing && o.t < CONTROLS_HINT_SECONDS && !o.cardOpen;
/** The top-left status line leaves the round out when the objective line under it already starts with it. */
export const statusRepeatsRound = (objective: string) => /^Round \d/.test(objective);
export const hudRuntime = { detail: 'standard' as HudDetail, inMission: false, heavy: false };
export function setHudDetail(value?: string) {
  hudRuntime.detail = hudDetail(value);
  document.body.dataset.hudDetail = hudRuntime.detail;
}
