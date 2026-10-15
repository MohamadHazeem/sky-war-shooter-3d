// Crew intercom UI (game/CrewIntercom.ts drives it): a small panel in the co-op lobby (hold-to-talk
// button, microphone state, per-crewman mute and volume, intercom volume) and, in a mission, a
// hold-to-talk button beside "Ping target" plus a strip naming whoever is talking. English in the
// code, shown through tx() (Arabic: i18n/ar/intercom.ts).
import { tx } from '../i18n';

export type MicState = 'off' | 'asking' | 'on' | 'blocked';
export interface IntercomRow { id: number; name: string; muted: boolean; volume: number }
export interface IntercomHudHandlers {
  hold(down: boolean): void;
  mute(id: number): void;
  volume(id: number, v: number): void;
  master(v: number): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const CSS = `
#coop .intercom { margin: 4px 0 16px; padding: 10px 12px; background: rgba(0,0,0,0.28); border: 1px solid var(--line); }
#coop .intercom .ictop { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
#coop .intercom [data-ic-talk] { font-size: 12px; padding: 8px 14px; letter-spacing: 1px; }
#coop .intercom .icmic { font-size: 13px; color: var(--ink-dim); }
#coop .intercom .icmic.on { color: #9fd38a; } #coop .intercom .icmic.blocked { color: #f08a6c; }
#coop .intercom .icrow { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 14px; }
#coop .intercom .icrow b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
#coop .intercom .icrow input[type=range], #coop .intercom .icvol input { width: 110px; accent-color: var(--khaki); }
#coop .intercom .icvol { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; color: var(--ink-dim); }
#coop .intercom .icrow .btn { font-size: 11px; padding: 6px 10px; }
#coop .intercom .icrow.muted b { color: var(--ink-dim); text-decoration: line-through; }
.icdot { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.15); flex: none; }
.talking .icdot, .icdot.talking { background: #7ed36a; box-shadow: 0 0 6px #7ed36a; }
[data-ic-talk].held, #icTalk.held { background: #7ed36a !important; color: #13200f !important; border-color: #7ed36a !important; }
#icTalk { position: fixed; top: 31%; right: 12px; z-index: 60; display: none; font-size: 11px; touch-action: none; user-select: none; -webkit-user-select: none; }
#icWho { position: fixed; top: 32px; left: 50%; transform: translateX(-50%); z-index: 40; display: none; gap: 6px; pointer-events: none; }
#icWho.show { display: flex; }
#icWho span { display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px; background: rgba(12,12,8,0.78); border: 1px solid rgba(126,211,106,0.55); color: var(--ink); font-size: 13px; letter-spacing: 0.5px; white-space: nowrap; }
#icWho span.muted { opacity: 0.55; text-decoration: line-through; }
html[lang=ar] #icWho span, html[lang=ar] #coop .intercom [data-ic-talk] { font-size: 12px; padding: 8px 14px; letter-spacing: 1px; }
#coop .intercom .icmic { font-size: 14px; line-height: 1.6; }
@media (max-width: 520px) { #coop .intercom .icrow input[type=range] { width: 80px; } }
`;

// Hold handlers for a push-to-talk button (mouse, touch and pen; released if the pointer leaves)
function holdable(b: HTMLElement, hold: (down: boolean) => void) {
  const up = () => { b.classList.remove('held'); hold(false); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* */ } b.classList.add('held'); hold(true); });
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); b.classList.add('held'); hold(true); } });
  b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
}

export class IntercomHud {
  private talk: HTMLButtonElement;
  private who: HTMLElement;
  private whoKey = '';

  constructor(private h: IntercomHudHandlers) {
    if (!document.getElementById('intercomStyle')) {
      const st = document.createElement('style'); st.id = 'intercomStyle'; st.textContent = CSS; document.head.appendChild(st);
    }
    this.talk = (document.getElementById('icTalk') as HTMLButtonElement) ?? document.body.appendChild(document.createElement('button'));
    this.talk.id = 'icTalk'; this.talk.className = 'btn ghost';
    holdable(this.talk, (d) => this.h.hold(d));
    this.who = document.getElementById('icWho') ?? document.body.appendChild(document.createElement('div'));
    this.who.id = 'icWho'; this.who.setAttribute('aria-live', 'polite');
  }

