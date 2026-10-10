import type { Mission } from '../game/Missions';
import { STATION_ORDER, STATIONS, StationId } from '../world/B17Layout';
import { sound } from '../audio/Sound';
import { playMedalFanfare } from '../audio/Fanfare';

// Debrief medal timing (seconds): first badge after the result line, then one every half second
const medalDelay = (i: number) => 0.8 + i * 0.5;

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  volume: number;
  radio: boolean;
  music: boolean;
  quality: 'low' | 'medium' | 'high';
  markers: boolean;
  flightMode: 'mouseAim' | 'direct';
  difficulty: 'recruit' | 'veteran' | 'ace';
}

export interface Progress { unlocked: number; medals: Record<string, string[]>; best: Record<string, number>; survival: { name: string; score: number; waves: number; role: string; date: string }[] }

export interface DebriefData {
  success: boolean;
  title: string;
  reason: string;
  kills: number;
  accuracy: number;
  bombersLost: number;
  bombersTotal: number;
  time: number;
  score: number;
  medals: string[];
  waves?: number;
  survival?: boolean;
  nextAvailable: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class UI {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private subsTimer: number | null = null;
  private bannerTimer: number | null = null;

  constructor() {
    document.body.insertAdjacentHTML('beforeend', `
      <canvas id="hudCanvas"></canvas>
      <div id="vignetteRed"></div>
      <div id="fade"></div>
      <div id="loading" class="layer show"><div class="title">SKY WAR SHOOTER 3D</div><div class="bar"><div></div></div><div class="msg">Preparing the aircraft…</div></div>
      <div id="title" class="layer"></div>
      <div id="campaign" class="layer"></div>
      <div id="briefing" class="layer"></div>
      <div id="survival" class="layer"></div>
      <div id="hud" class="layer"></div>
      <div id="pause" class="layer"></div>
      <div id="settings" class="layer"></div>
      <div id="debrief" class="layer"></div>
      <div id="credits" class="layer"></div>
    `);
    this.canvas = $('#hudCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    addEventListener('resize', resize);
    resize();
  }

  private show(id: string) {
    document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l.id === id || (id === 'hud+' && l.id === 'hud')));
  }
  hideAll() { document.querySelectorAll('.layer').forEach((l) => l.classList.remove('show')); }

  loading(f: number, msg?: string) {
    ($('#loading .bar div')).style.width = `${Math.round(f * 100)}%`;
    if (msg) $('#loading .msg').textContent = msg;
  }

  fade(on: boolean) { $('#fade').style.opacity = on ? '1' : '0'; }
  fadeTo(a: number) { $('#fade').style.transition = 'none'; $('#fade').style.opacity = String(a); requestAnimationFrame(() => ($('#fade').style.transition = '')); }

