import { STATION_ORDER, STATIONS } from '../world/B17Layout';
import { keyMap, ActionId } from '../core/KeyMap';
import { tx } from '../i18n';
import { padConnected } from '../core/Gamepad';

// key bound to an action (Settings > Key bindings)
const b = (id: ActionId) => keyMap.label(id);

// Controls card: H (or F1) during a mission shows the keys for the current role on a
// semi-transparent card; the game pauses underneath. H, F1, Esc or a click closes it.

type Role = 'gunner' | 'pilot';

const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');

const GUNNER = (): [string, string][] => [
  [k(tx('Mouse')) + ' / ' + k('↑↓←→') + ' / ' + k('I', 'J', 'K', 'L'), tx('Swing the gun')],
  [k(tx('Left button')) + ' / ' + k(b('fire')), tx('Fire — short bursts keep the barrel cool')],
  [k(tx('Right button')) + ' / ' + k(b('zoom')), tx('Look down the ring sight (zoom)')],
  [k('C'), tx('Free look (hold): look around the fuselage')],
  [k(...STATION_ORDER.map((s) => b(('seat' + STATIONS[s].key) as ActionId))), tx('Change gun position: ') + STATION_ORDER.map((s) => `${b(('seat' + STATIONS[s].key) as ActionId)} ${tx(STATIONS[s].label)}`).join(' · ')],
  [k(b('reload')), tx('Reload')],
  [k('Q', 'E', 'G'), abilities('Q', 'E', 'G')],
  [k(b('map')), tx('Big radar map')],
  [k('F'), tx('Photo mode')],
  [k('Esc') + ' / ' + k(b('pause')), tx('Pause')],
  [k(b('help')) + ' / ' + k('F1'), tx('This card')],
];
// Abilities (Abilities.ts keys; the touch buttons carry the same names)
function abilities(a: string, m: string, f: string) {
  return tx('Abilities: {a} call the Mustangs · {b} Overdrive · {c} Focus', { a, b: m, c: f });
}
// The same cards with the on-screen touch controls (DeviceControls / TouchHud)
const TOUCH_GUNNER = (): [string, string][] => [
  [k(tx('Drag')), tx('Swing the gun')],
  [k(tx('FIRE')), tx('Fire — short bursts keep the barrel cool')],
  [k(tx('ZOOM')), tx('Look down the ring sight (zoom)')],
  [k(tx('LOOK')), tx('Free look on / off: dragging looks around the fuselage')],
  [k('1–5'), tx('Change gun position: tap a seat in the bar at the bottom')],
  [k(tx('P-51s'), tx('OVR'), tx('FOCUS')), abilities(tx('P-51s'), tx('OVR'), tx('FOCUS'))],
  [k(tx('MAP')), tx('Big radar map')],
  [k('II'), tx('Pause')],
  [k('?'), tx('This card')],
];
const TOUCH_PILOT = (): [string, string][] => [
  [k(tx('Drag')), tx('Fly: a stick appears under your thumb on the left')],
  [k(tx('FIRE')), tx('Fire')],
  [k(tx('THR')), tx('Throttle up / down')],
  [k(tx('ZOOM')), tx('Zoom')],
  [k(tx('VIEW')), tx('Cockpit / chase view')],
  [k(tx('LOOK')), tx('Free look on / off')],
  [k(tx('ATK'), tx('COVER'), tx('BOMB'), tx('FORM')), tx('Wingman Blue Two: {a} attack my target · {b} cover me · {c} protect the bombers · {d} form up', { a: tx('ATK'), b: tx('COVER'), c: tx('BOMB'), d: tx('FORM') })],
  [k(tx('P-51s'), tx('OVR'), tx('FOCUS')), abilities(tx('P-51s'), tx('OVR'), tx('FOCUS'))],
  [k(tx('MAP')), tx('Big radar map')],
  [k('II'), tx('Pause')],
  [k('?'), tx('This card')],
];
// The same cards with a gamepad connected (core/Gamepad.ts; Xbox names, ✚ = the D-pad)
const PAD_GUNNER = (): [string, string][] => [
  [k(tx('Right stick')) + ' / ' + k(tx('Left stick')), tx('Swing the gun')],
  [k('RT'), tx('Fire — short bursts keep the barrel cool')],
  [k('LT'), tx('Look down the ring sight (zoom)')],
  [k('R3'), tx('Free look (hold): look around the fuselage')],
  [k('LB', 'RB'), tx('Previous / next gun position')],
  [k('X'), tx('Reload, or answer an emergency prompt')],
  [k('A', 'B', 'L3'), abilities('A', 'B', 'L3')],
  [k('✚↑'), tx('Big radar map')],
  [k('View') + ' + ' + k('Y'), tx('Photo mode')],
  [k('Start'), tx('Pause')],
  [k('View'), tx('This card')],
];
const PAD_PILOT = (): [string, string][] => [
  [k(tx('Right stick')), tx('Fly where you look (mouse aim)')],
  [k(tx('Left stick')), tx('Roll (left / right) and throttle (up / down)')],
  [k('RT'), tx('Fire')],
  [k('LT'), tx('Zoom')],
  [k('Y'), tx('Cockpit / chase view')],
  [k('R3'), tx('Tap: padlock the nearest bandit · hold: free look')],
  [k('View') + ' + ' + k('X'), tx('Mouse aim / direct flight controls')],
  [k('✚←', '✚→', '✚↓', 'LB + ✚↑'), tx('Wingman Blue Two: {a} attack my target · {b} cover me · {c} protect the bombers · {d} form up', { a: '✚←', b: '✚→', c: '✚↓', d: 'LB + ✚↑' })],
  [k('A', 'B', 'L3'), abilities('A', 'B', 'L3')],
  [k('✚↑'), tx('Big radar map')],
  [k('View') + ' + ' + k('Y'), tx('Photo mode')],
  [k('Start'), tx('Pause')],
  [k('View'), tx('This card')],
];
const GUNNER_TIPS = [
  'Aim at the yellow ◇ lead indicator, not the plane.',
  'A lit seat badge (bottom-left) means fighters in another gun\'s arc.',
  'The radar shows where the next group will come from.',
];

