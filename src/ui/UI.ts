import { bombingReport } from './BombingReport';
import type { BombingResult } from '../game/Bombardier';
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
import { foldHangar } from './HangarFold';
import { bomberName, withName } from '../game/Customize';
import { mountCrewRoster } from './CrewPanel';
import { mountCloudSave } from './CloudSavePanel';
import { t, tx, getLang, setLang, applyDocumentLang, type Lang } from '../i18n';
import '../i18n/rtl.css';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  volume: number;
  musicVolume: number;
  sfxVolume: number;
  ambVolume: number;
  radio: boolean;
  music: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  weatherEffects?: boolean; // undefined = on; cosmetic precipitation / glass only
  fpsCounter?: boolean;   // on-screen frame-rate readout (render/FpsCounter.ts); undefined = off
  markers: boolean;
  leadPip: 'off' | 'recruit' | 'always';
  aimAssist: 'off' | 'low' | 'high';
  flightMode: 'mouseAim' | 'direct';
  difficulty: 'recruit' | 'veteran' | 'ace';
  fov: number;   // base field of view in degrees (gunner and P-51 views); zoom scales from it
  killCam?: boolean;   // cinematic kill cam on special kills (Cinematics.ts); undefined = on
  audioDetail?: 'normal' | 'reduced';   // Sound.setDetail: Reduced for weak devices; undefined = normal
  breathing?: boolean;  // oxygen-mask breathing (Sound.setBreathing); undefined = on
  bookends?: boolean;  // take-off and landing scenes around B-17 and P-51 campaign missions (Bookends.ts, FighterBookends.ts); undefined = on
  crewRoom?: boolean;  // crew-room scenes between story missions (CrewRoomScene.ts); undefined = on
  gfxAuto?: 'pending'; // first-launch graphics benchmark still to run (game/AutoGraphics.ts); a preset picked here clears it
}

export interface Progress { unlocked: number; medals: Record<string, string[]>; best: Record<string, number>; survival: { name: string; score: number; waves: number; role: string; date: string }[] }

export interface DebriefData {
  bombing?: BombingResult;
  coop?: boolean;
  personalScore?: number;
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
  ditched?: boolean;
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

// Title menu layout: other modules add entries (Training, Daily Orders, Career, Skills, ...)
// after title() builds it, so the grouping is applied by CSS order + a class, re-run whenever
// entries change. Play modes stay large at the top; everything else is a compact 2-column grid.
const MENU_PRIMARY = ['campaign', 'survival', 'coop'];
const MENU_SECONDARY = ['training', 'daily', 'skills', 'career', 'trophies', 'armory', 'theatre', 'aircraft', 'whatsnew', 'manual', 'settings', 'credits'];
function organizeMenu(menu: HTMLElement) {
  const apply = () => {
    menu.classList.add('grouped');
    for (const b of Array.from(menu.children) as HTMLElement[]) {
      const a = b.dataset.a ?? '';
      const p = MENU_PRIMARY.indexOf(a);
      const s = MENU_SECONDARY.indexOf(a);
      const order = p >= 0 ? p : 10 + (s >= 0 ? s : MENU_SECONDARY.length);
      if (b.style.order !== String(order)) b.style.order = String(order);
      b.classList.toggle('sec', p < 0);
    }
  };
  apply();
  new MutationObserver(apply).observe(menu, { childList: true });
}

export class UI {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private subsTimer: number | null = null;
  private bannerTimer: number | null = null;
  private relang: (() => void) | null = null;   // rebuilds the paused screen after a language switch
  // Settings → "Detect best settings": set by game/AutoGraphics.ts (re-runs the graphics benchmark)
  detectGraphics?: () => Promise<{ quality: Settings['quality'] } | null>;

