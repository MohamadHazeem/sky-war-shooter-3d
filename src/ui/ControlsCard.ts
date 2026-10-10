import { STATION_ORDER, STATIONS } from '../world/B17Layout';

// Controls card: H (or F1) during a mission shows the keys for the current role on a
// semi-transparent card; the game pauses underneath. H, F1, Esc or a click closes it.

type Role = 'gunner' | 'pilot';

const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');

const GUNNER: [string, string][] = [
  [k('Mouse') + ' / ' + k('↑↓←→') + ' / ' + k('I', 'J', 'K', 'L'), 'Swing the gun'],
  [k('Left button') + ' / ' + k('Space'), 'Fire — short bursts keep the barrel cool'],
  [k('Right button'), 'Look down the ring sight (zoom)'],
  [k('1') + '–' + k('5'), 'Change gun position: ' + STATION_ORDER.map((s) => `${STATIONS[s].key} ${STATIONS[s].label}`).join(' · ')],
  [k('R'), 'Reload'],
  [k('Tab'), 'Big radar map'],
  [k('F'), 'Photo mode'],
  [k('Esc') + ' / ' + k('P'), 'Pause'],
  [k('H') + ' / ' + k('F1'), 'This card'],
];
const GUNNER_TIPS = [
  'Aim at the yellow ◇ lead indicator, not the plane.',
  'A lit seat badge (bottom-left) means fighters in another gun\'s arc.',
  'The radar shows where the next group will come from.',
];

const PILOT: [string, string][] = [
  [k('Mouse') + ' / ' + k('↑↓←→'), 'Fly where you look (mouse aim)'],
  [k('Left button') + ' / ' + k('Space'), 'Fire'],
  [k('W') + ' / ' + k('S'), 'Throttle up / down'],
  [k('Q') + ' / ' + k('E'), 'Roll'],
  [k('A') + ' / ' + k('D'), 'Rudder'],
  [k('Right button'), 'Zoom'],
  [k('V'), 'Cockpit / chase view'],
  [k('C'), 'Free look (hold)'],
  [k('M'), 'Mouse aim / direct flight controls'],
  [k('Tab'), 'Big radar map'],
  [k('F'), 'Photo mode'],
  [k('Esc') + ' / ' + k('P'), 'Pause'],
  [k('H') + ' / ' + k('F1'), 'This card'],
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
    const rows = role === 'gunner' ? GUNNER : PILOT;
    const tips = role === 'gunner' ? GUNNER_TIPS : PILOT_TIPS;
    this.el.innerHTML = `<div class="cc-box">
      <div class="cc-k">CONTROLS · ${role === 'gunner' ? 'B-17 GUNNER' : 'P-51 PILOT'}</div>
      <div class="cc-grid">${rows.map(([key, what]) => `<div class="cc-key">${key}</div><div class="cc-what">${what}</div>`).join('')}</div>
      <div class="cc-tips">${tips.map((t) => `<div>${t}</div>`).join('')}</div>
      <div class="cc-foot">Game paused · press <kbd>H</kbd> or click to continue</div>
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
    this.el.innerHTML = '<kbd>H</kbd> — controls';
    document.body.appendChild(this.el);
  }
  set(on: boolean) { if (this.el.classList.contains('show') !== on) this.el.classList.toggle('show', on); }
}