  title(h: { campaign(): void; survival(): void; settings(): void; credits(): void }) {
    const t = $('#title');
    // Cinematic dressing (letterbox, film grain, scratches, stencil tag) is decorative and
    // pointer-events:none, so the buttons below keep their handlers untouched.
    t.innerHTML = `
      <div class="tt-bars" aria-hidden="true"><i></i><i></i></div>
      <div class="tt-stencil">8TH AIR FORCE</div>
      <div class="wrap">
        <div class="eyebrow">EIGHTH AIR FORCE · 1943–1944</div>
        <h1>Sky War<br/><span>Shooter</span> 3D</h1>
        <div class="sub">Man the guns of a B-17 Flying Fortress. Fly escort in a P-51 Mustang.</div>
        <div class="menu">
          <button data-a="campaign">Campaign <small>7 missions</small></button>
          <button data-a="survival">Survival <small>endless waves</small></button>
          <button data-a="settings">Settings</button>
          <button data-a="credits">Credits</button>
        </div>
      </div>
      <div class="foot">Mouse + keyboard · Chrome / Edge / Firefox / Safari recommended</div>
      <div class="tt-grain" aria-hidden="true"></div>
      <div class="tt-scratch" aria-hidden="true"></div>`;
    t.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => (h as any)[b.dataset.a!]()));
    // Arrow keys move between menu items (Tab still works natively); the listener lives on
    // the freshly built .menu, so repeated title() calls never stack handlers.
    const menu = t.querySelector<HTMLElement>('.menu');
    menu?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
      const i = items.indexOf(e.target as HTMLButtonElement);
      const next = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      e.preventDefault();
      items[next].focus();
    });
    this.show('title');
  }

  campaign(missions: Mission[], prog: Progress, onPick: (m: Mission) => void, onBack: () => void) {
    const c = $('#campaign');
    c.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">401ST BOMB SQUADRON · OPERATIONS</div>
      <h2>Campaign</h2>
      <div class="missions">${missions.map((m, i) => `
        <button class="mcard" data-i="${i}" ${i > prog.unlocked ? 'disabled' : ''}>
          <span class="role">${m.role === 'gunner' ? 'B-17 · ' + STATIONS[m.station ?? 'waistL'].label : 'P-51D'}</span>
          <div class="num">MISSION ${String(m.number).padStart(2, '0')} · ${esc(m.date)}</div>
          <div class="t">${esc(m.title)}</div>
          <div class="tg">${esc(m.target)}</div>
          <div class="medals">${(prog.medals[m.id] ?? []).join(' · ')}${prog.best[m.id] ? ` · best ${prog.best[m.id]}` : ''}</div>
        </button>`).join('')}
      </div>
      <div class="row"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    c.querySelectorAll<HTMLButtonElement>('.mcard').forEach((b) => b.addEventListener('click', () => onPick(missions[+b.dataset.i!])));
    c.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('campaign');
  }

  survivalMenu(prog: Progress, onPick: (role: 'gunner' | 'pilot') => void, onBack: () => void) {
    const s = $('#survival');
    s.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">ENDLESS WAVES</div><h2 class="h2">Survival</h2>
      <p style="color:var(--ink-dim);font-size:15px;line-height:1.5">Waves of Fw 190s, each one larger and more aggressive than the last. Bombers lost between waves are not replaced.</p>
      <div class="row" style="margin:18px 0"><button class="btn" data-r="gunner">B-17 Gunner</button><button class="btn" data-r="pilot">P-51 Escort</button></div>
      <div class="hud-label">Best scores</div>
      <table class="leader">${prog.survival.slice(0, 8).map((r, i) => `<tr><td>${i + 1}</td><td>${r.role === 'pilot' ? 'P-51' : 'B-17'}</td><td>${r.waves} waves</td><td style="text-align:right">${r.score}</td><td style="text-align:right;color:var(--ink-dim)">${esc(r.date)}</td></tr>`).join('') || '<tr><td style="color:var(--ink-dim)">No scores yet</td></tr>'}</table>
      <div class="row" style="margin-top:20px"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    s.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.r as any)));
    s.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('survival');
  }

  briefing(m: Mission, onStart: () => void, onBack: () => void) {
    const b = $('#briefing');
    const gunnerControls = `<div><kbd>Mouse</kbd> traverse gun</div><div><kbd>LMB</kbd> fire (short bursts)</div><div><kbd>RMB</kbd> look down the sight</div><div><kbd>1</kbd>–<kbd>5</kbd> change gun position</div><div><kbd>R</kbd> reload</div><div><kbd>Esc</kbd> pause</div>`;
    const pilotControls = `<div><kbd>Mouse</kbd> aim / fly (mouse aim)</div><div><kbd>LMB</kbd>/<kbd>Space</kbd> fire</div><div><kbd>W</kbd>/<kbd>S</kbd> throttle</div><div><kbd>Q</kbd>/<kbd>E</kbd> roll · <kbd>A</kbd>/<kbd>D</kbd> rudder</div><div><kbd>V</kbd> cockpit / chase view</div><div><kbd>C</kbd> free look · <kbd>M</kbd> flight mode</div><div><kbd>RMB</kbd> zoom · <kbd>Esc</kbd> pause</div>`;
    b.innerHTML = `<div class="screen-center"><div class="sheet">
      <div class="stamp">SECRET</div>
      <div class="hdr"><span>HQ 401ST BOMB SQUADRON (H) · FIELD ORDER</span><span>${esc(m.date)}</span></div>
      <div class="kicker" style="color:#6b5a2a">${m.number ? `MISSION No. ${m.number}` : 'SURVIVAL'}</div>
      <h2>${esc(m.title)}</h2>
      <div class="target">TARGET: ${esc(m.target)} &nbsp;·&nbsp; ASSIGNMENT: ${m.role === 'gunner' ? 'B-17G "Sky Queen" — ' + STATIONS[m.station ?? 'waistL'].label : 'P-51D Mustang — close escort'}</div>
      ${m.briefing.map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="obj"><b>OBJECTIVES</b>${m.objectives.map((o) => `<div>☐ ${esc(o)}</div>`).join('')}</div>
      <div class="controls">${m.role === 'gunner' ? gunnerControls : pilotControls}</div>
      <div class="row"><button class="btn" data-go>Man your station</button><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    b.querySelector('[data-go]')!.addEventListener('click', onStart);
    b.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('briefing');
  }

  // ---------------- HUD ----------------
  hud(role: 'gunner' | 'pilot') {
    const h = $('#hud');
    h.innerHTML = `
      <div class="hud-tl hud-text">
        <div class="hud-label" id="hMission"></div>
        <div class="objective" id="hObjective"></div>
      </div>
      <div class="hud-tr hud-text">
        <div class="hud-label">Kills</div><div class="hud-big" id="hKills">0</div>
        <div class="hud-label" style="margin-top:6px">Score</div><div class="mono" id="hScore" style="font-size:18px">0</div>
        <div class="hud-label" style="margin-top:6px">Formation</div><div class="mono" id="hFormation" style="font-size:16px"></div>
      </div>
      <div id="feed"></div>
      <div class="hud-bl hud-text" id="hBL"></div>
      <div class="hud-br hud-text" id="hBR"></div>
      <div id="subs"></div>
      <div id="banner"><div class="b1" id="bannerA"></div><div class="b2" id="bannerB"></div></div>
      <div id="tip"></div>
      <div id="lockHint">CLICK TO TAKE CONTROL</div>`;
    if (role === 'gunner') {
      $('#hBL').innerHTML = `
        <div class="hud-label" id="hStation"></div>
        <div class="hud-big mono" id="hAmmo">600</div>
        <div class="hud-label" style="margin-top:4px">Barrel</div>
        <div class="meter" id="hHeatM"><div id="hHeat" style="width:0%"></div></div>
        <div class="stations" id="hStations">${STATION_ORDER.map((s) => `<span data-s="${s}">${STATIONS[s].key} ${STATIONS[s].label.toUpperCase()}</span>`).join('')}</div>`;
      $('#hBR').innerHTML = `<div class="hud-label">Sky Queen</div><div id="dmg">${b17Svg()}</div><div class="hud-label" id="hCrew"></div>`;
    } else {
      $('#hBL').innerHTML = `<div class="instr">
        <div class="hud-label">IAS mph</div><div class="hud-label">ALT ft</div><div class="hud-label">THR</div><div class="hud-label">G</div><div class="hud-label">AMMO</div>
        <div class="v" id="iSpd">0</div><div class="v" id="iAlt">0</div><div class="v" id="iThr">0</div><div class="v" id="iG">1.0</div><div class="v" id="iAmmo">0</div>
      </div><div class="hud-label" id="iMode" style="margin-top:6px"></div>`;
      $('#hBR').innerHTML = `<div class="hud-label">Mustang</div><div id="dmg">${p51Svg()}</div>`;
    }
    this.show('hud');
  }

  showLockHint(on: boolean) { const e = document.getElementById('lockHint'); if (e) e.classList.toggle('show', on); }

  setText(id: string, t: string) { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; }

  updateGunnerHud(d: { station: StationId; ammo: number; heat: number; overheated: boolean; reloading: number; zones: Record<string, number>; crew: string }) {
    this.setText('hStation', STATIONS[d.station].label + (d.reloading > 0 ? ' — RELOADING' : d.overheated ? ' — BARREL HOT' : ''));
    this.setText('hAmmo', String(d.ammo));
    const h = document.getElementById('hHeat');
    if (h) h.style.width = `${Math.round(Math.min(1, d.heat) * 100)}%`;
    document.getElementById('hHeatM')?.classList.toggle('hot', d.overheated || d.heat > 0.8);
    document.querySelectorAll('#hStations span').forEach((s) => s.classList.toggle('on', (s as HTMLElement).dataset.s === d.station));
    for (const [k, v] of Object.entries(d.zones)) {
      const z = document.querySelector(`#dmg [data-z="${k}"]`) as SVGElement | null;
      if (z) z.setAttribute('fill', zoneColor(v));
    }
    this.setText('hCrew', d.crew);
  }

  updatePilotHud(d: { speed: number; alt: number; thr: number; g: number; ammo: number; mode: string; zones: Record<string, number> }) {
    this.setText('iSpd', String(Math.round(d.speed * 2.237)));
    this.setText('iAlt', String(Math.round(d.alt * 3.281 / 10) * 10));
    this.setText('iThr', `${Math.round(d.thr * 100)}%`);
    this.setText('iG', d.g.toFixed(1));
    this.setText('iAmmo', String(d.ammo));
    this.setText('iMode', d.mode);
    for (const [k, v] of Object.entries(d.zones)) {
      const z = document.querySelector(`#dmg [data-z="${k}"]`) as SVGElement | null;
      if (z) z.setAttribute('fill', zoneColor(v));
    }
  }

  updateCommon(d: { mission: string; objective: string; kills: number; score: number; formation: string }) {
    this.setText('hMission', d.mission);
    this.setText('hObjective', d.objective);
    this.setText('hKills', String(d.kills));
    this.setText('hScore', String(d.score));
    this.setText('hFormation', d.formation);
  }

  subtitle(who: string, text: string) {
    const s = document.getElementById('subs');
    if (!s) return;
    s.innerHTML = `<div class="line"><span class="who">${esc(who)}</span>${esc(text)}</div>`;
    if (this.subsTimer) clearTimeout(this.subsTimer);
    this.subsTimer = window.setTimeout(() => { s.innerHTML = ''; }, 2600 + text.length * 45);
  }

  feed(text: string, kind: 'mine' | 'loss' | '' = '') {
    const f = document.getElementById('feed');
    if (!f) return;
    const d = document.createElement('div');
    d.className = kind;
    d.textContent = text;
    f.prepend(d);
    while (f.children.length > 5) f.lastChild!.remove();
    setTimeout(() => d.remove(), 6000);
  }

  banner(a: string, b: string, ms = 3000) {
    const e = document.getElementById('banner');
    if (!e) return;
    this.setText('bannerA', a); this.setText('bannerB', b);
    e.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => e.classList.remove('show'), ms);
  }

  tip(text: string, ms = 5000) {
    const e = document.getElementById('tip');
    if (!e) return;
    e.innerHTML = text;
    e.classList.add('show');
    window.setTimeout(() => { if (e.innerHTML === text) e.classList.remove('show'); }, ms);
  }

  redVignette(a: number) { $('#vignetteRed').style.opacity = String(Math.min(1, a)); }

  pause(h: { resume(): void; restart(): void; settings(): void; quit(): void }, role: 'gunner' | 'pilot' = 'gunner') {
    const p = $('#pause');
    const keys = role === 'gunner'
      ? 'Mouse aim · LMB fire · RMB sight · 1–5 gun positions · R reload'
      : 'Mouse aim/fly · LMB/Space fire · W/S throttle · Q/E roll · A/D rudder · V view · C free look · M control mode';
    p.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">INTERPHONE SILENT</div><h2 class="h2">Paused</h2>
      <div class="menu" style="margin-top:18px">
        <button data-a="resume">Resume</button><button data-a="restart">Restart mission</button><button data-a="settings">Settings</button><button data-a="quit">Abort to menu</button>
      </div>
      <div class="mono" style="margin-top:20px;font-size:12px;color:var(--ink-dim);line-height:1.6">${keys}</div></div></div>`;
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => (h as any)[b.dataset.a!]()));
    p.classList.add('show');
  }
  hidePause() { $('#pause').classList.remove('show'); }

  settings(s: Settings, onChange: (s: Settings) => void, onBack: () => void) {
    const st = $('#settings');
    st.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">CONFIGURATION</div><h2 class="h2">Settings</h2>
      <label class="setting">Difficulty <select data-k="difficulty"><option value="recruit" ${s.difficulty === 'recruit' ? 'selected' : ''}>Recruit (lead indicator)</option><option value="veteran" ${s.difficulty === 'veteran' ? 'selected' : ''}>Veteran</option><option value="ace" ${s.difficulty === 'ace' ? 'selected' : ''}>Ace</option></select></label>
      <label class="setting">Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.05" data-k="sensitivity" value="${s.sensitivity}"></label>
      <label class="setting">Invert mouse Y <select data-k="invertY"><option value="false">Off</option><option value="true" ${s.invertY ? 'selected' : ''}>On</option></select></label>
      <label class="setting">Volume <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"></label>
      <label class="setting">Music <select data-k="music"><option value="true">On</option><option value="false" ${!s.music ? 'selected' : ''}>Off</option></select></label>
      <label class="setting">Radio voices <select data-k="radio"><option value="true">On</option><option value="false" ${!s.radio ? 'selected' : ''}>Subtitles only</option></select></label>
      <label class="setting">Graphics quality <select data-k="quality">${['low', 'medium', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <label class="setting">Target markers <select data-k="markers"><option value="true">On</option><option value="false" ${!s.markers ? 'selected' : ''}>Off (realistic)</option></select></label>
      <label class="setting">P-51 flight controls <select data-k="flightMode"><option value="mouseAim">Mouse aim</option><option value="direct" ${s.flightMode === 'direct' ? 'selected' : ''}>Direct (mouse = stick)</option></select></label>
      <div class="row" style="margin-top:22px"><button class="btn" data-back>Done</button></div>
    </div></div>`;
    st.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((i) => i.addEventListener('input', () => {
      const k = i.dataset.k as keyof Settings;
      let v: any = i.value;
      if (k === 'sensitivity' || k === 'volume') v = parseFloat(v);
      if (k === 'invertY' || k === 'radio' || k === 'markers' || k === 'music') v = v === 'true';
      (s as any)[k] = v;
      onChange(s);
    }));
    st.querySelector('[data-back]')!.addEventListener('click', () => { st.classList.remove('show'); onBack(); });
    st.classList.add('show');
  }

  credits(onBack: () => void) {
    const c = $('#credits');
    c.innerHTML = `<div class="screen-center"><div class="box panel credits">
      <div class="kicker">CREDITS</div><h2 class="h2">Sky War Shooter 3D</h2>
      <p>Game design, code, volumetric sky, effects and procedural audio: built with Three.js.</p>
      <p>Aircraft models from the FlightGear open-source hangar (GPL-2.0): Boeing B-17G, Focke-Wulf Fw 190 A-8 and North American P-51D. See public/models/CREDITS.md for authors.</p>
      <p>Sound effects from Freesound.org contributors (CC0 / CC BY — Fight2FlyPhoto, mattew, zimbot, poissonmort, juskiddink, Halleck and others) and music by Kevin MacLeod (incompetech.com, CC BY 4.0: "For the Fallen", "Clenched Teeth", "Constance", "Long Road Ahead", "Taps"). Full list: public/audio/CREDITS.md.</p>
      <p>Visual reference: the B-17 waist gunner shot in Yarnhub's animated short "When a B-17 Pilot Attacked the Copilot". All characters and bomber names in this game are fictional.</p>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    c.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('credits');
  }

  debrief(d: DebriefData, h: { next(): void; retry(): void; menu(): void }) {
    const e = $('#debrief');
    const mm = Math.floor(d.time / 60), ss = Math.floor(d.time % 60);
    e.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${d.survival ? 'SURVIVAL REPORT' : 'MISSION DEBRIEFING'} · ${esc(d.title)}</div>
      <div class="result ${d.success ? 'ok' : 'fail'}">${d.survival ? `${d.waves ?? 0} waves` : d.success ? 'Mission complete' : 'Mission failed'}</div>
      <div style="color:var(--ink-dim);font-family:'Special Elite',monospace">${esc(d.reason)}</div>
      <div class="stats">
        <div class="stat"><div class="hud-label">Confirmed kills</div><div class="v">${d.kills}</div></div>
        <div class="stat"><div class="hud-label">Accuracy</div><div class="v">${Math.round(d.accuracy * 100)}%</div></div>
        <div class="stat"><div class="hud-label">Bombers lost</div><div class="v">${d.bombersLost}/${d.bombersTotal}</div></div>
        <div class="stat"><div class="hud-label">Time</div><div class="v">${mm}:${String(ss).padStart(2, '0')}</div></div>
        <div class="stat"><div class="hud-label">Score</div><div class="v">${d.score}</div></div>
      </div>
      <div>${d.medals.map((m, i) => `<span class="medal pop" style="animation-delay:${medalDelay(i)}s">✦ ${esc(m)}</span>`).join('')}</div>
      <div class="row" style="margin-top:22px">
        ${d.nextAvailable ? '<button class="btn" data-a="next">Next mission</button>' : ''}
        <button class="btn ${d.nextAvailable ? 'ghost' : ''}" data-a="retry">${d.survival ? 'Fly again' : 'Retry'}</button>
        <button class="btn ghost" data-a="menu">Main menu</button>
      </div>
    </div></div>`;
    e.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => (h as any)[b.dataset.a!]()));
    this.show('debrief');
    // Each badge pops in on its staggered delay; the fanfare is scheduled on the audio clock
    // with the same delay so sound and badge land together
    d.medals.forEach((_, i) => playMedalFanfare(sound, medalDelay(i), i));
  }
}

