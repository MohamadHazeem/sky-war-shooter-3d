import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { Game } from './Game';
import { GamepadInput } from '../core/Gamepad';
import { isPortrait, isTouchDevice } from '../core/Touch';
import { access } from '../core/Accessibility';
import { TouchHud } from '../ui/TouchHud';
import { STATION_ORDER } from '../world/B17Layout';
import { tx } from '../i18n';
import { keyMap } from '../core/KeyMap';
import '../ui/devices.css';

// Touch controls, gamepad and accessibility preferences, wired up from main.ts so Game.ts
// needs no device code. Runs just before Game.frame() each frame (it wraps engine.onFrame)
// so the aim it adds is consumed by the controllers in the same frame.
//
// Touch mode (body.touch): 'auto' = a phone/tablet, or as soon as a finger touches the
// screen; a real mouse moving on a non-touch-first device turns it back off.

export class DeviceControls {
  private abilityRole: string | null = null;
  readonly touch: TouchHud;
  readonly pad: GamepadInput;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private touchFirst = isTouchDevice();
  private lastTouch = false;
  private touchMode = false;
  private lastT = 0;
  private wingRow: HTMLElement;

  constructor(private engine: Engine, private input: Input, private game: Game) {
    this.touch = new TouchHud(input);
    this.touch.onAction = (a) => {
      if (a === 'pause') this.game.pause();
      else if (a === 'map') input.tap('Tab');
      else if (a === 'help') input.tap('KeyH');
      else if (a === 'view') input.tap('KeyV');
    };
    this.pad = new GamepadInput(input, {
      flying: () => this.flying(),
      role: () => (this.game.mission ? this.game.mission.role : null),
      cycleSeat: (dir) => {
        const g = this.game.gunner;
        const i = STATION_ORDER.indexOf(g.station);
        g.requestStation(STATION_ORDER[(i + dir + STATION_ORDER.length) % STATION_ORDER.length]);
      },
      togglePause: () => this.togglePause(),
      onConnect: (name, on) => this.toast(on ? tx('Gamepad connected — {name}', { name: shortName(name) }) : tx('Gamepad disconnected')),
    });
    // P-51 wingman orders (Wingman.ts listens for the number keys): a row of small buttons
    this.wingRow = document.createElement('div');
    this.wingRow.className = 'th-wing';
    this.wingRow.innerHTML = [['Digit1', 'ATK'], ['Digit2', 'COVER'], ['Digit3', 'BOMB'], ['Digit4', 'FORM']]
      .map(([code, label]) => `<button data-code="${code}" aria-label="${tx('Wingman: {order}', { order: tx(label) })}">${tx(label)}</button>`).join('');
    this.touch.el.appendChild(this.wingRow);
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'devToast';
    this.toastEl.setAttribute('role', 'status');
    document.body.appendChild(this.toastEl);
    const rot = document.createElement('div');
    rot.id = 'rotateOverlay';
    rot.innerHTML = `<div class="ro-phone"></div><div class="ro-t">${tx('Rotate your phone')}</div><div class="ro-d">${tx('Sky War Shooter plays in landscape')}</div>`;
    document.body.appendChild(rot);

    // touch mode follows the device actually being used
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { this.lastTouch = true; this.refreshMode(); } }, true);
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !this.touchFirst && this.lastTouch && (e.movementX || e.movementY)) { this.lastTouch = false; this.refreshMode(); }
    }, true);
    access.onChange(() => { this.refreshMode(); this.touch.sensitivity = access.prefs.touchSens; });
    access.apply();

    // run before the game's frame
    const frame = engine.onFrame;
    engine.onFrame = (dt, t) => { this.update(dt); frame?.(dt, t); };
  }

  private flying() {
    return this.input.active && this.game.state === 'playing' && !!this.game.mission && !this.game.photo.active;
  }

  private refreshMode() {
    const pref = access.prefs.touch;
    const on = pref === 'on' || (pref === 'auto' && (this.touchFirst || this.lastTouch));
    if (on === this.touchMode) return;
    this.touchMode = on;
    this.input.touchMode = on;
    document.body.classList.toggle('touch', on);
    if (on) this.input.unlock();
  }

  private togglePause() {
    const g = this.game;
    if (g.state === 'playing') { g.pause(); return; }
    if (g.state !== 'paused') return;
    if (g.onboarding.card.open) { this.input.tap('KeyH'); return; }
    const settingsOpen = document.getElementById('settings')?.classList.contains('show');
    if (document.getElementById('pause')?.classList.contains('show') && !settingsOpen) g.resume();
  }

  toast(text: string, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  update(dt: number) {
    // real seconds: game dt is 0 while paused and slowed by hit-stop / slow motion
    const now = performance.now();
    const wall = this.lastT ? Math.min(0.1, Math.max(0, (now - this.lastT) / 1000)) : 1 / 60;
    this.lastT = now;
    const real = !this.engine.paused && dt > 0 ? Math.min(0.1, dt / Math.max(0.05, this.engine.timeScale)) : wall;
    this.refreshMode();
    const g = this.game;
    // scoped key bindings: the number keys are gun positions in the B-17, wingman orders in the P-51
    keyMap.scope = g.mission && g.state !== 'menu' ? g.mission.role : null;
    this.pad.update(real);
    const role = this.touchMode && this.flying() ? g.mission!.role : null;
    // ability buttons follow the role's keys (gunner Q/E/G, pilot Z/X/G)
    if (role && role !== this.abilityRole) {
      this.abilityRole = role;
      for (const id of ['mustangs', 'overdrive', 'focus']) this.touch.removeAbility(id);
      const keys = role === 'gunner' ? ['KeyQ', 'KeyE', 'KeyG'] : ['KeyZ', 'KeyX', 'KeyG'];
      this.touch.addAbility('mustangs', 'P-51s', keys[0]);
      this.touch.addAbility('overdrive', 'OVR', keys[1]);
      this.touch.addAbility('focus', 'FOCUS', keys[2]);
    }
    this.touch.show(role);
    this.touch.update(real, g.pilot.throttleCmd);
    // portrait on a phone: hold the game until it is turned sideways
    if (this.touchMode && g.state === 'playing' && isPortrait()) g.pause();
  }
}

function shortName(id: string) {
  const s = id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 34 ? s.slice(0, 32) + '…' : s || tx('controller');
}
