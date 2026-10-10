// Replay theatre screen (DOM): timeline scrubber with best-moment ticks, transport and
// speed controls, camera modes and the aircraft list, photo settings, screenshot and
// "save moment"; plus the saved-moments library opened from the title menu.
// All logic lives in Theatre.ts behind the TheatreControl interface.
import { tx, isAr } from '../i18n';

export type CamMode = 'player' | 'orbit' | 'free' | 'director';
export const SPEEDS = [0.25, 0.5, 1, 2];

export interface PhotoSettings {
  fov: number;        // degrees; 0 = automatic (recorded / per shot)
  dof: number;        // 0..1 near-field depth of field strength
  focus: number;      // m: everything nearer than this is blurred by the DOF
  exposure: number;
  res: number;        // screenshot scale (1 = screen)
}

export interface TimelineMark { t: number; type: number; label: string; major: boolean }
export interface AircraftItem { id: number; label: string; team: number; player: boolean }

export interface TheatreControl {
  readonly t: number; readonly t0: number; readonly t1: number;
  readonly playing: boolean; readonly speed: number; readonly mode: CamMode; readonly orbitId: number;
  readonly photo: PhotoSettings; readonly title: string;
  marks(): TimelineMark[];
  aircraft(): AircraftItem[];
  present(id: number): boolean;
  togglePlay(): void; setSpeed(s: number): void; step(dir: number): void; seek(t: number): void;
  jumpMark(dir: number): void; setMode(m: CamMode): void; setOrbit(id: number): void;
  setPhoto(p: Partial<PhotoSettings>): void;
  screenshot(): Promise<string>; saveMoment(): Promise<string>;
  close(): void;
}

export interface MomentItem { key: number; title: string; created: number; duration: number; thumb: string }

