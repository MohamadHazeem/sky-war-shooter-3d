import type { World } from '../world/World';
import { aircraftMarkerAlpha, projectAircraft } from './MarkerProjection';
import { recordMarker } from './MarkerAudit';
import * as THREE from 'three';
import type { Aircraft } from '../world/Aircraft';
import { tx } from '../i18n';

// HUD for the special events (game/SpecialEvents.ts): a panel at the top centre (the ace's
// name, victories and health bar; the Zerstörer / rocket-barrage status with a timer) and
// floating name tags with a health bar over the aircraft involved. DOM inside #hud, which
// UI.hud() rebuilds per mission, so ensure() re-attaches. Its CSS is injected once here.

export interface PanelView {
  kicker: string;       // e.g. "ACE · 52 VICTORIES"
  title: string;        // e.g. "HAUPTMANN OTTO KESSLER"
  desc: string;
  bar: number;          // 0..1 (ace: health; raids: share of the attackers left)
  barText: string;
  timeFrac: number;     // 0..1 time left (hidden when < 0)
  ace?: boolean;
}

export interface TagSpec { a: Aircraft; label: string; health: number; ace?: boolean }

const CSS = `
#spPanel { position: absolute; left: 50%; top: 58px; width: 340px; margin-left: -170px; padding: 7px 14px 9px; background: rgba(12,14,9,0.76); border: 1px solid rgba(185,167,111,0.55); border-top: 3px solid #e8b923; text-align: center; opacity: 0; transform: translateY(-12px); transition: opacity .35s, transform .35s; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none; }
#spPanel.show { opacity: 1; transform: none; }
#spPanel .sp-k { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 2px; color: #e8b923; }
#spPanel .sp-t { font-family: 'Oswald', sans-serif; font-size: 19px; letter-spacing: 2px; text-transform: uppercase; color: #f4e7c4; line-height: 1.2; }
#spPanel .sp-d { font-family: 'Special Elite', monospace; font-size: 12px; color: rgba(240,230,200,0.85); margin-bottom: 5px; }
#spPanel .sp-row { display: flex; align-items: center; gap: 8px; }
#spPanel .sp-bar { flex: 1; height: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.25); }
#spPanel .sp-bar i { display: block; height: 100%; width: 100%; background: #d6342a; transition: width .15s; }
#spPanel.ace .sp-bar i { background: linear-gradient(90deg, #e8b923, #f2d35a); }
#spPanel .sp-p { font-family: 'IBM Plex Mono', monospace; font-size: 11px; min-width: 70px; text-align: right; color: #f4e7c4; }
#spPanel .sp-timer { height: 2px; margin-top: 5px; background: rgba(255,255,255,0.12); }
#spPanel .sp-timer i { display: block; height: 100%; width: 100%; background: rgba(240,230,200,0.6); }
#spTags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sp-tag { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; font-family: 'IBM Plex Mono', monospace; color: #ff8a50; text-shadow: 0 1px 3px rgba(0,0,0,0.95); white-space: nowrap; will-change: transform; }
.sp-tag b { font-size: 11px; letter-spacing: 1.5px; font-weight: 600; padding: 1px 6px; border: 1px solid currentColor; background: rgba(0,0,0,0.5); }
.sp-tag s { display: block; width: 46px; height: 4px; margin-top: 2px; background: rgba(0,0,0,0.6); text-decoration: none; }
.sp-tag s i { display: block; height: 100%; width: 100%; background: currentColor; }
.sp-tag.ace { color: #f2c418; }
.sp-tag.ace b { font-size: 12px; }
.sp-tag.edge { opacity: 0.75; }
`;

const _p = new THREE.Vector3();

export class SpecialHud {
  private panel = document.createElement('div');
  private tagRoot = document.createElement('div');
  private tags: { el: HTMLElement; b: HTMLElement; bar: HTMLElement; label: string; w: number; x: number; y: number; on: boolean }[] = [];
  private key = '';
  private barEl: HTMLElement;
  private pEl: HTMLElement;
  private timerEl: HTMLElement;
  private lastBar = -1;
  private lastTime = -1;
  private lastP = '';

