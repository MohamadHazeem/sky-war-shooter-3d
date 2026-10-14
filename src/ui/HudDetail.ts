/** One policy for shared DOM/canvas HUDs. Missing/old saves use Standard. */
export type HudDetail = 'minimal' | 'standard' | 'full';
export const hudDetail = (value?: string): HudDetail => value === 'minimal' || value === 'full' ? value : 'standard';
const minimal = { status: false, feed: false, objective: false, abilities: false, toasts: false, extras: false, popups: false, hints: false, radar: false, markers: false };
const standard = { status: true, feed: true, objective: true, abilities: true, toasts: true, extras: false, popups: true, hints: true, radar: false, markers: false };
const full = { status: true, feed: true, objective: true, abilities: true, toasts: true, extras: true, popups: true, hints: true, radar: true, markers: true };
export const hudVisibility = (detail?: string) => detail === 'minimal' ? minimal : detail === 'full' ? full : standard;
export const abilityVisible = (detail: HudDetail, ready: boolean) => detail === 'full' || (detail === 'standard' && ready);
export const controlsHintVisible = (missions: number) => missions > 0 && missions <= 2;
export const hudRuntime = { detail: 'standard' as HudDetail, inMission: false, heavy: false };
export function setHudDetail(value?: string) {
  hudRuntime.detail = hudDetail(value);
  document.body.dataset.hudDetail = hudRuntime.detail;
}