function zoneColor(v: number) {
  if (v <= 0) return '#1a1a1a';
  if (v < 0.35) return '#d9573f';
  if (v < 0.7) return '#e0b445';
  return 'rgba(233,226,207,0.55)';
}

function b17Svg() {
  // Top view: nose up
  return `<svg width="190" height="150" viewBox="0 0 190 150">
    <g stroke="rgba(0,0,0,0.6)" stroke-width="1">
      <rect data-z="wingLtip" x="4" y="58" width="38" height="14" rx="5" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="wingL" x="42" y="54" width="40" height="20" rx="3" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="wingR" x="108" y="54" width="40" height="20" rx="3" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="wingRtip" x="148" y="58" width="38" height="14" rx="5" fill="rgba(233,226,207,0.55)"/>
      <ellipse data-z="engine1" cx="30" cy="54" rx="6" ry="9" fill="rgba(233,226,207,0.55)"/>
      <ellipse data-z="engine2" cx="64" cy="51" rx="6" ry="9" fill="rgba(233,226,207,0.55)"/>
      <ellipse data-z="engine3" cx="126" cy="51" rx="6" ry="9" fill="rgba(233,226,207,0.55)"/>
      <ellipse data-z="engine4" cx="160" cy="54" rx="6" ry="9" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="nose" x="87" y="8" width="16" height="16" rx="7" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="cockpit" x="85" y="24" width="20" height="18" rx="3" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="fuselageFwd" x="84" y="42" width="22" height="30" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="fuselageMid" x="85" y="72" width="20" height="26" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="fuselageAft" x="87" y="98" width="16" height="24" fill="rgba(233,226,207,0.55)"/>
      <path data-z="tail" d="M95 120 L60 136 L60 144 L130 144 L130 136 Z" fill="rgba(233,226,207,0.55)"/>
    </g></svg>`;
}

function p51Svg() {
  return `<svg width="150" height="120" viewBox="0 0 150 120">
    <g stroke="rgba(0,0,0,0.6)" stroke-width="1">
      <rect data-z="wingL" x="6" y="40" width="58" height="18" rx="5" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="wingR" x="86" y="40" width="58" height="18" rx="5" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="engine" x="66" y="6" width="18" height="30" rx="6" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="cockpit" x="66" y="36" width="18" height="22" rx="3" fill="rgba(233,226,207,0.55)"/>
      <rect data-z="fuselage" x="68" y="58" width="14" height="34" fill="rgba(233,226,207,0.55)"/>
      <path data-z="tail" d="M75 90 L50 104 L50 112 L100 112 L100 104 Z" fill="rgba(233,226,207,0.55)"/>
    </g></svg>`;
}