  constructor() {
    if (!document.getElementById('spHudCss')) {
      const st = document.createElement('style');
      st.id = 'spHudCss';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.panel.id = 'spPanel';
    this.panel.innerHTML = `<div class="sp-k"></div><div class="sp-t"></div><div class="sp-d"></div><div class="sp-row"><div class="sp-bar"><i></i></div><span class="sp-p"></span></div><div class="sp-timer"><i></i></div>`;
    this.tagRoot.id = 'spTags';
    this.barEl = this.panel.querySelector('.sp-bar i') as HTMLElement;
    this.pEl = this.panel.querySelector('.sp-p') as HTMLElement;
    this.timerEl = this.panel.querySelector('.sp-timer i') as HTMLElement;
  }

  ensure() {
    if (this.panel.isConnected) return;
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.append(this.tagRoot, this.panel);
  }

  showPanel(v: PanelView) {
    this.ensure();
    const key = v.kicker + '|' + v.title + '|' + v.desc;
    if (key !== this.key) {
      this.key = key;
      (this.panel.children[0] as HTMLElement).textContent = tx(v.kicker);
      (this.panel.children[1] as HTMLElement).textContent = tx(v.title);
      (this.panel.children[2] as HTMLElement).textContent = tx(v.desc);
      this.panel.classList.toggle('ace', !!v.ace);
      this.lastBar = this.lastTime = -1; this.lastP = '';
    }
    if (!this.panel.classList.contains('show')) this.panel.classList.add('show');
    const bar = Math.round(Math.min(1, Math.max(0, v.bar)) * 200) / 2;
    if (bar !== this.lastBar) { this.lastBar = bar; this.barEl.style.width = bar + '%'; }
    if (v.barText !== this.lastP) { this.lastP = v.barText; this.pEl.textContent = tx(v.barText); }
    const tf = v.timeFrac < 0 ? 0 : Math.round(Math.min(1, v.timeFrac) * 200) / 2;
    if (tf !== this.lastTime) { this.lastTime = tf; this.timerEl.style.width = tf + '%'; (this.timerEl.parentElement as HTMLElement).style.visibility = v.timeFrac < 0 ? 'hidden' : ''; }
  }

  hidePanel() {
    if (!this.panel.classList.contains('show')) return;
    this.panel.classList.remove('show');
    this.key = '';
  }

  // Name tags over aircraft: projected here (no per-frame allocation beyond the style strings)
  setTags(list: readonly TagSpec[], n: number, cam: THREE.Camera, W: number, H: number, world: World) {
    if (n) this.ensure();
    while (this.tags.length < n) {
      const el = document.createElement('div');
      el.className = 'sp-tag';
      el.innerHTML = '<b></b><s><i></i></s>';
      this.tagRoot.append(el);
      this.tags.push({ el, b: el.firstElementChild as HTMLElement, bar: el.querySelector('i') as HTMLElement, label: '', w: -1, x: -1e9, y: -1e9, on: true });
    }
    for (let i = 0; i < this.tags.length; i++) {
      const t = this.tags[i];
      const v = i < n ? list[i] : null;
      if (!v || aircraftMarkerAlpha(v.a, world, cam) <= 0 || !projectAircraft(v.a, cam).on) { if (t.on) { t.on = false; t.el.style.display = 'none'; } continue; }
      if (!t.on) { t.on = true; t.el.style.display = ''; }
      const d = v.a.pos.distanceTo(cam.position);
      const p = projectAircraft(v.a, cam);
      const x = p.x, y = p.y, edge = false;
      t.el.style.opacity = String(aircraftMarkerAlpha(v.a, world, cam));
      recordMarker('special-tag', v.a, 'world', (x * .5 + .5) * W, (-y * .5 + .5) * H);
      const lift = edge ? 0 : Math.min(70, Math.max(18, 3000 / Math.max(1, d)));
      const px = Math.round((x * 0.5 + 0.5) * W), py = Math.round((-y * 0.5 + 0.5) * H - lift);
      if (px !== t.x || py !== t.y) { t.x = px; t.y = py; t.el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`; }
      if (v.label !== t.label) { t.label = v.label; t.b.textContent = tx(v.label); t.el.classList.toggle('ace', !!v.ace); }
      const w = Math.round(Math.min(1, Math.max(0, v.health)) * 50) * 2;
      if (w !== t.w) { t.w = w; t.bar.style.width = w + '%'; }
      t.el.classList.toggle('edge', edge);
    }
  }

  hideAll() {
    this.hidePanel();
    for (const t of this.tags) if (t.on) { t.on = false; t.el.style.display = 'none'; }
  }
}