  // The lobby's intercom panel (re-rendered with the lobby)
  lobby(el: HTMLElement, key: string, mic: MicState, rows: readonly IntercomRow[], master: number, talking: (id: number) => boolean) {
    el.className = 'intercom';
    el.innerHTML = `<div class="hud-label">${tx('Crew intercom')}</div>
      <div class="ictop"><button class="btn ghost" data-ic-talk>${tx('Hold to talk')} (${esc(key)})</button><span class="icmic" data-ic-mic></span></div>
      ${rows.map(r => `<div class="icrow ${r.muted ? 'muted' : ''} ${talking(r.id) ? 'talking' : ''}" data-ic-row="${r.id}"><i class="icdot" title="${esc(tx('Talking'))}"></i><b>${esc(r.name)}</b>
        <input type="range" min="0" max="100" value="${Math.round(r.volume * 100)}" data-ic-vol="${r.id}" aria-label="${esc(tx('Volume of {name}', { name: r.name }))}" />
        <button class="btn ghost" data-ic-mute="${r.id}" aria-pressed="${r.muted}">${tx(r.muted ? 'Unmute' : 'Mute')}</button></div>`).join('')}
      <label class="icvol">${tx('Intercom volume')} <input type="range" min="0" max="100" value="${Math.round(master * 100)}" data-ic-master /></label>`;
    holdable(el.querySelector<HTMLElement>('[data-ic-talk]')!, (d) => this.h.hold(d));
    el.querySelectorAll<HTMLButtonElement>('[data-ic-mute]').forEach(b => b.addEventListener('click', () => this.h.mute(Number(b.dataset.icMute))));
    el.querySelectorAll<HTMLInputElement>('[data-ic-vol]').forEach(i => i.addEventListener('input', () => this.h.volume(Number(i.dataset.icVol), Number(i.value) / 100)));
    const m = el.querySelector<HTMLInputElement>('[data-ic-master]')!;
    m.addEventListener('input', () => this.h.master(Number(m.value) / 100));
    this.micState(mic);
  }

  micState(mic: MicState) {
    const el = document.querySelector<HTMLElement>('#coop [data-ic-mic]');
    if (!el) return;
    const text = tx(mic === 'on' ? 'Microphone on' : mic === 'asking' ? 'Asking for the microphone…' : mic === 'blocked' ? 'Microphone blocked — allow it in the browser to talk' : 'The microphone turns on the first time you talk');
    if (el.textContent !== text) el.textContent = text;
    el.className = `icmic ${mic}`;
  }

  // In a mission: the talk button and the strip of names; in the lobby: the rows' talking dots
  update(inMission: boolean, key: string, local: boolean, talkers: readonly { id: number; name: string; muted: boolean }[]) {
    const display = inMission ? 'block' : 'none';
    if (this.talk.style.display !== display) this.talk.style.display = display;
    const label = `${tx('Hold to talk')} (${key})`;
    if (this.talk.textContent !== label) this.talk.textContent = label;
    this.talk.classList.toggle('held', local);
    document.querySelectorAll<HTMLElement>('#coop [data-ic-talk]').forEach(b => b.classList.toggle('held', local));
    document.querySelectorAll<HTMLElement>('#coop [data-ic-row]').forEach(r => r.classList.toggle('talking', talkers.some(t => t.id === Number(r.dataset.icRow))));
    const names = inMission ? [...(local ? [{ id: -1, name: tx('You'), muted: false }] : []), ...talkers] : [];
    const k = names.map(n => `${n.id}:${n.name}:${n.muted}`).join('|');
    if (k === this.whoKey) return;
    this.whoKey = k;
    this.who.innerHTML = names.map(n => `<span class="${n.muted ? 'muted' : ''}"><i class="icdot talking"></i>${esc(n.name)}</span>`).join('');
    this.who.classList.toggle('show', names.length > 0);
  }
}
