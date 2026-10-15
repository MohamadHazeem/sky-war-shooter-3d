import { tx } from '../i18n';
import { STATIONS, type StationId } from '../world/B17Layout';
import { SPEC_VIEWS, firesAt, type SpecView } from '../game/SpectatorRules';
import { crewLabel } from './Streamer';
import type { CrewSeat } from '../net/Crew';

// The spectator's overlay (game/Spectator.ts): a SPECTATING tag with the broadcast delay, the
// "picture starts in" countdown, and one bar of six buttons (the five gun positions with who is
// on them, and the cinematic camera) plus "Stop watching". Simple (Phase 8): one row, big
// targets, keys shown once. The gunner's own panels (ammo, barrel heat, abilities) are hidden
// while watching; the kill feed, subtitles and the crew score stay.

const CSS = `
#specHud { position: fixed; inset: 0; pointer-events: none; z-index: 12; display: none; font-family: Oswald, "Arial Narrow", "Noto Kufi Arabic", sans-serif; color: #f1e6c8; }
#specHud.show { display: block; }
#specHud .top { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; margin-top: 22px; }
#specHud .tag { font: 600 12px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 3px; padding: 6px 10px; background: rgba(10,10,8,.72); border: 1px solid rgba(217,87,63,.7); color: #f0a08c; white-space: nowrap; }
#specHud .tag::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e0523a; margin-inline-end: 8px; vertical-align: 0; animation: specRec 1.6s ease-in-out infinite; }
#specHud .delay { font: 12px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 2px; padding: 6px 10px; background: rgba(10,10,8,.72); border: 1px solid rgba(185,167,111,.5); white-space: nowrap; }
#specHud .delay:empty { display: none; }
#specHud .wait { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); padding: 16px 24px; background: rgba(10,10,8,.82); border: 1px solid rgba(185,167,111,.6); font-size: 18px; letter-spacing: 2px; text-align: center; max-width: 90vw; }
#specHud .wait:empty { display: none; }
#specHud .bar { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
#specHud .views { display: flex; gap: 6px; pointer-events: auto; flex-wrap: wrap; justify-content: center; }
#specHud .views button { font: inherit; min-width: 96px; padding: 8px 10px 7px; background: rgba(10,10,8,.72); color: #f1e6c8; border: 1px solid rgba(185,167,111,.45); cursor: pointer; text-align: center; position: relative; }
#specHud .views button b { display: block; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; white-space: nowrap; }
#specHud .views button small { display: block; margin-top: 3px; font: 11px/1.2 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; color: rgba(241,230,200,.6); white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis; margin-inline: auto; }
#specHud .views button.human small { color: #9cc6ec; }
#specHud .views button.on { background: #b9a76f; color: #1b1a12; border-color: #b9a76f; }
#specHud .views button.on small { color: #2b2a1c; }
#specHud .views button.fire::after { content: ''; position: absolute; top: 5px; inset-inline-end: 5px; width: 6px; height: 6px; border-radius: 50%; background: #ffb347; box-shadow: 0 0 6px #ffb347; }
#specHud .views .stop { min-width: 0; border-color: rgba(217,87,63,.6); }
#specHud .hint { font: 11px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 1.5px; color: rgba(241,230,200,.8); padding: 5px 10px; background: rgba(10,10,8,.6); unicode-bidi: plaintext; }
@keyframes specRec { 50% { opacity: .25; } }
body.spectating #hBL, body.spectating #hBR, body.spectating #abilityBar, body.spectating #crewMark, body.spectating #coopExit, body.spectating #lockHint, body.spectating #hCombo { display: none !important; }
body.spec-cine #hudCanvas { visibility: hidden; }
html[dir=rtl] #specHud .tag, html[dir=rtl] #specHud .views button b, html[dir=rtl] #specHud .hint, html[dir=rtl] #specHud .wait { letter-spacing: 0; }
html[lang=ar] #specHud .views button b { font-size: 14px; }
@media (max-width: 640px) { #specHud .views { width: 100%; } #specHud .views button { min-width: 0; flex: 1 1 30%; padding: 7px 4px; } #specHud .views button b { font-size: 11px; letter-spacing: .5px; white-space: normal; } #specHud .views button small { max-width: none; } #specHud .hint { display: none; } #specHud .top { margin-top: 30px; } }
`;

