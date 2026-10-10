// Optional on-screen frame-rate readout (Settings > FPS counter). Shows frames per second,
// the average and worst frame time over the last half second, the dynamic-resolution scale
// and the refresh rate the engine is targeting.
import { t, tx, isAr } from '../i18n';
import type { UiKey } from '../i18n/en';

interface EngineStats { renderScale: number; refreshHz: number; targetMs: number; quality: string }

// the quality tier's name from the Settings screen (falls back to the tier id)
const qualityName = (q: string) => { const s = t(`settings.q.${q}` as UiKey); return s.startsWith('settings.') ? q : s; };

export class FpsCounter {
  private el: HTMLDivElement;
  private acc = 0;
  private n = 0;
  private worst = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sws-fps';
    Object.assign(this.el.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '60', pointerEvents: 'none',
      font: '600 11px/1.35 ui-monospace, SFMono-Regular, Menlo, "IBM Plex Sans Arabic", monospace', color: '#e8e4d8',
      background: 'rgba(12,14,12,0.55)', padding: '3px 7px', borderRadius: '4px',
      letterSpacing: '0.02em', whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    this.el.textContent = '-- fps';
    document.body.appendChild(this.el);
  }

  update(dt: number, e: EngineStats) {
    if (dt <= 0) return;
    this.acc += dt; this.n++;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.5) return;
    const fps = this.n / this.acc, ms = (this.acc / this.n) * 1000;
    const target = Math.round(1000 / e.targetMs);
    const worst = (this.worst * 1000).toFixed(1), res = Math.round(e.renderScale * 100);
    this.el.style.direction = isAr() ? 'rtl' : 'ltr';
    this.el.textContent = isAr()
      ? `${fps.toFixed(0)} ${tx('fps')}  ${ms.toFixed(1)} ${tx('ms')} (${tx('max {n}', { n: worst })})\n${qualityName(e.quality)} · ${tx('{n}% res', { n: res })} · ${target}/${e.refreshHz} ${tx('Hz')}`
      : `${fps.toFixed(0).padStart(3)} fps  ${ms.toFixed(1)} ms (max ${worst})\n${e.quality} · ${res}% res · ${target}/${e.refreshHz} Hz`;
    this.el.style.color = fps < target * 0.8 ? '#ffb070' : '#e8e4d8';
    this.acc = 0; this.n = 0; this.worst = 0;
  }

  dispose() { this.el.remove(); }
}