const CSS = `
#theatre { position: fixed; inset: 0; z-index: 12; pointer-events: none; font-family: Oswald, "Arial Narrow", sans-serif; color: var(--ink, #e9e2cf); }
#theatre.hide .th-panel { display: none; }
#theatre .th-panel { position: absolute; pointer-events: auto; background: rgba(14,15,10,.74); border: 1px solid rgba(233,226,207,.16); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
#theatre button { font: inherit; color: inherit; background: rgba(255,255,255,.04); border: 1px solid rgba(233,226,207,.2); padding: 5px 10px; letter-spacing: 1px; cursor: pointer; text-transform: uppercase; font-size: 13px; }
#theatre button:hover { border-color: var(--khaki, #b9a76f); color: var(--khaki, #b9a76f); }
#theatre button.on { background: var(--khaki, #b9a76f); color: #1b1a12; border-color: var(--khaki, #b9a76f); }
#theatre .th-top { left: 16px; right: 16px; top: 14px; display: flex; align-items: center; gap: 12px; padding: 8px 12px; }
#theatre .th-k { font: 600 12px/1 "IBM Plex Mono", monospace; letter-spacing: 3px; color: #d9573f; }
#theatre .th-title { font-size: 17px; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#theatre .th-sp { flex: 1; }
#theatre .th-h { font: 11px/1 "IBM Plex Mono", monospace; letter-spacing: 2px; color: var(--ink-dim, #b9b19b); margin: 12px 0 7px; text-transform: uppercase; }
#theatre .th-h small { letter-spacing: 1px; opacity: .7; }
#theatre .th-h:first-child { margin-top: 0; }
#theatre .th-left { left: 16px; top: 70px; width: 214px; padding: 12px; max-height: calc(100vh - 200px); display: flex; flex-direction: column; }
#theatre .th-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
#theatre .th-list { overflow: auto; min-height: 60px; display: flex; flex-direction: column; gap: 2px; }
#theatre .th-list button { text-align: left; text-transform: none; font-size: 13px; border-color: transparent; padding: 3px 7px; display: flex; gap: 6px; align-items: center; }
#theatre .th-list button i { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #9fc26b; }
#theatre .th-list button.ax i { background: #d9573f; }
#theatre .th-list button.pl i { background: #e0b445; }
#theatre .th-list button.gone { opacity: .35; }
#theatre .th-help { margin-top: 10px; font: 10.5px/1.55 "IBM Plex Mono", monospace; color: var(--ink-dim, #b9b19b); }
#theatre .th-right { right: 16px; top: 70px; width: 236px; padding: 12px; max-height: calc(100vh - 200px); overflow: auto; }
#theatre label { display: block; font: 11px/1 "IBM Plex Mono", monospace; letter-spacing: 1px; color: var(--ink-dim, #b9b19b); margin: 9px 0 3px; text-transform: uppercase; }
#theatre label span { float: right; color: var(--ink, #e9e2cf); }
#theatre input[type=range] { width: 100%; accent-color: var(--khaki, #b9a76f); margin: 5px 0 0; }
#theatre select { width: 100%; margin-top: 5px; background: #1b1c14; color: inherit; border: 1px solid rgba(233,226,207,.2); font: 12px "IBM Plex Mono", monospace; padding: 4px; }
#theatre .th-btn { width: 100%; margin-top: 10px; padding: 8px; }
#theatre .th-status { margin-top: 8px; font: 11px/1.45 "IBM Plex Mono", monospace; color: var(--khaki, #b9a76f); min-height: 16px; }
#theatre .th-bottom { left: 16px; right: 16px; bottom: 14px; padding: 10px 14px 10px; }
#theatre .th-track { position: relative; height: 26px; cursor: pointer; touch-action: none; }
#theatre .th-track::before { content: ""; position: absolute; left: 0; right: 0; top: 11px; height: 4px; background: rgba(233,226,207,.16); }
#theatre .th-fill { position: absolute; left: 0; top: 11px; height: 4px; background: var(--khaki, #b9a76f); }
#theatre .th-head { position: absolute; top: 3px; width: 3px; height: 20px; margin-left: -1px; background: #f4ead0; box-shadow: 0 0 6px rgba(0,0,0,.8); pointer-events: none; }
#theatre .th-tick { position: absolute; top: 0; width: 9px; height: 9px; margin-left: -4.5px; transform: rotate(45deg); border: 1px solid rgba(0,0,0,.6); cursor: pointer; }
#theatre .th-tick.min { top: 18px; width: 5px; height: 5px; margin-left: -2.5px; background: var(--khaki, #b9a76f); }
#theatre .th-tick:hover { outline: 2px solid #f4ead0; }
#theatre .th-ctrl { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
#theatre .th-ctrl button { min-width: 36px; }
#theatre .th-time { font: 13px/1 "IBM Plex Mono", monospace; margin-left: 8px; letter-spacing: 1px; }
#theatre .th-mark { font: 12px/1 "Special Elite", monospace; color: var(--khaki, #b9a76f); margin-left: 10px; }
#theatre .th-hint { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); font: 11px/1 "IBM Plex Mono", monospace; letter-spacing: 2px; color: rgba(255,255,255,.55); display: none; text-shadow: 0 1px 4px #000; }
/* Arabic: the side panels mirror and read from the right; the timeline and transport stay
   left-to-right (time runs left to right) */
html[lang=ar] #theatre { font-family: Oswald, "Noto Kufi Arabic", "Arial Narrow", sans-serif; }
html[lang=ar] #theatre .th-k, html[lang=ar] #theatre .th-h, html[lang=ar] #theatre .th-help, html[lang=ar] #theatre label, html[lang=ar] #theatre select,
html[lang=ar] #theatre .th-status, html[lang=ar] #theatre .th-time, html[lang=ar] #theatre .th-hint, html[lang=ar] #theatreLib .card .d { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; }
html[lang=ar] #theatre .th-mark, html[lang=ar] #theatreLib .empty { font-family: "Special Elite", "Noto Naskh Arabic", monospace; }
html[lang=ar] #theatre .th-h, html[lang=ar] #theatre label { font-size: 12px; line-height: 1.3; }
html[lang=ar] #theatre .th-help { font-size: 11px; line-height: 1.7; }
html[dir=rtl] #theatre .th-left { left: auto; right: 16px; }
html[dir=rtl] #theatre .th-right { right: auto; left: 16px; }
html[dir=rtl] #theatre .th-list button { text-align: right; }
html[dir=rtl] #theatre label span { float: left; }
html[dir=rtl] #theatre .th-bottom { direction: ltr; }
html[dir=rtl] #theatre .th-mark { direction: rtl; unicode-bidi: isolate; }
#theatre.hide .th-hint { display: block; }
#theatreLib { position: fixed; inset: 0; z-index: 11; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.35); }
#theatreLib .box { width: min(900px, 100%); max-height: 92vh; overflow: auto; padding: 28px 32px; }
#theatreLib h2 { font-size: 32px; margin: 2px 0 18px; letter-spacing: 3px; text-transform: uppercase; }
#theatreLib .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; margin-bottom: 20px; }
#theatreLib .card { border: 1px solid var(--line, rgba(233,226,207,.18)); background: rgba(255,255,255,.03); }
#theatreLib .card img { display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; background: #111; }
#theatreLib .card .m { padding: 10px 12px; }
#theatreLib .card .t { font-size: 17px; letter-spacing: 1px; }
#theatreLib .card .d { font: 11px/1.5 "IBM Plex Mono", monospace; color: var(--ink-dim, #b9b19b); margin: 3px 0 9px; }
#theatreLib .card .btn { padding: 7px 14px; font-size: 13px; }
#theatreLib .empty { font-family: "Special Elite", monospace; color: var(--ink-dim, #b9b19b); margin: 8px 0 22px; line-height: 1.5; }
@media (max-width: 760px) {
  #theatre .th-left, #theatre .th-right { top: auto; bottom: 120px; width: calc(50% - 22px); max-height: 38vh; overflow: auto; }
}
html[dir=rtl] #theatreLib .box { text-align: right; }
`;