export class SpectatorHud {
  private root: HTMLElement | null = null;
  private buttons = new Map<SpecView, HTMLButtonElement>();
  private delayEl!: HTMLElement;
  private waitEl!: HTMLElement;
  private last = '';

  constructor(private pick: (v: SpecView) => void, private stop: () => void) {}

  private ensure() {
    if (this.root?.isConnected) return this.root;
    if (!document.getElementById('specCss')) {
      const s = document.createElement('style');
      s.id = 'specCss'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    const r = document.getElementById('specHud') ?? document.body.appendChild(document.createElement('div'));
    r.id = 'specHud';
    r.innerHTML = `<div class="top"><span class="tag"></span><span class="delay"></span></div><div class="wait"></div>
      <div class="bar"><div class="views"></div><div class="hint"></div></div>`;
    const views = r.querySelector('.views')!;
    this.buttons.clear();
    for (const v of SPEC_VIEWS) {
      const b = document.createElement('button');
      b.dataset.v = v;
      b.innerHTML = '<b></b><small></small>';
      b.addEventListener('click', () => this.pick(v));
      views.appendChild(b);
      this.buttons.set(v, b);
    }
    const stop = document.createElement('button');
    stop.className = 'stop';
    stop.innerHTML = '<b></b><small></small>';
    stop.addEventListener('click', () => this.stop());
    views.appendChild(stop);
    this.delayEl = r.querySelector('.delay')!;
    this.waitEl = r.querySelector('.wait')!;
    this.root = r;
    this.last = '';
    return r;
  }

  show(on: boolean) {
    if (!on && !this.root) return;
    this.ensure().classList.toggle('show', on);
    document.body.classList.toggle('spectating', on);
    if (!on) document.body.classList.remove('spec-cine');
  }

  /** Refresh (a few times a second): which view is on, who sits where, who is firing, the delay. */
  update(view: SpecView, crew: readonly CrewSeat[], myId: number, fire: number, delay: number, waiting: boolean) {
    const r = this.ensure();
    document.body.classList.toggle('spec-cine', view === 'cine');
    const sig = `${view}|${crew.map(p => `${p.id}:${p.seat}:${p.name}`).join(',')}|${fire}|${delay}|${waiting}|${document.documentElement.lang}|${document.body.classList.contains('streamer')}`;
    if (sig === this.last) return;
    this.last = sig;
    r.querySelector('.tag')!.textContent = tx('SPECTATING');
    this.delayEl.textContent = delay > 0 ? tx('Delay {n} s', { n: delay }) : '';
    this.waitEl.textContent = waiting ? tx('Waiting for the picture…') : '';
    r.querySelector('.hint')!.textContent = tx('1–5 gun positions · C cinematic · ← → switch');
    for (const [v, b] of this.buttons) {
      const who = v === 'cine' ? null : crew.find(p => p.seat === v);
      b.querySelector('b')!.textContent = v === 'cine' ? tx('Cinematic') : tx(STATIONS[v as StationId].label);
      b.querySelector('small')!.textContent = v === 'cine' ? tx('Auto camera') : who ? crewLabel(who.name, who.id, who.id === myId) : tx('AI gunner');
      b.classList.toggle('on', v === view);
      b.classList.toggle('human', !!who);
      b.classList.toggle('fire', v !== 'cine' && firesAt(fire, v as StationId));
    }
    const stop = r.querySelector('.stop')!;
    stop.querySelector('b')!.textContent = tx('Stop watching');
    stop.querySelector('small')!.textContent = tx('Leave the game');
  }
}
