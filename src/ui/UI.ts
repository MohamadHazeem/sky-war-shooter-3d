import type { Mission } from '../game/Missions';
import { achievementsHtml } from '../game/Achievements';
import { STATION_ORDER, STATIONS, StationId } from '../world/B17Layout';
import { AIRCRAFT, MAX_LEVEL, PerkDef, Progression, UPGRADES, upgradeCost, WEAPONS } from '../game/Upgrades';
import { sound } from '../audio/Sound';
import { playMedalFanfare } from '../audio/Fanfare';

// Debrief medal timing (seconds): first badge after the result line, then one every half second
const medalDelay = (i: number) => 0.8 + i * 0.5;
import { CREW, CrewId } from '../world/Crew';
import { briefingMapSvg } from './BriefingMap';
import { campaignSize, decorateBriefing } from './BriefingExtras';
import { mountAccessibilityPanel } from './AccessibilityPanel';
import { mountHangarExtras } from './CrateUI';
import { bomberName, withName } from '../game/Customize';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  volume: number;
  musicVolume: number;
  sfxVolume: number;
  ambVolume: number;
  radio: boolean;
  music: boolean;
  quality: 'low' | 'medium' | 'high';
  markers: boolean;
  leadPip: 'off' | 'recruit' | 'always';
  aimAssist: 'off' | 'low' | 'high';
  flightMode: 'mouseAim' | 'direct';
  difficulty: 'recruit' | 'veteran' | 'ace';
  fov: number;   // base field of view in degrees (gunner and P-51 views); zoom scales from it
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
  // combat record (optional so every debrief path can omit what it doesn't track)
  rounds?: number;                 // rounds fired by the player
  hits?: number;                   // rounds that struck an enemy
  bestStreak?: number;             // longest run of confirmed kills in quick succession
  closestKill?: number | null;     // metres from the player's aircraft; null when no kills
  killsByGun?: { label: string; kills: number }[]; // gunner missions: kills per gun position
  merit?: number;    // points earned for the Armory
  points?: number;   // Armory balance after this mission
}

// Live mission snapshot shown on the pause screen
export interface PauseInfo {
  objectives: string[];
  kills: number;
  accuracy: number;     // 0..1
  bombersAlive: number;
  bombersTotal: number;
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
      <div id="armory" class="layer"></div>
      <div id="hangar"></div>
      <div id="perks"></div>
      <div id="perkToast"></div>
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