const PILOT = (): [string, string][] => [
  [k(tx('Mouse')) + ' / ' + k('↑↓←→'), tx('Fly where you look (mouse aim)')],
  [k(tx('Left button')) + ' / ' + k(b('fire')), tx('Fire')],
  [k('W') + ' / ' + k('S'), tx('Throttle up / down')],
  [k('Q') + ' / ' + k('E'), tx('Roll')],
  [k('A') + ' / ' + k('D'), tx('Rudder')],
  [k(tx('Right button')) + ' / ' + k(b('zoom')), tx('Zoom')],
  [k('V'), tx('Cockpit / chase view')],
  [k('C'), tx('Free look (hold)')],
  [k('M'), tx('Mouse aim / direct flight controls')],
  [k('T'), tx('Padlock the nearest bandit')],
  [k(b('wing1'), b('wing2'), b('wing3'), b('wing4')), tx('Wingman Blue Two: {a} attack my target · {b} cover me · {c} protect the bombers · {d} form up', { a: b('wing1'), b: b('wing2'), c: b('wing3'), d: b('wing4') })],
  [k('Z', 'X', 'G'), abilities('Z', 'X', 'G')],
  [k(b('map')), tx('Big radar map')],
  [k('F'), tx('Photo mode')],
  [k('Esc') + ' / ' + k(b('pause')), tx('Pause')],
  [k(b('help')) + ' / ' + k('F1'), tx('This card')],
];
const PILOT_TIPS = [
  'Put the K-14 gunsight pipper ahead of the bandit, then fire.',
  'Keep your speed up and stay near the bombers.',
  'A bandit on your six: turn hard — don\'t fly straight.',
];

export class ControlsCard {
  readonly el: HTMLElement;
  open = false;
  onClose?: () => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'controlsCard';
    this.el.addEventListener('click', () => this.onClose?.());
    document.body.appendChild(this.el);
  }

  show(role: Role) {
    // a connected gamepad wins (it is what the player picked up), then touch, then the keyboard
    const pad = padConnected();
    const touch = document.body.classList.contains('touch');
    const rows = pad ? (role === 'gunner' ? PAD_GUNNER() : PAD_PILOT())
      : role === 'gunner' ? (touch ? TOUCH_GUNNER() : GUNNER()) : touch ? TOUCH_PILOT() : PILOT();
    const tips = role === 'gunner' ? GUNNER_TIPS : PILOT_TIPS;
    const key = pad ? 'View' : b('help');
    this.el.innerHTML = `<div class="cc-box">
      <div class="cc-k">${tx('CONTROLS')} · ${tx(role === 'gunner' ? 'B-17 GUNNER' : 'P-51 PILOT')}${pad ? ` · ${tx('GAMEPAD')}` : ''}</div>
      <div class="cc-grid">${rows.map(([key, what]) => `<div class="cc-key">${key}</div><div class="cc-what">${what}</div>`).join('')}</div>
      <div class="cc-tips">${tips.map((t) => `<div>${tx(t)}</div>`).join('')}</div>
      <div class="cc-foot">${tx('Game paused · press {key} or tap to continue', { key: `<kbd>${key}</kbd>` })}</div>
    </div>`;
    this.el.classList.add('show');
    this.open = true;
  }

  hide() {
    this.el.classList.remove('show');
    this.open = false;
  }
}

// The compact "H — controls" reminder shown for the first seconds of every mission
export class ControlsHint {
  private el: HTMLElement;
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'controlsHint';
    this.el.innerHTML = tx('<kbd>H</kbd> — controls');
    document.body.appendChild(this.el);
  }
  set(on: boolean) { if (this.el.classList.contains('show') !== on) this.el.classList.toggle('show', on); }
}