  constructor() {
    document.body.insertAdjacentHTML('beforeend', `
      <canvas id="hudCanvas"></canvas>
      <div id="vignetteRed"></div>
      <div id="fade"></div>
      <div id="loading" class="layer show"><div class="title">SKY WAR SHOOTER 3D</div><div class="bar"><div></div></div><div class="msg">${t('loading.msg')}</div></div>
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
    applyDocumentLang();
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
    if (msg) $('#loading .msg').textContent = tx(msg);
  }

  fade(on: boolean) { $('#fade').style.opacity = on ? '1' : '0'; }
  fadeTo(a: number) { $('#fade').style.transition = 'none'; $('#fade').style.opacity = String(a); requestAnimationFrame(() => ($('#fade').style.transition = '')); }

  title(h: { campaign(): void; survival(): void; armory(): void; settings(): void; credits(): void }) {
    const tl = $('#title');
    // Cinematic dressing (letterbox, film grain, scratches, stencil tag) is decorative and
    // pointer-events:none, so the buttons below keep their handlers untouched.
    tl.innerHTML = `
      <div class="tt-bars" aria-hidden="true"><i></i><i></i></div>
      <div class="tt-stencil">${t('title.stencil')}</div>
      <div class="wrap">
        <div class="eyebrow">${t('title.eyebrow')}</div>
        <h1>${t('title.logo')}</h1>
        <div class="sub">${t('title.sub')}</div>
        <div class="menu">
          <button data-a="campaign">${t('title.campaign')} <small>${t('title.campaignSub', { n: campaignSize() })}</small></button>
          <button data-a="survival">${t('title.survival')} <small>${t('title.survivalSub')}</small></button>
          <button data-a="armory">${t('common.armory')} <small>${t('title.armorySub')}</small></button>
          <button data-a="settings">${t('common.settings')}</button>
          <button data-a="credits">${t('title.credits')}</button>
        </div>
      </div>
      <div class="foot">${t('title.foot')}</div>
      <div class="tt-grain" aria-hidden="true"></div>
      <div class="tt-scratch" aria-hidden="true"></div>`;
    tl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => (h as any)[b.dataset.a!]()));
    // Arrow keys move between menu items (Tab still works natively); the listener lives on
    // the freshly built .menu, so repeated title() calls never stack handlers.
    const menu = tl.querySelector<HTMLElement>('.menu');
    if (menu) organizeMenu(menu);
    menu?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).sort((a, b) => (+a.style.order || 0) - (+b.style.order || 0));
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
      <div class="kicker">${t('campaign.kicker')}</div>
      <h2>${t('campaign.title')}</h2>
      <div class="missions">${missions.map((m, i) => `
        <button class="mcard" data-i="${i}" ${i > prog.unlocked ? 'disabled' : ''}>
          <span class="role">${m.role === 'gunner' ? 'B-17 · ' + tx(STATIONS[m.station ?? 'waistL'].label) : 'P-51D'}</span>
          <div class="num">${t('campaign.mission', { n: String(m.number).padStart(2, '0') })} · ${esc(tx(m.date))}</div>
          <div class="t">${esc(tx(m.title))}</div>
          <div class="tg">${esc(tx(m.target))}</div>
          <div class="medals">${(prog.medals[m.id] ?? []).map((x) => tx(x)).join(' · ')}${prog.best[m.id] ? ` · ${t('campaign.best', { n: prog.best[m.id] })}` : ''}</div>
        </button>`).join('')}
      </div>
      <div class="row"><button class="btn ghost" data-back>${t('common.back')}</button></div>
    </div></div>`;
    c.querySelectorAll<HTMLButtonElement>('.mcard').forEach((b) => b.addEventListener('click', () => onPick(missions[+b.dataset.i!])));
    c.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('campaign');
  }

  survivalMenu(prog: Progress, onPick: (role: 'gunner' | 'pilot') => void, onBack: () => void) {
    const s = $('#survival');
    s.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${t('survival.kicker')}</div><h2 class="h2">${t('survival.title')}</h2>
      <p style="color:var(--ink-dim);font-size:15px;line-height:1.5">${t('survival.desc')}</p>
      <div class="row" style="margin:18px 0"><button class="btn" data-r="gunner">${t('survival.gunner')}</button><button class="btn" data-r="pilot">${t('survival.pilot')}</button></div>
      <div class="hud-label">${t('survival.best')}</div>
      <table class="leader">${prog.survival.slice(0, 8).map((r, i) => `<tr><td>${i + 1}</td><td>${r.role === 'pilot' ? 'P-51' : 'B-17'}</td><td>${t('survival.rounds', { n: r.waves })}</td><td style="text-align:right">${r.score}</td><td style="text-align:right;color:var(--ink-dim)">${esc(r.date)}</td></tr>`).join('') || `<tr><td style="color:var(--ink-dim)">${t('survival.none')}</td></tr>`}</table>
      <div class="row" style="margin-top:20px"><button class="btn ghost" data-back>${t('common.back')}</button></div>
    </div></div>`;
    s.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.r as any)));
    s.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('survival');
  }

  briefing(m: Mission, onStart: () => void, onBack: () => void) {
    const b = $('#briefing');
    const gunnerControls = t('brief.gunnerControls');
    const pilotControls = t('brief.pilotControls');
    b.innerHTML = `<div class="screen-center"><div class="sheet">
      <div class="stamp">${t('brief.stamp')}</div>
      <div class="hdr"><span>${t('brief.hdr')}</span><span>${esc(tx(m.date))}</span></div>
      <div class="kicker" style="color:#6b5a2a">${m.number ? t('brief.missionNo', { n: m.number }) : t('brief.survival')}</div>
      <h2>${esc(tx(m.title))}</h2>
      <div class="target">${t('brief.target')} ${esc(tx(m.target))} &nbsp;·&nbsp; ${t('brief.assignment')} ${m.role === 'gunner' ? `<bdi>B-17G "${esc(bomberName())}"</bdi> — ` + tx(STATIONS[m.station ?? 'waistL'].label) : t('brief.escort')}</div>
      <div class="brief-grid">
        <div class="brief-text">
          ${m.briefing.map((p) => `<p>${esc(withName(tx(p)))}</p>`).join('')}
          <div class="obj"><b>${t('common.objectives')}</b>${m.objectives.map((o) => `<div>☐ ${esc(tx(o))}</div>`).join('')}</div>
        </div>
        ${briefingMapSvg(m)}
      </div>
      <div class="controls">${m.role === 'gunner' ? gunnerControls : pilotControls}</div>
      <div class="row"><button class="btn" data-go>${t('brief.go')}</button><button class="btn ghost" data-back>${t('common.back')}</button></div>
    </div></div>`;
    b.querySelector('[data-go]')!.addEventListener('click', onStart);
    b.querySelector('[data-back]')!.addEventListener('click', onBack);
    decorateBriefing(b, m);
    this.show('briefing');
  }

  // ---------------- HUD ----------------
  hud(role: 'gunner' | 'pilot', coop = false) {
    const h = $('#hud');
    h.innerHTML = `
      <div class="hud-tl hud-text">
        <div class="hud-label" id="hMission"></div>
        <div class="objective" id="hObjective"></div>
      </div>
      <div class="hud-tr hud-text">
        <div class="hud-label">${t('hud.kills')}</div><div class="hud-big" id="hKills">0</div>
        <div class="hud-label" style="margin-top:6px">${coop ? tx('Crew score') : t('common.score')}</div><div class="mono" id="hScore" style="font-size:18px">0</div>
        <div class="hud-label" style="margin-top:6px">${t('hud.formation')}</div><div class="mono" id="hFormation" style="font-size:16px"></div>
        <div class="combo" id="hCombo">
          <div class="hud-label">${t('hud.multiplier')}</div><div class="combo-val" id="hComboVal">x1.0</div>
          <div class="combo-bar"><div id="hComboBar"></div></div>
        </div>
      </div>
      <div id="feed"></div>
      <div class="hud-bl hud-text" id="hBL"></div>
      <div class="hud-br hud-text" id="hBR"></div>
      <div id="subs"></div>
      <div id="banner"><div class="b1" id="bannerA"></div><div class="b2" id="bannerB"></div></div>
      <div id="tip"></div>
      <div id="lockHint">${t('hud.lockHint')}</div>`;
    if (role === 'gunner') {
      $('#hBL').innerHTML = `
        <div class="hud-label" id="hStation"></div>
        <div class="hud-big mono" id="hAmmo">600</div>
        <div class="hud-label" style="margin-top:4px">${t('hud.barrel')}</div>
        <div class="meter" id="hHeatM"><div id="hHeat" style="width:0%"></div></div>
        <div class="stations" id="hStations">${STATION_ORDER.map((s) => `<span data-s="${s}">${STATIONS[s].key} ${tx(STATIONS[s].label).toUpperCase()}<b></b></span>`).join('')}</div>`;
      $('#hBR').innerHTML = `<div class="hud-label">${esc(bomberName())}</div><div id="dmg">${b17Svg()}</div>
        <div class="crewlist" id="hCrewList">${CREW.map((m) => `<span data-c="${m.id}"><i>${tx(m.label)}</i><b>${t('hud.ok')}</b></span>`).join('')}</div>
        <div class="hud-label" id="hCrew"></div>`;
    } else {
      $('#hBL').innerHTML = `<div class="instr">
        <div class="hud-label">${t('hud.ias')}</div><div class="hud-label">${t('hud.alt')}</div><div class="hud-label">${t('hud.thr')}</div><div class="hud-label">${t('hud.g')}</div><div class="hud-label">${t('hud.ammo')}</div>
        <div class="v" id="iSpd">0</div><div class="v" id="iAlt">0</div><div class="v" id="iThr">0</div><div class="v" id="iG">1.0</div><div class="v" id="iAmmo">0</div>
      </div><div class="hud-label" id="iMode" style="margin-top:6px"></div>`;
      $('#hBR').innerHTML = `<div class="hud-label">${t('hud.mustang')}</div><div id="dmg">${p51Svg()}</div>`;
    }
    this.show('hud');
  }

  showLockHint(on: boolean) { const e = document.getElementById('lockHint'); if (e) e.classList.toggle('show', on); }

  setText(id: string, t: string) { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; }

  updateGunnerHud(d: { station: StationId; threats: Partial<Record<StationId, number>>; best: StationId | null; ammo: number; heat: number; overheated: boolean; reloading: number; zones: Record<string, number>; crew: string; wounded: ReadonlySet<CrewId> }) {
    this.setText('hStation', tx(STATIONS[d.station].label) + (d.reloading > 0 ? t('hud.reloading') : d.overheated ? t('hud.barrelHot') : ''));
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
      row.lastElementChild!.textContent = hurt ? t('hud.wounded') : t('hud.ok');
    }
    this.setText('hCrew', tx(d.crew));
  }

  updatePilotHud(d: { speed: number; alt: number; thr: number; g: number; ammo: number; mode: string; zones: Record<string, number> }) {
    this.setText('iSpd', String(Math.round(d.speed * 2.237)));
    this.setText('iAlt', String(Math.round(d.alt * 3.281 / 10) * 10));
    this.setText('iThr', `${Math.round(d.thr * 100)}%`);
    this.setText('iG', d.g.toFixed(1));
    this.setText('iAmmo', Number.isFinite(d.ammo) ? String(d.ammo) : '∞');   // unlimited ammunition, as on the gunner HUD
    this.setText('iMode', tx(d.mode));
    for (const [k, v] of Object.entries(d.zones)) {
      const z = document.querySelector(`#dmg [data-z="${k}"]`) as SVGElement | null;
      if (z) z.setAttribute('fill', zoneColor(v));
    }
  }