  title(h: { campaign(): void; survival(): void; armory(): void; settings(): void; credits(): void }) {
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
          <button data-a="campaign">Campaign <small>${campaignSize()} missions</small></button>
          <button data-a="survival">Survival <small>endless waves</small></button>
          <button data-a="armory">Armory <small>upgrade your guns</small></button>
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
      <table class="leader">${prog.survival.slice(0, 8).map((r, i) => `<tr><td>${i + 1}</td><td>${r.role === 'pilot' ? 'P-51' : 'B-17'}</td><td>${r.waves} rounds</td><td style="text-align:right">${r.score}</td><td style="text-align:right;color:var(--ink-dim)">${esc(r.date)}</td></tr>`).join('') || '<tr><td style="color:var(--ink-dim)">No scores yet</td></tr>'}</table>
      <div class="row" style="margin-top:20px"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    s.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.r as any)));
    s.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('survival');
  }

  briefing(m: Mission, onStart: () => void, onBack: () => void) {
    const b = $('#briefing');
    const gunnerControls = `<div><kbd>Mouse</kbd> or <kbd>Arrows</kbd>/<kbd>IJKL</kbd> traverse gun</div><div><kbd>LMB</kbd>/<kbd>Space</kbd> fire (short bursts)</div><div><kbd>RMB</kbd> look down the sight</div><div><kbd>1</kbd>–<kbd>5</kbd> change gun position</div><div><kbd>R</kbd> reload</div><div><kbd>Esc</kbd> pause</div>`;
    const pilotControls = `<div><kbd>Mouse</kbd> or <kbd>Arrows</kbd>/<kbd>IJKL</kbd> aim / fly (mouse aim)</div><div><kbd>LMB</kbd>/<kbd>Space</kbd> fire</div><div><kbd>W</kbd>/<kbd>S</kbd> throttle</div><div><kbd>Q</kbd>/<kbd>E</kbd> roll · <kbd>A</kbd>/<kbd>D</kbd> rudder</div><div><kbd>V</kbd> cockpit / chase view</div><div><kbd>C</kbd> free look · <kbd>M</kbd> flight mode</div><div><kbd>RMB</kbd> zoom · <kbd>Esc</kbd> pause</div>`;
    b.innerHTML = `<div class="screen-center"><div class="sheet">
      <div class="stamp">SECRET</div>
      <div class="hdr"><span>HQ 401ST BOMB SQUADRON (H) · FIELD ORDER</span><span>${esc(m.date)}</span></div>
      <div class="kicker" style="color:#6b5a2a">${m.number ? `MISSION No. ${m.number}` : 'SURVIVAL'}</div>
      <h2>${esc(m.title)}</h2>
      <div class="target">TARGET: ${esc(m.target)} &nbsp;·&nbsp; ASSIGNMENT: ${m.role === 'gunner' ? `B-17G "${esc(bomberName())}" — ` + STATIONS[m.station ?? 'waistL'].label : 'P-51D Mustang — close escort'}</div>
      <div class="brief-grid">
        <div class="brief-text">
          ${m.briefing.map((p) => `<p>${esc(withName(p))}</p>`).join('')}
          <div class="obj"><b>OBJECTIVES</b>${m.objectives.map((o) => `<div>☐ ${esc(o)}</div>`).join('')}</div>
        </div>
        ${briefingMapSvg(m)}
      </div>
      <div class="controls">${m.role === 'gunner' ? gunnerControls : pilotControls}</div>
      <div class="row"><button class="btn" data-go>Man your station</button><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    b.querySelector('[data-go]')!.addEventListener('click', onStart);
    b.querySelector('[data-back]')!.addEventListener('click', onBack);
    decorateBriefing(b, m);
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
        <div class="combo" id="hCombo">
          <div class="hud-label">Multiplier</div><div class="combo-val" id="hComboVal">x1.0</div>
          <div class="combo-bar"><div id="hComboBar"></div></div>
        </div>
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
        <div class="stations" id="hStations">${STATION_ORDER.map((s) => `<span data-s="${s}">${STATIONS[s].key} ${STATIONS[s].label.toUpperCase()}<b></b></span>`).join('')}</div>`;
      $('#hBR').innerHTML = `<div class="hud-label">${esc(bomberName())}</div><div id="dmg">${b17Svg()}</div>
        <div class="crewlist" id="hCrewList">${CREW.map((m) => `<span data-c="${m.id}"><i>${m.label}</i><b>OK</b></span>`).join('')}</div>
        <div class="hud-label" id="hCrew"></div>`;
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

  updateGunnerHud(d: { station: StationId; threats: Partial<Record<StationId, number>>; best: StationId | null; ammo: number; heat: number; overheated: boolean; reloading: number; zones: Record<string, number>; crew: string; wounded: ReadonlySet<CrewId> }) {
    this.setText('hStation', STATIONS[d.station].label + (d.reloading > 0 ? ' — RELOADING' : d.overheated ? ' — BARREL HOT' : ''));
    this.setText('hAmmo', '∞');
    // under 60 rounds the belt warning colours the count red (.low in style.css)
    document.getElementById('hAmmo')?.classList.toggle('low', d.ammo < 60);
    const h = document.getElementById('hHeat');
    if (h) h.style.width = `${Math.round(Math.min(1, d.heat) * 100)}%`;
    document.getElementById('hHeatM')?.classList.toggle('hot', d.overheated || d.heat > 0.8);
    document.querySelectorAll('#hStations span').forEach((el) => {
      const id = (el as HTMLElement).dataset.s as StationId;
      const n = d.threats[id] ?? 0;
      el.classList.toggle('on', id === d.station);
      el.classList.toggle('threat', n > 0 && id !== d.station);
      el.classList.toggle('best', id === d.best && id !== d.station);
      const badge = n > 0 ? String(n) : '';
      const b = el.querySelector('b');
      if (b) { if (b.textContent !== badge) b.textContent = badge; }
    });
    for (const [k, v] of Object.entries(d.zones)) {
      const z = document.querySelector(`#dmg [data-z="${k}"]`) as SVGElement | null;
      if (z) z.setAttribute('fill', zoneColor(v));
    }
    // Crew rows only change when someone is hit, so touch the DOM only on a change
    const list = document.getElementById('hCrewList');
    if (list) for (let i = 0; i < list.children.length; i++) {
      const row = list.children[i] as HTMLElement;
      const hurt = d.wounded.has(row.dataset.c as CrewId);
      if (row.classList.contains('wnd') === hurt) continue;
      row.classList.toggle('wnd', hurt);
      row.lastElementChild!.textContent = hurt ? 'WOUNDED' : 'OK';
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

  // Score multiplier readout; the bar drains while the combo hold window runs out.
  updateCombo(mult: number, frac: number) {
    this.setText('hComboVal', `x${mult.toFixed(1)}`);
    document.getElementById('hCombo')?.classList.toggle('hot', mult >= 2);
    const b = document.getElementById('hComboBar');
    if (b) b.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  }

  subtitle(who: string, text: string) {
    const s = document.getElementById('subs');
    if (!s) return;
    s.innerHTML = `<div class="line"><span class="who">${esc(who)}</span>${esc(withName(text))}</div>`;
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

  pause(h: { resume(): void; restart(): void; settings(): void; quit(): void }, role: 'gunner' | 'pilot' = 'gunner', info?: PauseInfo) {
    const p = $('#pause');
    const keys = role === 'gunner'
      ? 'Mouse aim · LMB fire · RMB sight · 1–5 gun positions · R reload'
      : 'Mouse aim/fly · LMB/Space fire · W/S throttle · Q/E roll · A/D rudder · V view · C free look · M control mode';
    // Mission snapshot: taken once when paused (the HUD does not tick while paused)
    const status = info ? `<div class="stats pause-stats">
        <div class="stat"><div class="hud-label">Confirmed kills</div><div class="v">${info.kills}</div></div>
        <div class="stat"><div class="hud-label">Accuracy</div><div class="v">${Math.round(info.accuracy * 100)}%</div></div>
        <div class="stat"><div class="hud-label">Bombers remaining</div><div class="v">${info.bombersAlive}/${info.bombersTotal}</div></div>
      </div>
      <div class="obj pause-obj"><b>OBJECTIVES</b>${info.objectives.map((o) => `<div>☐ ${esc(o)}</div>`).join('')}</div>` : '';
    p.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">INTERPHONE SILENT</div><h2 class="h2">Paused</h2>
      ${status}
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
      <label class="setting"><span>Field of view <b class="fov-val" style="font-weight:400;color:var(--ink-dim)">${s.fov}°</b></span> <input type="range" min="50" max="80" step="1" data-k="fov" value="${s.fov}"></label>
      <label class="setting">Invert mouse Y <select data-k="invertY"><option value="false">Off</option><option value="true" ${s.invertY ? 'selected' : ''}>On</option></select></label>
      <label class="setting">Master volume <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"></label>
      <label class="setting">Music volume <input type="range" min="0" max="1" step="0.05" data-k="musicVolume" value="${s.musicVolume}"></label>
      <label class="setting">Effects volume <input type="range" min="0" max="1" step="0.05" data-k="sfxVolume" value="${s.sfxVolume}"></label>
      <label class="setting">Ambience volume <input type="range" min="0" max="1" step="0.05" data-k="ambVolume" value="${s.ambVolume}"></label>
      <label class="setting">Music <select data-k="music"><option value="true">On</option><option value="false" ${!s.music ? 'selected' : ''}>Off</option></select></label>
      <label class="setting">Radio voices <select data-k="radio"><option value="true">On</option><option value="false" ${!s.radio ? 'selected' : ''}>Subtitles only</option></select></label>
      <label class="setting">Graphics quality <select data-k="quality">${['low', 'medium', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <label class="setting">Target markers <select data-k="markers"><option value="true">On</option><option value="false" ${!s.markers ? 'selected' : ''}>Off (realistic)</option></select></label>
      <label class="setting">Aim assist <select data-k="aimAssist"><option value="off" ${s.aimAssist === 'off' ? 'selected' : ''}>Off</option><option value="low" ${s.aimAssist === 'low' ? 'selected' : ''}>Low</option><option value="high" ${s.aimAssist === 'high' || !s.aimAssist ? 'selected' : ''}>High</option></select></label>
      <label class="setting">Lead indicator <select data-k="leadPip"><option value="off" ${s.leadPip === 'off' ? 'selected' : ''}>Off</option><option value="recruit" ${s.leadPip === 'recruit' || !s.leadPip ? 'selected' : ''}>Recruit only</option><option value="always" ${s.leadPip === 'always' ? 'selected' : ''}>Always</option></select></label>
      <label class="setting">P-51 flight controls <select data-k="flightMode"><option value="mouseAim">Mouse aim</option><option value="direct" ${s.flightMode === 'direct' ? 'selected' : ''}>Direct (mouse = stick)</option></select></label>
      <div class="row" style="margin-top:22px"><button class="btn" data-back>Done</button></div>
    </div></div>`;
    st.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((i) => i.addEventListener('input', () => {
      const k = i.dataset.k as keyof Settings;
      let v: any = i.value;
      if (k === 'sensitivity' || k === 'volume' || k === 'musicVolume' || k === 'sfxVolume' || k === 'ambVolume' || k === 'fov') v = parseFloat(v);
      if (k === 'invertY' || k === 'radio' || k === 'markers' || k === 'music') v = v === 'true';
      (s as any)[k] = v;
      if (k === 'fov') { const b = i.closest('label')?.querySelector('.fov-val'); if (b) b.textContent = `${v}°`; }
      onChange(s);
    }));
    st.querySelector('[data-back]')!.addEventListener('click', () => { st.classList.remove('show'); onBack(); });
    mountAccessibilityPanel(st.querySelector('.box')!);
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
      ${achievementsHtml()}
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    c.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('credits');
  }

  // Armory: spend merit points on permanent gun upgrades
  armory(prog: Progression, onBack: () => void) {
    const a = $('#armory');
    const render = () => {
      a.innerHTML = `<div class="screen-center"><div class="box panel armory">
        <div class="kicker">ORDNANCE SHOP · 401ST BOMB SQUADRON</div>
        <h2>Armory</h2>
        <div class="pts">Merit points: <b>${prog.points}</b> <span>— earned from score in every mission</span></div>
        <div class="ugrid">${UPGRADES.map((u) => {
          const lv = prog.levels[u.id], cost = upgradeCost(lv), maxed = lv >= MAX_LEVEL;
          return `<div class="ucard">
            <div class="t">${esc(u.name)}</div><div class="d">${esc(u.desc)} · ${esc(u.per)} per level</div>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
            <button class="btn ${maxed || prog.points < cost ? 'ghost' : ''}" data-u="${u.id}" ${maxed || prog.points < cost ? 'disabled' : ''}>${maxed ? 'Maxed' : `Upgrade · ${cost}`}</button>
          </div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:20px"><button class="btn ghost" data-back>Back</button></div>
      </div></div>`;
      a.querySelectorAll<HTMLButtonElement>('[data-u]').forEach((b) => b.addEventListener('click', () => {
        if (prog.buy(b.dataset.u as any)) { sound.play('click', null, { gain: 0.6 }); render(); }
      }));
      a.querySelector('[data-back]')!.addEventListener('click', onBack);
    };
    render();
    this.show('armory');
  }

  // Between rounds: swap aircraft and weapon, buy upgrades, then launch the next round
  hangar(prog: Progression, role: 'gunner' | 'pilot', info: { title: string; sub: string; next: string }, onLaunch: () => void) {
    const el = $('#hangar');
    const card = (id: string, name: string, desc: string, cost: number, selected: boolean, kind: string) => {
      const owned = prog.unlocked.has(id);
      const state = selected ? 'EQUIPPED' : owned ? 'EQUIP' : `UNLOCK · ${cost}`;
      const off = !owned && prog.points < cost;
      return `<button class="hcard ${selected ? 'sel' : ''} ${off ? 'off' : ''}" data-${kind}="${id}" ${off ? 'disabled' : ''}>
        <div class="t">${esc(name)}</div><div class="d">${esc(desc)}</div><div class="s">${state}</div></button>`;
    };
    const render = () => {
      const planes = AIRCRAFT.filter((a) => a.role === role), guns = WEAPONS.filter((w) => w.role === role);
      el.innerHTML = `<div class="hwrap panel">
        <div class="kicker">${esc(info.title)} · ${esc(info.sub)}</div>
        <h2>Hangar</h2>
        <div class="pts">Merit points: <b>${prog.points}</b></div>
        <div class="hsec">AIRCRAFT</div>
        <div class="hgrid">${planes.map((a) => card(a.id, a.name, a.desc, a.cost, prog.aircraft[role] === a.id, 'a')).join('')}</div>
        <div class="hsec">WEAPON</div>
        <div class="hgrid">${guns.map((w) => card(w.id, w.name, w.desc, w.cost, prog.weapon[role] === w.id, 'w')).join('')}</div>
        <div class="hsec">UPGRADES</div>
        <div class="ugrid">${UPGRADES.map((u) => {
          const lv = prog.levels[u.id], cost = upgradeCost(lv), maxed = lv >= MAX_LEVEL;
          return `<div class="ucard"><div class="t">${esc(u.name)}</div><div class="d">${esc(u.per)} per level</div>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
            <button class="btn ${maxed || prog.points < cost ? 'ghost' : ''}" data-u="${u.id}" ${maxed || prog.points < cost ? 'disabled' : ''}>${maxed ? 'Maxed' : `Upgrade · ${cost}`}</button></div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:18px"><button class="btn" data-go>${info.next === 'Back' ? 'Back' : `Launch — ${esc(info.next)}`}</button></div>
      </div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
        const a = AIRCRAFT.find((x) => x.id === b.dataset.a)!;
        if (prog.unlock(a.id, a.cost)) { prog.selectAircraft(a); sound.play('click', null, { gain: 0.6 }); render(); }
      }));
      el.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.addEventListener('click', () => {
        const w = WEAPONS.find((x) => x.id === b.dataset.w)!;
        if (prog.unlock(w.id, w.cost)) { prog.selectWeapon(w); sound.play('click', null, { gain: 0.6 }); render(); }
      }));
      el.querySelectorAll<HTMLButtonElement>('[data-u]').forEach((b) => b.addEventListener('click', () => {
        if (prog.buy(b.dataset.u as any)) { sound.play('click', null, { gain: 0.6 }); render(); }
      }));
      el.querySelector('[data-go]')!.addEventListener('click', launch);
      mountHangarExtras(el, prog, role, render);
    };
    const key = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); launch(); } };
    const launch = () => { removeEventListener('keydown', key, true); el.classList.remove('show'); onLaunch(); };
    addEventListener('keydown', key, true);
    render();
    el.classList.add('show');
  }

  // Random field upgrade: a card slides in at the top, holds, and fades (no pause)
  private toastQ: [string, string, string][] = [];
  private toastBusy = false;
  perkToast(label: string, name: string, desc: string) {
    this.toastQ.push([label, name, desc]);
    if (!this.toastBusy) this.nextToast();
  }
  private nextToast() {
    const next = this.toastQ.shift();
    const el = $('#perkToast');
    if (!next) { this.toastBusy = false; return; }
    this.toastBusy = true;
    el.innerHTML = `<div class="k">${esc(next[0])}</div><div class="t">${esc(next[1])}</div><div class="d">${esc(next[2])}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => this.nextToast(), 450); }, 3200);
  }

  // Between waves: pick one of three perks (click or keys 1-3); the HUD stays visible behind
  perkChoice(cards: PerkDef[], title: string, onPick: (p: PerkDef) => void) {
    const el = $('#perks');
    el.innerHTML = `<div class="perkwrap"><div class="kicker">${esc(title)}</div><h2>Choose a field upgrade</h2>
      <div class="pgrid">${cards.map((c, i) => `<button class="pcard" data-i="${i}"><span class="k">${i + 1}</span><div class="t">${esc(c.name)}</div><div class="d">${esc(c.desc)}</div></button>`).join('')}</div>
      <div class="hint">Click a card or press 1 – 3</div></div>`;
    el.classList.add('show');
    let done = false;
    const pick = (i: number) => {
      if (done || !cards[i]) return;
      done = true;
      removeEventListener('keydown', key, true);
      el.classList.remove('show');
      onPick(cards[i]);
    };
    const key = (e: KeyboardEvent) => { const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (n >= 0) { e.stopPropagation(); e.preventDefault(); pick(n); } };
    addEventListener('keydown', key, true);
    el.querySelectorAll<HTMLButtonElement>('.pcard').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.i!)));
  }

  debrief(d: DebriefData, h: { next(): void; retry(): void; menu(): void; armory(): void }) {
    const e = $('#debrief');
    const mm = Math.floor(d.time / 60), ss = Math.floor(d.time % 60);
    const tile = (label: string, value: string | number) => `<div class="stat"><div class="hud-label">${esc(label)}</div><div class="v">${value}</div></div>`;
    const range = d.closestKill == null ? '—' : d.closestKill >= 1000 ? `${(d.closestKill / 1000).toFixed(1)} km` : `${Math.round(d.closestKill)} m`;
    const extra: string[] = [];
    if (d.rounds !== undefined) extra.push(tile('Rounds fired', d.rounds));
    if (d.hits !== undefined) extra.push(tile('Rounds on target', d.hits));
    if (d.bestStreak !== undefined) extra.push(tile('Best streak', d.bestStreak));
    if (d.closestKill !== undefined) extra.push(tile('Closest kill', range));
    if (d.killsByGun) {
      // one tile per gun position that scored; a zero tile when none did
      if (d.killsByGun.length) for (const g of d.killsByGun) extra.push(tile(`${g.label} kills`, g.kills));
      else extra.push(tile('Gun kills', 0));
    }
    e.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${d.survival ? 'SURVIVAL REPORT' : 'MISSION DEBRIEFING'} · ${esc(d.title)}</div>
      <div class="result ${d.success ? 'ok' : 'fail'}">${d.survival ? `${d.waves ?? 0} rounds` : d.success ? 'Mission complete' : 'Mission failed'}</div>
      <div style="color:var(--ink-dim);font-family:'Special Elite',monospace">${esc(withName(d.reason))}</div>
      <div class="stats">
        <div class="stat"><div class="hud-label">Confirmed kills</div><div class="v">${d.kills}</div></div>
        <div class="stat"><div class="hud-label">Accuracy</div><div class="v">${Math.round(d.accuracy * 100)}%</div></div>
        <div class="stat"><div class="hud-label">Bombers lost</div><div class="v">${d.bombersLost}/${d.bombersTotal}</div></div>
        <div class="stat"><div class="hud-label">Time</div><div class="v">${mm}:${String(ss).padStart(2, '0')}</div></div>
        <div class="stat"><div class="hud-label">Score</div><div class="v">${d.score}</div></div>
        ${d.merit !== undefined ? `<div class="stat"><div class="hud-label">Merit earned</div><div class="v" style="color:var(--khaki)">+${d.merit}</div></div>` : ''}
        ${extra.join('')}
      </div>
      <div>${d.medals.map((m, i) => `<span class="medal pop" style="animation-delay:${medalDelay(i)}s">✦ ${esc(m)}</span>`).join('')}</div>
      <div class="row" style="margin-top:22px">
        ${d.nextAvailable ? '<button class="btn" data-a="next">Next mission</button>' : ''}
        <button class="btn ${d.nextAvailable ? 'ghost' : ''}" data-a="retry">${d.survival ? 'Fly again' : 'Retry'}</button>
        <button class="btn ghost" data-a="armory">Armory${d.points !== undefined ? ` · ${d.points} pts` : ''}</button>
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
