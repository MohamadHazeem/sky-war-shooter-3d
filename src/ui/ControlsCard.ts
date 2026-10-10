import { STATION_ORDER, STATIONS } from '../world/B17Layout';
import { keyMap, ActionId } from '../core/KeyMap';
import { tx } from '../i18n';

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
  [k(...STATION_ORDER.map((s) => b(('seat' + STATIONS[s].key) as ActionId))), tx('Change gun position: ') + STATION_ORDER.map((s) => `${b(('seat' + STATIONS[s].key) as ActionId)} ${tx(STATIONS[s].label)}`).join(' · ')],
  [k(b('reload')), tx('Reload')],
  [k(b('map')), tx('Big radar map')],
  [k('F'), tx('Photo mode')],
  [k('Esc') + ' / ' + k(b('pause')), tx('Pause')],
  [k(b('help')) + ' / ' + k('F1'), tx('This card')],
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
    const rows = role === 'gunner' ? GUNNER() : PILOT();
    const tips = role === 'gunner' ? GUNNER_TIPS : PILOT_TIPS;
    this.el.innerHTML = `<div class="cc-box">
      <div class="cc-k">${tx('CONTROLS')} · ${tx(role === 'gunner' ? 'B-17 GUNNER' : 'P-51 PILOT')}</div>
      <div class="cc-grid">${rows.map(([key, what]) => `<div class="cc-key">${key}</div><div class="cc-what">${what}</div>`).join('')}</div>
      <div class="cc-tips">${tips.map((t) => `<div>${tx(t)}</div>`).join('')}</div>
      <div class="cc-foot">${tx('Game paused · press {key} or tap to continue', { key: `<kbd>${b('help')}</kbd>` })}</div>
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