  updateCommon(d: { mission: string; objective: string; kills: number; score: number; formation: string }) {
    this.setText('hMission', tx(d.mission));
    this.setText('hObjective', tx(d.objective));
    this.setText('hKills', String(d.kills));
    this.setText('hScore', String(d.score));
    this.setText('hFormation', tx(d.formation));
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
    s.innerHTML = `<div class="line"><span class="who">${esc(tx(who))}</span>${esc(withName(tx(text)))}</div>`;   // English stays the voice-clip key
    if (this.subsTimer) clearTimeout(this.subsTimer);
    this.subsTimer = window.setTimeout(() => { s.innerHTML = ''; }, 2600 + text.length * 45);
  }

  feed(text: string, kind: 'mine' | 'loss' | '' = '') {
    const f = document.getElementById('feed');
    if (!f) return;
    const d = document.createElement('div');
    d.className = kind;
    d.textContent = tx(text);
    f.prepend(d);
    while (f.children.length > 5) f.lastChild!.remove();
    setTimeout(() => d.remove(), 6000);
  }

  banner(a: string, b: string, ms = 3000) {
    const e = document.getElementById('banner');
    if (!e) return;
    this.setText('bannerA', tx(a)); this.setText('bannerB', tx(b));
    e.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => e.classList.remove('show'), ms);
  }

