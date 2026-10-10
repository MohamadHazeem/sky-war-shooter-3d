import type { Input } from '../core/Input';
import { dragToMouse, stickValue, STICK_RATE } from '../core/Touch';
import { STATIONS, StationId } from '../world/B17Layout';
import { tx } from '../i18n';

// On-screen controls for phones and tablets (shown only in touch mode during a mission).
//
//   left two-thirds   gunner: drag to aim (relative, like a mouse)
//                     P-51: a floating virtual stick appears under the thumb
//   bottom right      FIRE (hold; sliding the thumb while holding also aims), ZOOM (toggle)
//   right edge        P-51 throttle lever, VIEW button
//   top right         MAP, controls card (?), PAUSE, full screen
//   seat bar          the HUD's gun-position bar becomes tappable
//
// Everything feeds Input exactly like a mouse and keyboard would (see Input.ts).
// Abilities: other systems can add small buttons with addAbility(id, label, code).

type Role = 'gunner' | 'pilot';

const FIRE = 1, ZOOM = 4;

interface Track { id: number; x: number; y: number; ox: number; oy: number }

export class TouchHud {
  readonly el: HTMLElement;
  private role: Role | null = null;
  private aim: Track | null = null;     // drag-aim finger
  private stick: Track | null = null;   // pilot stick finger
  private firePtr: Track | null = null; // finger on FIRE (sliding it aims too)
  private thrPtr: number | null = null;
  private zoomOn = false;
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private thrFill: HTMLElement;
  private thrTrack: HTMLElement;
  private abil: HTMLElement;
  private shownThr = -1;
  sensitivity = 1;      // Settings: touch aim sensitivity
  onAction?: (a: 'pause' | 'map' | 'help' | 'view') => void;