const TICK_COL: Record<number, string> = { 2: '#e0b445', 3: '#d9573f', 4: '#d9573f', 5: '#6fb3d9', 6: '#6fb3d9' };
const MODES: [CamMode, string][] = [['player', 'Player'], ['orbit', 'Orbit'], ['free', 'Free'], ['director', 'Director']];
const SEC = (s: string) => tx('{n} s', { n: s });

const fmt = (s: number) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function ensureCss() {
  if (document.getElementById('theatreCss')) return;
  const s = document.createElement('style');
  s.id = 'theatreCss'; s.textContent = CSS;
  document.head.appendChild(s);
}

export class TheatreScreen {
  private root: HTMLElement | null = null;
  private lib: HTMLElement | null = null;
  private c: TheatreControl | null = null;
  private els: Record<string, HTMLElement> = {};
  private listBtns = new Map<number, HTMLElement>();
  private last = { playing: false, mode: '', speed: -1, orbit: -2, mark: '' };
  private listT = 0;
  private marks: TimelineMark[] = [];
  private dragging = false;

  get open() { return !!this.root; }
  get hidden() { return !!this.root?.classList.contains('hide'); }

  show(c: TheatreControl) {
    ensureCss();
    this.close();
    this.c = c;
    const r = document.createElement('div');
    r.id = 'theatre';
    r.innerHTML = `
      <div class="th-top th-panel"><div class="th-k">${tx('REPLAY THEATRE')}</div><div class="th-title">${esc(tx(c.title))}</div><div class="th-sp"></div>
        <button data-a="hide" title="${tx('Hide the interface (H)')}">${tx('Hide UI')}</button><button data-a="exit" title="${tx('Back (Esc)')}">${tx('Exit')}</button></div>
      <div class="th-left th-panel">
        <div class="th-h">${tx('Camera')}</div>
        <div class="th-modes">${MODES.map(([m, l], i) => `<button data-m="${m}" title="${tx(l)} (${i + 1})">${tx(l)}</button>`).join('')}</div>
        <div class="th-h">${tx('Aircraft')} <small>${tx('· Tab cycles')}</small></div>
        <div class="th-list"></div>
        <div class="th-help">${tx('Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–4 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit')}</div>
      </div>
      <div class="th-right th-panel">
        <div class="th-h">${tx('Photo')}</div>
        <label>${tx('Field of view')} <span data-v="fov"></span><input type="range" data-p="fov" min="12" max="100" step="1"></label>
        <button data-a="fovauto" style="margin-top:4px;font-size:11px;padding:3px 8px">${tx('Auto FOV')}</button>
        <label>${tx('Depth of field')} <span data-v="dof"></span><input type="range" data-p="dof" min="0" max="1" step="0.05"></label>
        <label>${tx('Focus distance')} <span data-v="focus"></span><input type="range" data-p="focus" min="2" max="400" step="1"></label>
        <label>${tx('Exposure')} <span data-v="exposure"></span><input type="range" data-p="exposure" min="0.3" max="2.5" step="0.05"></label>
        <label>${tx('Resolution')}<select data-p="res"><option value="1">${tx('Screen')}</option><option value="2">${tx('2× screen')}</option><option value="3">${tx('3× screen')}</option></select></label>
        <button class="th-btn" data-a="shot">${tx('Save screenshot')}</button>
        <div class="th-h" style="margin-top:16px">${tx('Moments')}</div>
        <button class="th-btn" data-a="moment" title="${tx('Keep the 15 s around the playhead (up to 5 saved)')}">${tx('Save moment')}</button>
        <div class="th-status"></div>
      </div>
      <div class="th-bottom th-panel">
        <div class="th-track"><div class="th-fill"></div><div class="th-ticks"></div><div class="th-head"></div></div>
        <div class="th-ctrl">
          <button data-a="prevmark" title="${tx('Previous moment (,)')}">⏮</button>
          <button data-a="back" title="${tx('Step back one frame (←)')}">◂|</button>
          <button data-a="play" title="${tx('Play / pause (Space)')}">▶</button>
          <button data-a="fwd" title="${tx('Step forward one frame (→)')}">|▸</button>
          <button data-a="nextmark" title="${tx('Next moment (.)')}">⏭</button>
          <span class="th-time"></span><span class="th-mark"></span>
          <span class="th-sp"></span>
          ${SPEEDS.map((s) => `<button data-s="${s}">${s}×</button>`).join('')}
        </div>
      </div>
      <div class="th-hint">${tx('H — SHOW INTERFACE')}</div>`;
    document.body.appendChild(r);
    this.root = r;
    const q = (s: string) => r.querySelector<HTMLElement>(s)!;
    this.els = {
      fill: q('.th-fill'), head: q('.th-head'), ticks: q('.th-ticks'), track: q('.th-track'), time: q('.th-time'),
      mark: q('.th-mark'), play: q('[data-a="play"]'), list: q('.th-list'), status: q('.th-status'),
    };
    r.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => this.action(b.dataset.a!)));
    r.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.addEventListener('click', () => c.setMode(b.dataset.m as CamMode)));
    r.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.addEventListener('click', () => c.setSpeed(+b.dataset.s!)));
    r.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-p]').forEach((inp) => inp.addEventListener('input', () => {
      c.setPhoto({ [inp.dataset.p!]: +inp.value } as Partial<PhotoSettings>);
      this.syncPhoto();
    }));
    // buttons keep no focus: Space/arrows stay with the theatre
    r.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
    this.bindTrack();
    this.refreshMarks();
    this.buildList();
    this.syncPhoto();
    this.last = { playing: !c.playing, mode: '', speed: -1, orbit: -2, mark: '' };
    this.update(1);
  }

  close() {
    this.root?.remove();
    this.root = null;
    this.c = null;
    this.listBtns.clear();
  }

  toggleHidden() { this.root?.classList.toggle('hide'); }

  status(text: string) { if (this.els.status) this.els.status.textContent = tx(text); }

  /** Rebuilds the moment ticks (after a save the list is the same; on open it changes). */
  refreshMarks() {
    const c = this.c;
    if (!c || !this.root) return;
    this.marks = c.marks();
    const span = Math.max(1e-6, c.t1 - c.t0);
    this.els.ticks.innerHTML = this.marks.map((m, i) => {
      const left = ((m.t - c.t0) / span) * 100;
      const col = TICK_COL[m.type];
      return `<div class="th-tick${m.major ? '' : ' min'}" data-i="${i}" title="${esc(tx(m.label))} · ${fmt(m.t - c.t0)}" style="left:${left.toFixed(3)}%${m.major && col ? `;background:${col}` : ''}"></div>`;
    }).join('');
    this.els.ticks.querySelectorAll<HTMLElement>('.th-tick').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const m = this.marks[+el.dataset.i!];
        if (m) { c.seek(m.t - 2); if (!c.playing) c.togglePlay(); }
      });
    });
  }

  private buildList() {
    const c = this.c!;
    const list = this.els.list;
    list.innerHTML = '';
    this.listBtns.clear();
    for (const a of c.aircraft()) {
      const b = document.createElement('button');
      b.className = a.player ? 'pl' : a.team === 1 ? 'ax' : '';
      b.innerHTML = `<i></i><bdi>${esc(tx(a.label))}</bdi>`;
      b.addEventListener('click', () => c.setOrbit(a.id));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      list.appendChild(b);
      this.listBtns.set(a.id, b);
    }
  }

  private syncPhoto() {
    const c = this.c, r = this.root;
    if (!c || !r) return;
    const p = c.photo;
    const set = (k: string, v: number, txt: string) => {
      const inp = r.querySelector<HTMLInputElement>(`[data-p="${k}"]`);
      if (inp && document.activeElement !== inp) inp.value = String(v);
      const lab = r.querySelector(`[data-v="${k}"]`);
      if (lab) lab.textContent = txt;
    };
    set('fov', p.fov || 50, p.fov ? `${Math.round(p.fov)}°` : tx('auto'));
    set('dof', p.dof, p.dof ? p.dof.toFixed(2) : tx('off'));
    set('focus', p.focus, tx('{n} m', { n: Math.round(p.focus) }));
    set('exposure', p.exposure, p.exposure.toFixed(2));
    const sel = r.querySelector<HTMLSelectElement>('[data-p="res"]');
    if (sel) sel.value = String(p.res);
  }

  private bindTrack() {
    const tr = this.els.track;
    const seekAt = (x: number) => {
      const c = this.c;
      if (!c) return;
      const b = tr.getBoundingClientRect();
      c.seek(c.t0 + Math.min(1, Math.max(0, (x - b.left) / Math.max(1, b.width))) * (c.t1 - c.t0));
    };
    tr.addEventListener('pointerdown', (e) => { this.dragging = true; tr.setPointerCapture(e.pointerId); seekAt(e.clientX); });
    tr.addEventListener('pointermove', (e) => { if (this.dragging) seekAt(e.clientX); });
    const up = () => { this.dragging = false; };
    tr.addEventListener('pointerup', up);
    tr.addEventListener('pointercancel', up);
  }

  private action(a: string) {
    const c = this.c;
    if (!c) return;
    switch (a) {
      case 'hide': this.toggleHidden(); break;
      case 'exit': c.close(); break;
      case 'play': c.togglePlay(); break;
      case 'back': c.step(-1); break;
      case 'fwd': c.step(1); break;
      case 'prevmark': c.jumpMark(-1); break;
      case 'nextmark': c.jumpMark(1); break;
      case 'fovauto': c.setPhoto({ fov: 0 }); this.syncPhoto(); break;
      case 'shot': this.status('Rendering…'); c.screenshot().then((s) => this.status(s)); break;
      case 'moment': this.status('Saving…'); c.saveMoment().then((s) => this.status(s)); break;
    }
  }

  /** Per frame while the theatre is open. */
  update(real: number) {
    const c = this.c, e = this.els;
    if (!c || !this.root) return;
    const span = Math.max(1e-6, c.t1 - c.t0);
    const u = Math.min(1, Math.max(0, (c.t - c.t0) / span)) * 100;
    e.fill.style.width = `${u.toFixed(2)}%`;
    e.head.style.left = `${u.toFixed(2)}%`;
    e.time.textContent = `${fmt(c.t - c.t0)} / ${fmt(span)}`;
    const L = this.last;
    if (L.playing !== c.playing) { L.playing = c.playing; e.play.textContent = c.playing ? '❚❚' : '▶'; }
    if (L.mode !== c.mode) {
      L.mode = c.mode;
      this.root.querySelectorAll<HTMLElement>('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === c.mode));
    }
    if (L.speed !== c.speed) {
      L.speed = c.speed;
      this.root.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.classList.toggle('on', +b.dataset.s! === c.speed));
    }
    if (L.orbit !== c.orbitId || this.listT <= 0) {
      if (L.orbit !== c.orbitId) for (const [id, b] of this.listBtns) b.classList.toggle('on', id === c.orbitId && c.mode === 'orbit');
      L.orbit = c.orbitId;
    }
    // aircraft presence and the nearest moment label, a few times a second
    this.listT -= real;
    if (this.listT <= 0) {
      this.listT = 0.25;
      for (const [id, b] of this.listBtns) {
        b.classList.toggle('gone', !c.present(id));
        b.classList.toggle('on', id === c.orbitId && c.mode === 'orbit');
      }
      let label = '';
      for (const m of this.marks) if (m.major && Math.abs(m.t - c.t) < 2.5) { label = `✦ ${tx(m.label)}`; break; }
      if (label !== L.mark) { L.mark = label; e.mark.textContent = label; }
    }
  }

  // ---------------- saved moments library (title menu) ----------------

  get libraryOpen() { return !!this.lib; }

  showLibrary(items: MomentItem[], h: { play(key: number): void; remove(key: number): void; back(): void }) {
    ensureCss();
    this.hideLibrary();
    const d = document.createElement('div');
    d.id = 'theatreLib';
    // Arabic month names with Western digits, like the rest of the Arabic interface
    const date = (ms: number) => new Date(ms).toLocaleString(isAr() ? 'ar-u-nu-latn' : undefined, { dateStyle: isAr() ? 'long' : 'medium', timeStyle: 'short' });
    d.innerHTML = `<div class="box panel">
      <div class="kicker">${tx('REPLAY THEATRE')}</div>
      <h2>${tx('Saved moments')}</h2>
      ${items.length ? `<div class="cards">${items.map((m) => `
        <div class="card">${m.thumb ? `<img src="${m.thumb}" alt="">` : '<img alt="">'}
          <div class="m"><div class="t">${esc(tx(m.title))}</div><div class="d">${date(m.created)} · ${SEC(m.duration.toFixed(1))}</div>
          <div class="row"><button class="btn" data-play="${m.key}">${tx('Watch')}</button><button class="btn ghost" data-del="${m.key}">${tx('Delete')}</button></div></div>
        </div>`).join('')}</div>`
        : `<div class="empty">${tx('No saved moments yet. After a mission, open the Replay theatre from the debriefing and press “Save moment” (up to 5 are kept).')}</div>`}
      <div class="row"><button class="btn ghost" data-a="back">${tx('Back')}</button></div>
    </div>`;
    document.body.appendChild(d);
    this.lib = d;
    d.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => b.addEventListener('click', () => h.play(+b.dataset.play!)));
    d.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => b.addEventListener('click', () => h.remove(+b.dataset.del!)));
    d.querySelector('[data-a="back"]')!.addEventListener('click', () => h.back());
  }

  setLibraryVisible(on: boolean) { if (this.lib) this.lib.style.display = on ? '' : 'none'; }

  hideLibrary() {
    this.lib?.remove();
    this.lib = null;
  }
}