  tip(text: string, ms = 5000) {
    const e = document.getElementById('tip');
    if (!e) return;
    text = tx(text);
    e.innerHTML = text;
    e.classList.add('show');
    window.setTimeout(() => { if (e.innerHTML === text) e.classList.remove('show'); }, ms);
  }

  redVignette(a: number) { $('#vignetteRed').style.opacity = String(Math.min(1, a)); }

  pause(h: { resume(): void; restart(): void; settings(): void; quit(): void }, role: 'gunner' | 'pilot' = 'gunner', info?: PauseInfo) {
    const p = $('#pause');
    const keys = role === 'gunner'
      ? t('pause.keysGunner')
      : t('pause.keysPilot');
    // Mission snapshot: taken once when paused (the HUD does not tick while paused)
    const status = info ? `<div class="stats pause-stats">
        <div class="stat"><div class="hud-label">${t('common.kills')}</div><div class="v">${info.kills}</div></div>
        <div class="stat"><div class="hud-label">${t('common.accuracy')}</div><div class="v">${Math.round(info.accuracy * 100)}%</div></div>
        <div class="stat"><div class="hud-label">${t('pause.bombers')}</div><div class="v">${info.bombersAlive}/${info.bombersTotal}</div></div>
      </div>
      <div class="obj pause-obj"><b>${t('common.objectives')}</b>${info.objectives.map((o) => `<div>☐ ${esc(tx(o))}</div>`).join('')}</div>` : '';
    p.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${t('pause.kicker')}</div><h2 class="h2">${t('pause.title')}</h2>
      ${status}
      <div class="menu" style="margin-top:18px">
        <button data-a="resume">${t('pause.resume')}</button><button data-a="restart">${t('pause.restart')}</button><button data-a="settings">${t('common.settings')}</button><button data-a="quit">${t('pause.quit')}</button>
      </div>
      <div class="mono" style="margin-top:20px;font-size:12px;color:var(--ink-dim);line-height:1.6">${keys}</div></div></div>`;
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => (h as any)[b.dataset.a!]()));
    p.classList.add('show');
    this.relang = () => this.pause(h, role, info);
  }
  hidePause() { $('#pause').classList.remove('show'); }

  settings(s: Settings, onChange: (s: Settings) => void, onBack: () => void) {
    const st = $('#settings');
    st.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${t('settings.kicker')}</div><h2 class="h2">${t('common.settings')}</h2>
      <label class="setting">${t('settings.language')} <select data-lang><option value="en" lang="en">English</option><option value="ar" lang="ar" ${getLang() === 'ar' ? 'selected' : ''}>العربية</option></select></label>
      <label class="setting">${t('settings.difficulty')} <select data-k="difficulty"><option value="recruit" ${s.difficulty === 'recruit' ? 'selected' : ''}>${t('settings.diff.recruit')}</option><option value="veteran" ${s.difficulty === 'veteran' ? 'selected' : ''}>${t('settings.diff.veteran')}</option><option value="ace" ${s.difficulty === 'ace' ? 'selected' : ''}>${t('settings.diff.ace')}</option></select></label>
      <label class="setting">${t('settings.sensitivity')} <input type="range" min="0.3" max="2.5" step="0.05" data-k="sensitivity" value="${s.sensitivity}"></label>
      <label class="setting"><span>${t('settings.fov')} <b class="fov-val" style="font-weight:400;color:var(--ink-dim)">${s.fov}°</b></span> <input type="range" min="50" max="80" step="1" data-k="fov" value="${s.fov}"></label>
      <label class="setting">${t('settings.invertY')} <select data-k="invertY"><option value="false">${t('common.off')}</option><option value="true" ${s.invertY ? 'selected' : ''}>${t('common.on')}</option></select></label>
      <label class="setting">${t('settings.volume')} <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"></label>
      <label class="setting">${t('settings.musicVolume')} <input type="range" min="0" max="1" step="0.05" data-k="musicVolume" value="${s.musicVolume}"></label>
      <label class="setting">${t('settings.sfxVolume')} <input type="range" min="0" max="1" step="0.05" data-k="sfxVolume" value="${s.sfxVolume}"></label>
      <label class="setting">${t('settings.ambVolume')} <input type="range" min="0" max="1" step="0.05" data-k="ambVolume" value="${s.ambVolume}"></label>
      <label class="setting">${t('settings.music')} <select data-k="music"><option value="true">${t('common.on')}</option><option value="false" ${!s.music ? 'selected' : ''}>${t('common.off')}</option></select></label>
      <label class="setting">${t('settings.audioDetail')} <select data-k="audioDetail"><option value="normal">${t('settings.audioNormal')}</option><option value="reduced" ${s.audioDetail === 'reduced' ? 'selected' : ''}>${t('settings.audioReduced')}</option></select></label>
      <label class="setting">${t('settings.breathing')} <select data-k="breathing"><option value="true">${t('common.on')}</option><option value="false" ${s.breathing === false ? 'selected' : ''}>${t('common.off')}</option></select></label>
      <label class="setting">${t('settings.radio')} <select data-k="radio"><option value="true">${t('common.on')}</option><option value="false" ${!s.radio ? 'selected' : ''}>${t('settings.subsOnly')}</option></select></label>
      <label class="setting">${t('settings.quality')} <select data-k="quality">${(['low', 'medium', 'high', 'ultra'] as const).map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${t(`settings.q.${q}`)}</option>`).join('')}</select></label>
      <label class="setting">${tx('Weather effects')} <select data-k="weatherEffects"><option value="true">${t('common.on')}</option><option value="false" ${s.weatherEffects === false ? 'selected' : ''}>${t('common.off')}</option></select></label>
      ${this.detectGraphics ? `<div class="setting"><span></span><button class="btn ghost" style="padding:6px 10px;font-size:12px;letter-spacing:1px" data-detect title="${t('settings.detectHint')}">${t('settings.detect')}</button></div>` : ''}
      <label class="setting">${t('settings.fpsCounter')} <select data-k="fpsCounter"><option value="false">${t('common.off')}</option><option value="true" ${s.fpsCounter ? 'selected' : ''}>${t('common.on')}</option></select></label>
      <label class="setting">${t('settings.markers')} <select data-k="markers"><option value="true">${t('common.on')}</option><option value="false" ${!s.markers ? 'selected' : ''}>${t('settings.markersOff')}</option></select></label>
      <label class="setting">${t('settings.aimAssist')} <select data-k="aimAssist"><option value="off" ${s.aimAssist === 'off' ? 'selected' : ''}>${t('common.off')}</option><option value="low" ${s.aimAssist === 'low' ? 'selected' : ''}>${t('settings.low')}</option><option value="high" ${s.aimAssist === 'high' || !s.aimAssist ? 'selected' : ''}>${t('settings.high')}</option></select></label>
      <label class="setting">${t('settings.leadPip')} <select data-k="leadPip"><option value="off" ${s.leadPip === 'off' ? 'selected' : ''}>${t('common.off')}</option><option value="recruit" ${s.leadPip === 'recruit' || !s.leadPip ? 'selected' : ''}>${t('settings.recruitOnly')}</option><option value="always" ${s.leadPip === 'always' ? 'selected' : ''}>${t('settings.always')}</option></select></label>
      <label class="setting">${t('settings.killCam')} <select data-k="killCam"><option value="true">${t('common.on')}</option><option value="false" ${s.killCam === false ? 'selected' : ''}>${t('common.off')}</option></select></label>
      <label class="setting">${t('settings.bookends')} <select data-k="bookends"><option value="true">${t('common.on')}</option><option value="false" ${s.bookends === false ? 'selected' : ''}>${t('common.off')}</option></select></label>
      <label class="setting">${t('settings.crewRoom')} <select data-k="crewRoom"><option value="true">${t('common.on')}</option><option value="false" ${s.crewRoom === false ? 'selected' : ''}>${t('common.off')}</option></select></label>
      <label class="setting">${t('settings.flightMode')} <select data-k="flightMode"><option value="mouseAim">${t('settings.mouseAim')}</option><option value="direct" ${s.flightMode === 'direct' ? 'selected' : ''}>${t('settings.direct')}</option></select></label>
      <div class="row" style="margin-top:22px"><button class="btn" data-back>${t('settings.done')}</button></div>
    </div></div>`;
    st.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((i) => i.addEventListener('input', () => {
      const k = i.dataset.k as keyof Settings;
      let v: any = i.value;
      if (k === 'sensitivity' || k === 'volume' || k === 'musicVolume' || k === 'sfxVolume' || k === 'ambVolume' || k === 'fov') v = parseFloat(v);
      if (k === 'weatherEffects' || k === 'invertY' || k === 'radio' || k === 'markers' || k === 'music' || k === 'killCam' || k === 'fpsCounter' || k === 'breathing' || k === 'bookends' || k === 'crewRoom') v = v === 'true';
      (s as any)[k] = v;
      if (k === 'quality') delete s.gfxAuto;   // the player's choice wins over the first-launch pick
      if (k === 'fov') { const b = i.closest('label')?.querySelector('.fov-val'); if (b) b.textContent = `${v}°`; }
      onChange(s);
    }));
    st.querySelector('[data-back]')!.addEventListener('click', () => { st.classList.remove('show'); onBack(); });
    // Detect best settings: re-runs the graphics benchmark (game/AutoGraphics.ts), which saves the pick
    const detect = st.querySelector<HTMLButtonElement>('[data-detect]');
    detect?.addEventListener('click', async () => {
      if (!this.detectGraphics || detect.disabled) return;
      detect.disabled = true;
      detect.textContent = t('settings.detecting');
      const r = await this.detectGraphics();
      detect.disabled = false;
      detect.textContent = t('settings.detect');
      const sel = st.querySelector<HTMLSelectElement>('[data-k="quality"]');
      if (r && sel) sel.value = r.quality;
    });
    // Language: switch now and rebuild this screen (and the paused screen behind it) in place
    st.querySelector<HTMLSelectElement>('[data-lang]')!.addEventListener('change', (e) => {
      const cloud = !!st.querySelector('.cloud');
      setLang((e.target as HTMLSelectElement).value as Lang);
      this.settings(s, onChange, onBack);
      if (cloud) mountCloudSave(st.querySelector<HTMLElement>('.box')!);
      if ($('#pause').classList.contains('show')) this.relang?.();
    });
    mountAccessibilityPanel(st.querySelector('.box')!);
    st.classList.add('show');
  }

  credits(onBack: () => void) {
    const c = $('#credits');
    c.innerHTML = `<div class="screen-center"><div class="box panel credits">
      <div class="kicker">${t('credits.kicker')}</div><h2 class="h2">Sky War Shooter 3D</h2>
      <p>${t('credits.p1')}</p>
      <p>${t('credits.p2')}</p>
      <p>${esc(t('credits.p3'))}</p>
      <p>${esc(t('credits.p4'))}</p>
      ${achievementsHtml()}
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>${t('common.back')}</button></div>
    </div></div>`;
    c.querySelector('[data-back]')!.addEventListener('click', onBack);
    this.show('credits');
  }

  // Armory: spend merit points on permanent gun upgrades
  armory(prog: Progression, onBack: () => void) {
    const a = $('#armory');
    const render = () => {
      a.innerHTML = `<div class="screen-center"><div class="box panel armory">
        <div class="kicker">${t('armory.kicker')}</div>
        <h2>${t('common.armory')}</h2>
        <div class="pts">${t('common.meritPoints')} <b>${prog.points}</b> <span>${t('armory.earned')}</span></div>
        <div class="ugrid">${UPGRADES.map((u) => {
          const lv = prog.levels[u.id], cost = upgradeCost(lv), maxed = lv >= MAX_LEVEL;
          return `<div class="ucard">
            <div class="t">${esc(tx(u.name))}</div><div class="d">${esc(tx(u.desc))} · ${esc(t('common.perLevel', { per: tx(u.per) }))}</div>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
            <button class="btn ${maxed || prog.points < cost ? 'ghost' : ''}" data-u="${u.id}" ${maxed || prog.points < cost ? 'disabled' : ''}>${maxed ? t('common.maxed') : t('common.upgrade', { cost })}</button>
          </div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:20px"><button class="btn ghost" data-back>${t('common.back')}</button></div>
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
      const state = selected ? t('hangar.equipped') : owned ? t('hangar.equip') : t('hangar.unlock', { cost });
      const off = !owned && prog.points < cost;
      return `<button class="hcard ${selected ? 'sel' : ''} ${off ? 'off' : ''}" data-${kind}="${id}" ${off ? 'disabled' : ''}>
        <div class="t">${esc(tx(name))}</div><div class="d">${esc(tx(desc))}</div><div class="s">${state}</div></button>`;
    };
    const render = () => {
      const planes = AIRCRAFT.filter((a) => a.role === role), guns = WEAPONS.filter((w) => w.role === role);
      el.innerHTML = `<div class="hwrap panel">
        <div class="kicker">${esc(tx(info.title))} · ${esc(tx(info.sub))}</div>
        <h2>${t('hangar.title')}</h2>
        <div class="pts">${t('common.meritPoints')} <b>${prog.points}</b></div>
        <div class="hsec">${t('hangar.aircraft')}</div>
        <div class="hgrid">${planes.map((a) => card(a.id, a.name, a.desc, a.cost, prog.aircraft[role] === a.id, 'a')).join('')}</div>
        <div class="hsec">${t('hangar.weapon')}</div>
        <div class="hgrid">${guns.map((w) => card(w.id, w.name, w.desc, w.cost, prog.weapon[role] === w.id, 'w')).join('')}</div>
        <div class="hsec">${t('hangar.upgrades')}</div>
        <div class="ugrid">${UPGRADES.map((u) => {
          const lv = prog.levels[u.id], cost = upgradeCost(lv), maxed = lv >= MAX_LEVEL;
          return `<div class="ucard"><div class="t">${esc(tx(u.name))}</div><div class="d">${esc(t('common.perLevel', { per: tx(u.per) }))}</div>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
            <button class="btn ${maxed || prog.points < cost ? 'ghost' : ''}" data-u="${u.id}" ${maxed || prog.points < cost ? 'disabled' : ''}>${maxed ? t('common.maxed') : t('common.upgrade', { cost })}</button></div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:18px"><button class="btn" data-go>${info.next === 'Back' ? t('common.back') : t('hangar.launch', { next: esc(tx(info.next)) })}</button></div>
      </div>`;
      if (role === 'gunner') mountCrewRoster(el.querySelector('.hwrap')!, prog);
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
      foldHangar(el);   // phones: collapsible sections (HangarFold.ts)
    };
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('.crewroster')) return; if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); launch(); } };
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
    el.innerHTML = `<div class="k">${esc(tx(next[0]))}</div><div class="t">${esc(tx(next[1]))}</div><div class="d">${esc(tx(next[2]))}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => this.nextToast(), 450); }, 3200);
  }

  // Between waves: pick one of three perks (click or keys 1-3); the HUD stays visible behind
  perkChoice(cards: PerkDef[], title: string, onPick: (p: PerkDef) => void) {
    const el = $('#perks');
    el.innerHTML = `<div class="perkwrap"><div class="kicker">${esc(tx(title))}</div><h2>${t('perks.title')}</h2>
      <div class="pgrid">${cards.map((c, i) => `<button class="pcard" data-i="${i}"><span class="k">${i + 1}</span><div class="t">${esc(tx(c.name))}</div><div class="d">${esc(tx(c.desc))}</div></button>`).join('')}</div>
      <div class="hint">${t('perks.hint')}</div></div>`;
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
    const range = d.closestKill == null ? '—' : d.closestKill >= 1000 ? t('debrief.km', { n: (d.closestKill / 1000).toFixed(1) }) : t('debrief.m', { n: Math.round(d.closestKill) });
    const extra: string[] = [];
    if (d.rounds !== undefined) extra.push(tile(t('debrief.rounds'), d.rounds));
    if (d.hits !== undefined) extra.push(tile(t('debrief.hits'), d.hits));
    if (d.bestStreak !== undefined) extra.push(tile(t('debrief.streak'), d.bestStreak));
    if (d.closestKill !== undefined) extra.push(tile(t('debrief.closest'), range));
    if (d.killsByGun) {
      // one tile per gun position that scored; a zero tile when none did
      if (d.killsByGun.length) for (const g of d.killsByGun) extra.push(tile(t('debrief.gunKills', { gun: tx(g.label) }), g.kills));
      else extra.push(tile(t('debrief.gunKillsNone'), 0));
    }
    e.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${d.survival ? t('debrief.survivalReport') : t('debrief.missionReport')} · ${esc(tx(d.title))}</div>
      <div class="result ${d.success ? 'ok' : 'fail'}">${d.survival ? t('debrief.roundsN', { n: d.waves ?? 0 }) : d.success ? t('debrief.complete') : t('debrief.failed')}</div>
      <div class="reason" style="color:var(--ink-dim);font-family:'Special Elite',monospace">${esc(withName(tx(d.reason)))}</div>
      <div class="stats">
        <div class="stat"><div class="hud-label">${t('common.kills')}</div><div class="v">${d.kills}</div></div>
        <div class="stat"><div class="hud-label">${t('common.accuracy')}</div><div class="v">${Math.round(d.accuracy * 100)}%</div></div>
        <div class="stat"><div class="hud-label">${t('debrief.bombersLost')}</div><div class="v">${d.bombersLost}/${d.bombersTotal}</div></div>
        <div class="stat"><div class="hud-label">${t('debrief.time')}</div><div class="v">${mm}:${String(ss).padStart(2, '0')}</div></div>
        <div class="stat"><div class="hud-label">${d.coop ? tx('Crew score') : t('common.score')}</div><div class="v">${d.score}</div></div>
        ${d.merit !== undefined ? `<div class="stat"><div class="hud-label">${t('debrief.merit')}${d.ditched ? `<br><small>${esc(tx('Ditched · bomber lost · crew rescued'))}</small>` : ''}</div><div class="v" style="color:var(--khaki)">+${d.merit}</div></div>` : ''}
        ${extra.join('')}
      </div>
      ${bombingReport(d.bombing)}
      <div>${d.medals.map((m, i) => `<span class="medal pop" style="animation-delay:${medalDelay(i)}s">✦ ${esc(tx(m))}</span>`).join('')}</div>
      <div class="row" style="margin-top:22px">
        ${d.nextAvailable ? `<button class="btn" data-a="next">${t('debrief.next')}</button>` : ''}
        <button class="btn ${d.nextAvailable ? 'ghost' : ''}" data-a="retry">${d.coop ? tx('Return to co-op lobby') : d.survival ? t('debrief.flyAgain') : t('debrief.retry')}</button>
        <button class="btn ghost" data-a="armory">${t('common.armory')}${d.points !== undefined ? t('debrief.pts', { n: d.points }) : ''}</button>
        <button class="btn ghost" data-a="menu">${t('debrief.menu')}</button>
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