  constructor(private input: Input) {
    const el = document.createElement('div');
    el.id = 'touchHud';
    el.innerHTML = `
      <div class="th-stick"><i></i></div>
      <div class="th-top">
        <button data-t="map" aria-label="${tx('Map')}">${tx('MAP')}</button>
        <button data-t="help" aria-label="${tx('Controls')}">?</button>
        <button data-t="pause" aria-label="${tx('Pause')}"><span class="th-pause"></span></button>
        ${document.fullscreenEnabled ? `<button data-t="full" aria-label="${tx('Full screen')}">⛶</button>` : ''}
      </div>
      <div class="th-abil"></div>
      <div class="th-thr" aria-label="${tx('Throttle')}"><div class="th-track"><i></i></div><span>${tx('THR')}</span></div>
      <button class="th-view" data-t="view">${tx('VIEW')}</button>
      <button class="th-zoom" aria-label="${tx('Zoom')}">${tx('ZOOM')}</button>
      <button class="th-fire" aria-label="${tx('Fire')}">${tx('FIRE')}</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.stickEl = el.querySelector('.th-stick')!;
    this.knobEl = this.stickEl.querySelector('i')!;
    this.thrTrack = el.querySelector('.th-track')!;
    this.thrFill = this.thrTrack.querySelector('i')!;
    this.abil = el.querySelector('.th-abil')!;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // the HUD's gun-position bar: tap a seat to move there (works with remapped keys too)
    document.addEventListener('pointerdown', (e) => {
      if (!this.role || !document.body.classList.contains('touch')) return;
      const span = (e.target as HTMLElement)?.closest?.('#hStations span[data-s]') as HTMLElement | null;
      if (!span) return;
      e.preventDefault();
      const st = STATIONS[span.dataset.s as StationId];
      if (st) this.input.tap('Digit' + st.key);
    });
  }

  /** Show for a role, or hide (null). Hiding lets go of everything. */
  show(role: Role | null) {
    if (role === this.role) return;
    this.role = role;
    this.el.classList.toggle('show', !!role);
    this.el.classList.toggle('pilot', role === 'pilot');
    this.el.classList.toggle('gunner', role === 'gunner');
    if (!role) this.releaseAll();
  }

  get visible() { return !!this.role; }

  addAbility(id: string, label: string, code: string) {
    if (this.abil.querySelector(`[data-ab="${CSS.escape(id)}"]`)) return;
    const b = document.createElement('button');
    b.dataset.ab = id;
    b.dataset.code = code;
    b.textContent = tx(label);
    this.abil.appendChild(b);
  }
  removeAbility(id: string) { this.abil.querySelector(`[data-ab="${CSS.escape(id)}"]`)?.remove(); }

  private releaseAll() {
    this.aim = this.stick = this.firePtr = null;
    this.thrPtr = null;
    this.zoomOn = false;
    this.el.querySelector('.th-zoom')?.classList.remove('on');
    this.el.querySelector('.th-fire')?.classList.remove('on');
    this.stickEl.classList.remove('on');
    this.input.setVirtualButtons('touch', 0);
  }

  private bits() { return (this.firePtr ? FIRE : 0) | (this.zoomOn ? ZOOM : 0); }

  private down(e: PointerEvent) {
    if (!this.role) return;
    e.preventDefault();   // no emulated mouse events, no text selection, no double-tap zoom
    const t = e.target as HTMLElement;
    const btn = t.closest('button') as HTMLButtonElement | null;
    const track = (): Track => ({ id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
    const capture = () => { try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } };
    if (btn?.classList.contains('th-fire')) {
      this.firePtr = track(); capture();
      btn.classList.add('on');
    } else if (btn?.classList.contains('th-zoom')) {
      this.zoomOn = !this.zoomOn;
      btn.classList.toggle('on', this.zoomOn);
    } else if (btn?.dataset.t) {
      const a = btn.dataset.t;
      if (a === 'full') this.toggleFullscreen();
      else this.onAction?.(a as 'pause' | 'map' | 'help' | 'view');
    } else if (btn?.dataset.code) {
      this.input.tap(btn.dataset.code);
    } else if (t.closest('.th-thr')) {
      this.thrPtr = e.pointerId; capture();
      this.setThrottleFrom(e.clientY);
    } else if (e.clientX < innerWidth * (2 / 3)) {
      capture();
      if (this.role === 'pilot') {
        this.stick = track();
        this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.knobEl.style.transform = '';
        this.stickEl.classList.add('on');
      } else this.aim = track();
    }
    this.input.setVirtualButtons('touch', this.bits());
  }

  private move(e: PointerEvent) {
    if (!this.role) return;
    const id = e.pointerId;
    const aimFrom = (tr: Track) => {
      const k = this.sensitivity;
      this.input.mouseDX += dragToMouse(e.clientX - tr.x, innerWidth) * k;
      this.input.mouseDY += dragToMouse(e.clientY - tr.y, innerWidth) * k;
      tr.x = e.clientX; tr.y = e.clientY;
    };
    if (this.aim?.id === id) aimFrom(this.aim);
    else if (this.firePtr?.id === id) aimFrom(this.firePtr);
    else if (this.stick?.id === id) {
      this.stick.x = e.clientX; this.stick.y = e.clientY;
      const r = this.stickRadius();
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > r) { dx *= r / len; dy *= r / len; }
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (this.thrPtr === id) this.setThrottleFrom(e.clientY);
  }

  private up(e: PointerEvent) {
    const id = e.pointerId;
    if (this.aim?.id === id) this.aim = null;
    if (this.stick?.id === id) { this.stick = null; this.stickEl.classList.remove('on'); }
    if (this.firePtr?.id === id) { this.firePtr = null; this.el.querySelector('.th-fire')?.classList.remove('on'); }
    if (this.thrPtr === id) this.thrPtr = null;
    this.input.setVirtualButtons('touch', this.bits());
  }

  private stickRadius() { return Math.max(40, Math.min(70, Math.min(innerWidth, innerHeight) * 0.16)); }

  private setThrottleFrom(y: number) {
    const r = this.thrTrack.getBoundingClientRect();
    if (r.height <= 0) return;
    const f = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height));
    this.input.analog.throttleSet = f * 1.1;
    this.showThrottle(f * 1.1);
  }

  /** Per frame (real dt): the pilot stick turns at a rate; the throttle lever follows the plane. */
  update(dt: number, throttle: number) {
    if (!this.role) return;
    if (this.stick) {
      const v = stickValue(this.stick.x - this.stick.ox, this.stick.y - this.stick.oy, this.stickRadius());
      this.input.mouseDX += v.x * STICK_RATE * this.sensitivity * dt;
      this.input.mouseDY += v.y * STICK_RATE * this.sensitivity * dt;
    }
    if (this.role === 'pilot' && this.thrPtr === null) this.showThrottle(throttle);
  }

  private showThrottle(t: number) {
    const f = Math.max(0, Math.min(1, t / 1.1));
    if (Math.abs(f - this.shownThr) < 0.005) return;
    this.shownThr = f;
    this.thrFill.style.transform = `scaleY(${f.toFixed(3)})`;
  }

  private toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else {
        const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions);
        p?.then(() => (screen.orientation as any)?.lock?.('landscape').catch?.(() => {})).catch(() => {});
      }
    } catch { /* not allowed */ }
  }
}
