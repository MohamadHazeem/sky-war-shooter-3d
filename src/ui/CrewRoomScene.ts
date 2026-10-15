import { isSecondTourId } from '../game/SecondTour';
// Crew-room interlude: the scene played after a successful story mission, between the debrief and
// the campaign map (Phase 5 goal 30). Content and selection: game/CrewRoom.ts.
//
// - A Nissen hut (or the club, a Nissen hut with a bar) drawn procedurally on a canvas in one-point
//   perspective: the curved corrugated roof, the end wall with its door and windows (rain, fog,
//   snow, dusk or a clear night outside, animated), bunks along the walls (a stripped one when the
//   losses were heavy), the coke stove with its flue and flickering glow, a hanging bulb, pin-ups,
//   a map and a mission tally; in the club a bar counter, bottles, a dartboard and a gramophone.
// - The crewmen in the room as portraits (render/Portraits.ts) around the stove; the man speaking
//   is lifted and lit, the others dimmed; subtitles with his name (translated in Arabic).
// - Voices: the recorded clip for the line's exact text in the speaker's voice role (tools/voice,
//   played clean, not through the radio chain); lines with runtime numbers, or with no clip, use
//   the browser's speech synthesis. With Settings "Radio voices" on subtitles only, the lines are
//   timed for reading.
// - Ambience on the effects bus: rain on the tin roof (or wind), the stove crackling and a
//   gramophone (distant in the hut, nearer in the club), the menu music ducked under it all.
// - Space / Enter / click / tap: next line. Esc or the Skip button: end the scene.
//
// Game hooks (MissionFlow.showDebrief): capture(game, mission, debrief) at the end of the debrief,
// and play(mission, done) on the debrief's way to the campaign map. Settings "Crew-room scenes"
// (settings.crewRoom, undefined = on); dev autoplay (`auto`, or the bookends' flag) never plays.
import type { Game } from '../game/Game';
import type { Mission } from '../game/Missions';
import type { DebriefData } from './UI';
import { DEEP_PENETRATION, isChapterMission } from '../game/DeepPenetration';
import { CAMPAIGN } from '../game/Missions';
import { crewRoster, manDef, MEN, POST_CREW, ROOKIES, type ManId } from '../game/CrewRoster';
import { buildScene, spokenText, vignetteFor, VOICE_ROLE, type CrewRoomCtx, type Scene, type SceneLine, type Speaker, type Vignette } from '../game/CrewRoom';
import { loadCampaign, totals } from '../game/CampaignState';
import { portraitUrl } from '../render/Portraits';
import { sound } from '../audio/Sound';
import { tx, isAr } from '../i18n';
import { crewStories } from '../game/CrewStories';
import { say as storySay } from './CrewStoriesPanel';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const BASE = (import.meta.env?.BASE_URL ?? '/') + 'audio/voice/';
const GAP_S = 0.55;           // between two lines
const MUSIC_DUCK = 0.22;      // menu music level under the scene
const VOICE_GAIN = 1.0;

// ---------------- the outcome, tracked through the mission ----------------

interface MissionBase { wounds: Record<string, number>; rookies: { rookie: string; for: Speaker }[] }
let base: MissionBase | null = null;
crewRoster.on((e) => {
  if (e !== 'mission') return;
  const wounds: Record<string, number> = {};
  for (const m of MEN) wounds[m.id] = crewRoster.men[m.id].wounds;
  // resting men are replaced by their position's rookie for the whole mission
  const rookies = [...crewRoster.resting].map((id) => {
    const d = manDef(id);
    const post = crewRoster.postOf(id);
    const pos = d.gunner && post ? POST_CREW[post] : d.home;
    return { rookie: ROOKIES[pos].last, for: id as Speaker };
  });
  base = { wounds, rookies };
});

// ---------------- styles ----------------

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('crm-css')) return;
  const st = document.createElement('style');
  st.id = 'crm-css';
  st.textContent = `
#crewRoom { position: fixed; inset: 0; z-index: 60; background: #0a0806; overflow: hidden; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#crewRoom canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#crewRoom .crm-memorial { position: absolute; top: 82px; left: 22px; right: 22px; color: #e0c896; font-family: "Oswald", sans-serif; font-size: 16px; z-index: 2; }
#crewRoom .crm-story { position: absolute; left: 22px; width: min(400px, 38vw); z-index: 2; pointer-events: none; font-family: 'Special Elite', monospace; font-size: clamp(11px, 1.05vw, 14px); line-height: 1.5; color: #d9cfb4; text-shadow: 0 1px 3px #000; opacity: 0; transition: opacity 1.2s; }
#crewRoom .crm-story p { margin: 0 0 8px; padding: 6px 10px; background: rgba(10,8,5,0.5); border-inline-start: 2px solid rgba(224,180,69,0.6); }
html[dir=rtl] #crewRoom .crm-story { left: auto; right: 22px; font-family: 'Noto Kufi Arabic', sans-serif; }
#crewRoom .crm-cast { position: absolute; inset: 0; pointer-events: none; }
#crewRoom .crm-man { position: absolute; width: var(--ps); transform: translate(-50%, -50%) scale(0.94); transition: transform .35s ease, opacity .35s ease, filter .35s ease; opacity: 0.62; filter: saturate(0.55) brightness(0.72); text-align: center; }
#crewRoom .crm-man img { display: block; width: var(--ps); height: var(--ps); border-radius: 50%; box-shadow: 0 6px 18px rgba(0,0,0,0.65), 0 0 0 2px rgba(20,16,10,0.9), 0 0 0 3px rgba(185,167,111,0.35); }
#crewRoom .crm-man b { display: block; margin-top: 5px; font-weight: 500; font-size: clamp(9px, 1.05vw, 13px); letter-spacing: 1.5px; text-transform: uppercase; color: #d9cfb4; text-shadow: 0 1px 3px #000; white-space: nowrap; }
#crewRoom .crm-man.on { opacity: 1; filter: none; transform: translate(-50%, -54%) scale(1.13); z-index: 2; }
#crewRoom .crm-man.on img { box-shadow: 0 8px 26px rgba(0,0,0,0.7), 0 0 0 2px #1a140a, 0 0 0 4px #e0b445, 0 0 28px rgba(255,190,90,0.55); }
#crewRoom .crm-man.on b { color: #f3d68a; }
#crewRoom .crm-cap { position: absolute; top: 18px; left: 22px; pointer-events: none; font-family: 'Special Elite', monospace; color: #cbbf9f; text-shadow: 0 1px 3px #000; opacity: 0; transition: opacity 1s; }
#crewRoom .crm-cap b { display: block; font-family: 'Oswald', sans-serif; font-weight: 500; font-size: clamp(14px, 1.6vw, 22px); letter-spacing: 3px; text-transform: uppercase; color: #efe6cc; }
#crewRoom .crm-cap span { font-size: clamp(11px, 1.05vw, 14px); letter-spacing: 1px; text-transform: uppercase; }
#crewRoom .crm-skip { position: absolute; top: 14px; right: 18px; z-index: 3; background: rgba(10,9,6,0.55); border: 1px solid rgba(233,226,207,0.25); color: #e9e2cf; font-family: 'Oswald', sans-serif; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; padding: 7px 14px; cursor: pointer; }
#crewRoom .crm-skip:hover, #crewRoom .crm-skip:focus-visible { background: rgba(60,50,30,0.8); outline: none; }
#crewRoom .crm-sub { position: absolute; left: 50%; bottom: 6.5vh; transform: translateX(-50%); width: min(980px, 92vw); text-align: center; pointer-events: none; min-height: 3.2em; }
#crewRoom .crm-sub .who { display: block; color: #e0b445; font-family: 'Oswald', sans-serif; font-size: clamp(10px, 1.05vw, 14px); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 4px; text-shadow: 0 1px 3px #000; }
#crewRoom .crm-sub .txt { display: inline; background: rgba(0,0,0,0.62); color: #fff; font-family: 'Oswald', sans-serif; font-size: clamp(14px, 1.65vw, 23px); line-height: 1.55; padding: 3px 12px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
#crewRoom .crm-sub.fade { opacity: 0; transition: opacity .25s; }
#crewRoom .crm-hint { position: absolute; right: 18px; bottom: 12px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: rgba(233,226,207,0.55); pointer-events: none; }
#crewRoom .crm-end { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0; transition: opacity 1.4s; font-family: 'Oswald', sans-serif; font-size: clamp(22px, 3.4vw, 44px); letter-spacing: 8px; text-transform: uppercase; color: #efe6cc; text-shadow: 0 2px 12px #000; }
#crewRoom .crm-fade { position: absolute; inset: 0; z-index: 5; background: #000; pointer-events: none; transition: opacity .7s; }
html[dir=rtl] #crewRoom .crm-cap { left: auto; right: 22px; }
html[dir=rtl] #crewRoom .crm-skip { right: auto; left: 18px; }
html[dir=rtl] #crewRoom .crm-hint { right: auto; left: 18px; }
html[dir=rtl] #crewRoom .crm-cap b, html[dir=rtl] #crewRoom .crm-cap span, html[dir=rtl] #crewRoom .crm-man b, html[dir=rtl] #crewRoom .crm-sub .who, html[dir=rtl] #crewRoom .crm-end { letter-spacing: 0; }
html[dir=rtl] #crewRoom .crm-sub .txt { font-family: 'Noto Kufi Arabic', 'Oswald', sans-serif; line-height: 1.8; }
@media (max-height: 460px) {
  #crewRoom .crm-sub { bottom: 2.5vh; }
  #crewRoom .crm-sub .txt { font-size: 14px; line-height: 1.45; }
  #crewRoom .crm-cap { top: 10px; left: 14px; }
  #crewRoom .crm-skip { top: 8px; right: 10px; padding: 5px 10px; font-size: 12px; }
  #crewRoom .crm-hint { display: none; }
  #crewRoom .crm-story { display: none; }
}
`;
  document.head.appendChild(st);
}

// ---------------- the hut, drawn ----------------

type Wx = Vignette['weather'];
interface Win { x: number; y: number; w: number; h: number }

const rnd = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

class HutPainter {
  readonly canvas = document.createElement('canvas');
  private bg = document.createElement('canvas');
  private W = 0; private H = 0; private dpr = 1;
  private vx = 0; private vy = 0; private S = 1;
  private readonly E = 0.42;   // eye height (fraction of the hut's radius)
  private readonly ZF = 3.2;   // depth of the end wall
  private wins: Win[] = [];
  private stove = { x: 0, y: 0, r: 0, door: { x: 0, y: 0, w: 0, h: 0 } };
  private bulb = { x: 0, y: 0, r: 0 };
  private drops: { x: number; y: number; v: number; l: number }[] = [];
  private flash = 0;
  constructor(private v: Vignette, private emptyBunk: boolean) {}

  // screen position of a point in hut space: x across (-1..1), y up (0 floor, 1 roof top), z depth
  private P(x: number, y: number, z: number): [number, number] {
    return [this.vx + (x * this.S) / z, this.vy + ((this.E - y) * this.S) / z];
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, Math.round(w * this.dpr)); this.H = Math.max(1, Math.round(h * this.dpr));
    for (const c of [this.canvas, this.bg]) { c.width = this.W; c.height = this.H; }
    this.vx = this.W / 2; this.vy = this.H * 0.4;
    this.S = Math.min(this.W * 0.62, this.H * 1.1);
    this.paint();
  }

  /** Where the portraits go: an arc in front of the stove (CSS pixels). */
  castSpots(n: number): { x: number; y: number; size: number }[] {
    const w = this.W / this.dpr, h = this.H / this.dpr;
    const size = Math.round(Math.max(50, Math.min(112, Math.min(w, h) * 0.13)));
    const [sx, sy] = this.P(0, 0, 2.1);
    const cx = sx / this.dpr, cy = sy / this.dpr - h * 0.04;
    const rx = Math.min(w * 0.38, 640), ry = h < 460 ? h * 0.13 : h * 0.17;
    const out: { x: number; y: number; size: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? Math.PI / 2 : (Math.PI - 0.12) - (i * (Math.PI - 0.24)) / (n - 1);
      out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), size });
    }
    return out;
  }

  // ---- static layer ----
  private paint() {
    const g = this.bg.getContext('2d')!;
    const { W, H, v } = this;
    const club = v.setting === 'club';
    g.clearRect(0, 0, W, H);
    // roof and walls: corrugated iron, warm near the stove, black in the far corners
    const [scx, scy] = this.P(0, 0.3, 2.1);
    const wall = g.createRadialGradient(scx, scy, this.S * 0.05, scx, scy, this.S * 1.25);
    wall.addColorStop(0, club ? '#6a5236' : '#5d4a33'); wall.addColorStop(0.45, club ? '#33281b' : '#2e261b'); wall.addColorStop(1, '#0c0a07');
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // corrugations: close arcs receding to the end wall; a heavier rib every few
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
      const z = 1 / (1 - (i / steps) * (1 - 1 / this.ZF));    // even spacing in depth
      if (z > this.ZF) break;
      const [cx, cy] = this.P(0, 0, z);
      const r = this.S / z;
      const rib = i % 15 === 0;
      const lit = Math.max(0, 1 - Math.abs(z - 2.1) / 2.2);
      g.strokeStyle = rib ? `rgba(10,8,5,${0.55})` : i % 2 ? `rgba(255,220,170,${0.04 + 0.08 * lit})` : `rgba(0,0,0,${0.18})`;
      g.lineWidth = rib ? Math.max(2, r * 0.012) : Math.max(1, r * 0.004);
      g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI); g.stroke();
    }
    // floor: planks running down the hut
    const n0 = this.P(-1, 0, 0.62), n1 = this.P(1, 0, 0.62), f0 = this.P(-1, 0, this.ZF), f1 = this.P(1, 0, this.ZF);
    const fl = g.createLinearGradient(0, f0[1], 0, H);
    fl.addColorStop(0, '#2a1f14'); fl.addColorStop(0.5, '#4a3622'); fl.addColorStop(1, '#2b2016');
    g.fillStyle = fl;
    g.beginPath(); g.moveTo(n0[0], n0[1]); g.lineTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(n1[0], n1[1]); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, this.S * 0.0016);
    for (let x = -1; x <= 1.001; x += 0.1) {
      const a = this.P(x, 0, 0.62), b = this.P(x, 0, this.ZF);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    const r1 = rnd(7);
    for (let k = 0; k < 40; k++) {
      const x = -1 + Math.floor(r1() * 20) * 0.1, z = 0.8 + r1() * (this.ZF - 0.9);
      const a = this.P(x, 0, z), b = this.P(x + 0.1, 0, z);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    this.endWall(g);
    if (club) this.clubFurniture(g); else this.bunks(g);
    this.pinups(g, club);
    this.stoveAndBulb(g);
    // vignette
    const vg = g.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  private endWall(g: CanvasRenderingContext2D) {
    const z = this.ZF;
    const [cx, cy] = this.P(0, 0, z);
    const r = this.S / z;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI); g.closePath(); g.clip();
    const wg = g.createLinearGradient(0, cy - r, 0, cy);
    wg.addColorStop(0, '#1c160f'); wg.addColorStop(1, '#3b2d1d');
    g.fillStyle = wg; g.fillRect(cx - r, cy - r, 2 * r, r);
    // boards
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = Math.max(1, r * 0.006);
    for (let x = cx - r; x < cx + r; x += r * 0.09) { g.beginPath(); g.moveTo(x, cy - r); g.lineTo(x, cy); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(8,6,4,0.8)'; g.lineWidth = Math.max(2, r * 0.025);
    g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI); g.stroke();
    // door
    const dw = r * 0.34, dh = r * 0.62;
    g.fillStyle = '#20180f'; g.fillRect(cx - dw / 2, cy - dh, dw, dh);
    g.strokeStyle = '#120d08'; g.lineWidth = Math.max(1, r * 0.012); g.strokeRect(cx - dw / 2, cy - dh, dw, dh);
    g.fillStyle = '#7a6040'; g.beginPath(); g.arc(cx + dw * 0.36, cy - dh * 0.48, Math.max(1.5, r * 0.012), 0, Math.PI * 2); g.fill();
    // windows either side (the weather outside, drawn every frame)
    const ww = r * 0.26, wh = r * 0.22, wy = cy - r * 0.62;
    this.wins = [{ x: cx - r * 0.62 - ww / 2, y: wy, w: ww, h: wh }, { x: cx + r * 0.62 - ww / 2, y: wy, w: ww, h: wh }];
    // blackout curtains drawn back
    for (const w of this.wins) {
      g.fillStyle = '#141008';
      g.fillRect(w.x - w.w * 0.22, w.y - w.h * 0.12, w.w * 0.24, w.h * 1.3);
      g.fillRect(w.x + w.w * 0.98, w.y - w.h * 0.12, w.w * 0.24, w.h * 1.3);
    }
    // a framed photograph of the Sky Queen above the door
    g.fillStyle = '#c9bc98'; g.fillRect(cx - r * 0.1, cy - dh - r * 0.17, r * 0.2, r * 0.12);
    g.fillStyle = '#4f4a3c'; g.fillRect(cx - r * 0.085, cy - dh - r * 0.158, r * 0.17, r * 0.096);
    g.fillStyle = '#9aa0a0';
    g.fillRect(cx - r * 0.06, cy - dh - r * 0.115, r * 0.12, r * 0.012);   // wing
    g.fillRect(cx - r * 0.008, cy - dh - r * 0.135, r * 0.016, r * 0.05);  // fuselage
  }

  // two-tier bunks along both walls, footlockers; the stripped one when losses were heavy
  private bunks(g: CanvasRenderingContext2D) {
    const rows: [number, number][] = [[1.3, 1.72], [1.92, 2.3], [2.48, 2.84]];
    const r2 = rnd(11);
    let k = 0;
    for (const side of [-1, 1]) {
      for (const [z0, z1] of rows) {
        const stripped = this.emptyBunk && side === 1 && k % 3 === 1;
        this.bunk(g, side, z0, z1, stripped, r2);
        k++;
      }
    }
  }

  private quad(g: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fill();
  }

  private bunk(g: CanvasRenderingContext2D, side: number, z0: number, z1: number, stripped: boolean, r: () => number) {
    const xin = side * 0.5, xout = side * 0.86;
    const post = (x: number, z: number) => {
      const a = this.P(x, 0, z), b = this.P(x, 0.66, z);
      g.strokeStyle = '#1a140c'; g.lineWidth = Math.max(2, (this.S / z) * 0.012);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    };
    post(xout, z1); post(xin, z1);
    for (const [yb, top] of [[0.2, true], [0.52, false]] as const) {
      const yt = yb + 0.06;
      // mattress top and front edge
      this.quad(g, [this.P(xin, yt, z0), this.P(xout, yt, z0), this.P(xout, yt, z1), this.P(xin, yt, z1)], stripped && top ? '#8c836a' : '#4b4f31');
      this.quad(g, [this.P(xin, yb, z0), this.P(xin, yt, z0), this.P(xin, yt, z1), this.P(xin, yb, z1)], stripped && top ? '#6d6550' : '#363a22');
      if (stripped && top) {
        // ticking stripes, the mattress rolled up at the head, a folded blanket on top
        g.strokeStyle = 'rgba(60,70,90,0.45)'; g.lineWidth = Math.max(1, this.S * 0.0015);
        for (let t = 0.1; t < 1; t += 0.16) { const a = this.P(xin + (xout - xin) * t, yt, z0), b = this.P(xin + (xout - xin) * t, yt, z1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
        const [rx, ry] = this.P(xout - side * 0.08, yt + 0.05, (z0 + z1) / 2);
        g.fillStyle = '#7b7360'; g.beginPath(); g.ellipse(rx, ry, (this.S / z1) * 0.05, (this.S / z0) * 0.06, 0, 0, Math.PI * 2); g.fill();
        const fb = this.P(xin + side * 0.1, yt + 0.02, z0 + 0.12);
        g.fillStyle = '#3f432a'; g.fillRect(fb[0] - (this.S / z0) * 0.04, fb[1] - (this.S / z0) * 0.02, (this.S / z0) * 0.08, (this.S / z0) * 0.03);
      } else {
        // blanket folded back, a white sheet and pillow at the wall end
        this.quad(g, [this.P(xout - side * 0.12, yt + 0.003, z0), this.P(xout, yt + 0.003, z0), this.P(xout, yt + 0.003, z1), this.P(xout - side * 0.12, yt + 0.003, z1)], '#d8d2c0');
        if (r() < 0.5) this.quad(g, [this.P(xin, yt + 0.004, z0), this.P(xin + side * 0.14, yt + 0.004, z0), this.P(xin + side * 0.14, yt + 0.004, z1), this.P(xin, yt + 0.004, z1)], '#5d5f3a');
      }
    }
    post(xout, z0); post(xin, z0);
    // footlocker on the floor
    const fz = z0 - 0.08;
    this.quad(g, [this.P(xin - side * 0.02, 0.1, fz), this.P(xin + side * 0.2, 0.1, fz), this.P(xin + side * 0.2, 0, fz), this.P(xin - side * 0.02, 0, fz)], '#3d3222');
    this.quad(g, [this.P(xin - side * 0.02, 0.1, fz), this.P(xin + side * 0.2, 0.1, fz), this.P(xin + side * 0.2, 0.1, fz + 0.16), this.P(xin - side * 0.02, 0.1, fz + 0.16)], '#55452e');
  }

  private clubFurniture(g: CanvasRenderingContext2D) {
    // the bar along the right wall
    const x0 = 0.42, x1 = 0.66, z0 = 1.2, z1 = 2.9, h = 0.36;
    this.quad(g, [this.P(x0, h, z0), this.P(x1, h, z0), this.P(x1, h, z1), this.P(x0, h, z1)], '#5a3c22');
    this.quad(g, [this.P(x0, 0, z0), this.P(x0, h, z0), this.P(x0, h, z1), this.P(x0, 0, z1)], '#3b2716');
    this.quad(g, [this.P(x0, 0, z0), this.P(x1, 0, z0), this.P(x1, h, z0), this.P(x0, h, z0)], '#4a311c');
    g.strokeStyle = 'rgba(255,210,150,0.18)'; g.lineWidth = Math.max(1, this.S * 0.002);
    for (let z = z0 + 0.2; z < z1; z += 0.2) { const a = this.P(x0, 0.02, z), b = this.P(x0, h - 0.02, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    // bottles on the shelf behind it
    const r3 = rnd(5);
    for (let z = 1.4; z < 2.8; z += 0.09) {
      const [bx, by] = this.P(0.84, 0.62, z);
      const s = this.S / z;
      g.fillStyle = ['#2f4a2a', '#5a3a1a', '#6a6a5a', '#3a2a1a'][Math.floor(r3() * 4)];
      g.fillRect(bx - s * 0.012, by - s * 0.09, s * 0.024, s * 0.09);
      g.fillRect(bx - s * 0.005, by - s * 0.12, s * 0.01, s * 0.03);
    }
    const [sa, sb] = [this.P(0.86, 0.62, 1.35), this.P(0.86, 0.62, 2.85)];
    g.strokeStyle = '#2a1c10'; g.lineWidth = Math.max(2, this.S * 0.006); g.beginPath(); g.moveTo(sa[0], sa[1]); g.lineTo(sb[0], sb[1]); g.stroke();
    // the gramophone on the bar
    const [gx, gy] = this.P(0.54, h, 1.75);
    const s = this.S / 1.75;
    g.fillStyle = '#2e1f12'; g.fillRect(gx - s * 0.05, gy - s * 0.045, s * 0.1, s * 0.045);
    g.fillStyle = '#c9a85a';
    g.beginPath(); g.moveTo(gx, gy - s * 0.05); g.lineTo(gx - s * 0.02, gy - s * 0.12); g.lineTo(gx - s * 0.1, gy - s * 0.2); g.lineTo(gx + s * 0.02, gy - s * 0.22); g.lineTo(gx + s * 0.01, gy - s * 0.12); g.closePath(); g.fill();
    // tables and chairs on the left
    for (const [tx, tz] of [[-0.45, 1.5], [-0.5, 2.3]] as const) {
      const [cx, cy] = this.P(tx, 0.3, tz);
      const sz = this.S / tz;
      g.fillStyle = '#4a321d'; g.beginPath(); g.ellipse(cx, cy, sz * 0.16, sz * 0.045, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1c10'; g.fillRect(cx - sz * 0.012, cy, sz * 0.024, sz * 0.3);
      g.fillStyle = 'rgba(220,210,180,0.75)'; g.fillRect(cx - sz * 0.05, cy - sz * 0.05, sz * 0.025, sz * 0.045);
      g.fillStyle = 'rgba(120,70,30,0.85)'; g.fillRect(cx + sz * 0.03, cy - sz * 0.07, sz * 0.02, sz * 0.065);
    }
    // dartboard on the end wall
    const [dx, dy] = this.P(-0.5, 0.55, this.ZF);
    const dr = (this.S / this.ZF) * 0.06;
    for (const [rr, c] of [[1, '#1b1b16'], [0.8, '#b9b19b'], [0.62, '#7a1f16'], [0.42, '#b9b19b'], [0.16, '#2a5a2a']] as const) {
      g.fillStyle = c; g.beginPath(); g.arc(dx, dy, dr * rr, 0, Math.PI * 2); g.fill();
    }
  }

  // pin-ups, a map of Europe, the mission tally: paper shapes on the curved wall
  private pinups(g: CanvasRenderingContext2D, club: boolean) {
    const onWall = (side: number, y0: number, y1: number, z0: number, z1: number) => {
      const xw = (y: number) => side * Math.sqrt(Math.max(0, 1 - y * y)) * 0.985;
      return [this.P(xw(y1), y1, z0), this.P(xw(y1), y1, z1), this.P(xw(y0), y0, z1), this.P(xw(y0), y0, z0)] as [number, number][];
    };
    const posters: { side: number; y: number; z: number; kind: 'pinup' | 'map' | 'tally' | 'calendar'; tint: string }[] = club
      ? [{ side: -1, y: 0.5, z: 1.7, kind: 'pinup', tint: '#e8b9a0' }, { side: -1, y: 0.52, z: 2.3, kind: 'map', tint: '#d9cfa8' }, { side: 1, y: 0.8, z: 2.0, kind: 'pinup', tint: '#a8c4d8' }]
      : [{ side: -1, y: 0.76, z: 1.75, kind: 'pinup', tint: '#e8b9a0' }, { side: -1, y: 0.78, z: 2.2, kind: 'map', tint: '#d9cfa8' }, { side: 1, y: 0.76, z: 1.72, kind: 'tally', tint: '#e2dcc6' },
        { side: 1, y: 0.78, z: 2.2, kind: 'pinup', tint: '#a8c4d8' }, { side: -1, y: 0.8, z: 2.7, kind: 'calendar', tint: '#ece4cc' }, { side: 1, y: 0.8, z: 2.7, kind: 'pinup', tint: '#e4c78e' }];
    for (const p of posters) {
      const dz = p.kind === 'map' ? 0.22 : 0.12;
      const q = onWall(p.side, p.y - 0.08, p.y + 0.08, p.z, p.z + dz);
      this.quad(g, q, p.kind === 'map' ? '#d9cfa8' : p.kind === 'tally' || p.kind === 'calendar' ? p.tint : p.tint);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      // centre and size of the sheet on screen
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const w = Math.abs(q[1][0] - q[0][0]) || 1, h = Math.abs(q[3][1] - q[0][1]) || 1;
      if (p.kind === 'pinup') {
        // a stylised figure: head, hair, a bathing suit, legs; simple shapes only
        g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(cx, cy - h * 0.3, w * 0.13, h * 0.1, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e6b892'; g.beginPath(); g.ellipse(cx, cy - h * 0.27, w * 0.09, h * 0.075, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b8352a'; g.beginPath(); g.ellipse(cx, cy - h * 0.03, w * 0.12, h * 0.17, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#e6b892'; g.lineWidth = Math.max(1, w * 0.07);
        g.beginPath(); g.moveTo(cx - w * 0.04, cy + h * 0.12); g.lineTo(cx - w * 0.07, cy + h * 0.38); g.moveTo(cx + w * 0.04, cy + h * 0.12); g.lineTo(cx + w * 0.1, cy + h * 0.36); g.stroke();
      } else if (p.kind === 'map') {
        g.fillStyle = '#9fb08a';
        g.beginPath(); g.ellipse(cx - w * 0.22, cy - h * 0.05, w * 0.12, h * 0.25, 0.3, 0, Math.PI * 2); g.fill();   // England
        g.beginPath(); g.ellipse(cx + w * 0.2, cy + h * 0.08, w * 0.26, h * 0.3, 0, 0, Math.PI * 2); g.fill();     // the continent
        g.strokeStyle = '#a3322a'; g.lineWidth = Math.max(1, w * 0.015);
        g.beginPath(); g.moveTo(cx - w * 0.2, cy); g.lineTo(cx + w * 0.25, cy + h * 0.1); g.stroke();            // the route, in red wool
      } else if (p.kind === 'tally') {
        g.fillStyle = '#2b2518';
        for (let i = 0; i < 12; i++) g.fillRect(cx - w * 0.36 + (i % 4) * w * 0.2, cy - h * 0.3 + Math.floor(i / 4) * h * 0.24, w * 0.12, h * 0.08);
      } else {
        g.fillStyle = '#8a2a20'; g.fillRect(cx - w * 0.36, cy - h * 0.38, w * 0.72, h * 0.16);
        g.fillStyle = 'rgba(43,37,24,0.6)';
        for (let i = 0; i < 20; i++) g.fillRect(cx - w * 0.34 + (i % 5) * w * 0.15, cy - h * 0.12 + Math.floor(i / 5) * h * 0.12, w * 0.08, h * 0.06);
      }
    }
  }

  private stoveAndBulb(g: CanvasRenderingContext2D) {
    const z = 2.1;
    const s = this.S / z;
    const [bx, by] = this.P(0, 0, z);
    const rr = s * 0.085, hh = s * 0.27;
    // flue up through the roof
    const [, ty] = this.P(0, 1, z);
    g.fillStyle = '#16120c'; g.fillRect(bx - s * 0.014, ty, s * 0.028, by - hh - ty);
    // a sheet-iron base, the pot-bellied body, the lid
    g.fillStyle = '#2a241c'; g.beginPath(); g.ellipse(bx, by, rr * 1.9, rr * 0.5, 0, 0, Math.PI * 2); g.fill();
    const body = g.createLinearGradient(bx - rr, 0, bx + rr, 0);
    body.addColorStop(0, '#0e0c09'); body.addColorStop(0.45, '#3a332a'); body.addColorStop(1, '#0e0c09');
    g.fillStyle = body;
    g.beginPath(); g.moveTo(bx - rr * 0.7, by); g.quadraticCurveTo(bx - rr * 1.25, by - hh * 0.5, bx - rr * 0.75, by - hh); g.lineTo(bx + rr * 0.75, by - hh); g.quadraticCurveTo(bx + rr * 1.25, by - hh * 0.5, bx + rr * 0.7, by); g.closePath(); g.fill();
    g.fillStyle = '#22201a'; g.beginPath(); g.ellipse(bx, by - hh, rr * 0.8, rr * 0.22, 0, 0, Math.PI * 2); g.fill();
    this.stove = { x: bx, y: by - hh * 0.42, r: s, door: { x: bx - rr * 0.38, y: by - hh * 0.5, w: rr * 0.76, h: hh * 0.24 } };
    // a coal scuttle and a bench by the stove
    const [kx, ky] = this.P(0.2, 0, 1.9);
    g.fillStyle = '#1c1a15'; g.fillRect(kx - s * 0.04, ky - s * 0.07, s * 0.08, s * 0.07);
    // the bulb on its flex
    const [lx, ly] = this.P(0, 0.88, 1.65);
    const [, topY] = this.P(0, 1, 1.65);
    g.strokeStyle = '#0d0b08'; g.lineWidth = Math.max(1, this.S * 0.0018);
    g.beginPath(); g.moveTo(lx, topY); g.lineTo(lx, ly); g.stroke();
    g.fillStyle = '#2a251c'; g.beginPath(); g.moveTo(lx - this.S * 0.03, ly + this.S * 0.012); g.lineTo(lx + this.S * 0.03, ly + this.S * 0.012); g.lineTo(lx + this.S * 0.008, ly - this.S * 0.008); g.lineTo(lx - this.S * 0.008, ly - this.S * 0.008); g.closePath(); g.fill();
    this.bulb = { x: lx, y: ly + this.S * 0.018, r: this.S * 0.011 };
  }

  // ---- per frame ----
  frame(t: number, dt: number) {
    const g = this.canvas.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.bg, 0, 0);
    this.weather(g, t, dt);
    // the stove: the grate glows through the door, the light breathes
    const fl = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.2) + 0.05 * Math.sin(t * 2.1);
    const d = this.stove.door;
    const dg = g.createLinearGradient(0, d.y, 0, d.y + d.h);
    dg.addColorStop(0, `rgba(255,${Math.round(150 + 50 * fl)},60,${0.8 * fl})`); dg.addColorStop(1, `rgba(200,60,10,${0.9 * fl})`);
    g.fillStyle = dg; g.fillRect(d.x, d.y, d.w, d.h);
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(this.stove.x, this.stove.y, 0, this.stove.x, this.stove.y, this.stove.r * 1.25);
    glow.addColorStop(0, `rgba(255,140,50,${0.26 * fl})`); glow.addColorStop(0.35, `rgba(200,90,30,${0.1 * fl})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, this.W, this.H);
    // the bulb, with the odd flicker of a wartime supply
    const b = 0.9 + 0.04 * Math.sin(t * 50) * (Math.random() < 0.02 ? 1 : 0);
    const halo = g.createRadialGradient(this.bulb.x, this.bulb.y, 0, this.bulb.x, this.bulb.y, this.S * 0.55);
    halo.addColorStop(0, `rgba(255,220,150,${0.32 * b})`); halo.addColorStop(0.12, `rgba(255,190,110,${0.12 * b})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, this.W, this.H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(this.bulb.x, this.bulb.y, this.bulb.r, 0, Math.PI * 2); g.fill();
    if (this.flash > 0) { g.fillStyle = `rgba(200,210,255,${this.flash * 0.12})`; g.fillRect(0, 0, this.W, this.H); }
  }

  private sky(wx: Wx): [string, string] {
    const night = this.v.time === 'Night';
    if (wx === 'dusk') return ['#e0894a', '#5a3c4a'];
    if (wx === 'fog') return night ? ['#2c3034', '#3a3e42'] : ['#8c9094', '#a0a4a6'];
    if (wx === 'snow') return night ? ['#1c2230', '#3a4252'] : ['#8a929c', '#b0b6bc'];
    if (wx === 'rain' || wx === 'storm') return night ? ['#0e1420', '#1c2434'] : ['#4a525c', '#68707a'];
    return night ? ['#070c1a', '#18223c'] : ['#7aa0c8', '#c0d4e4'];
  }

  private weather(g: CanvasRenderingContext2D, t: number, dt: number) {
    const wx = this.v.weather;
    const [c0, c1] = this.sky(wx);
    if (wx === 'storm' || wx === 'rain') { if (Math.random() < (wx === 'storm' ? 0.004 : 0.0008)) this.flash = 1; }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    for (const w of this.wins) {
      g.save();
      g.beginPath(); g.rect(w.x, w.y, w.w, w.h); g.clip();
      const sk = g.createLinearGradient(0, w.y, 0, w.y + w.h);
      sk.addColorStop(0, c0); sk.addColorStop(1, c1);
      g.fillStyle = sk; g.fillRect(w.x, w.y, w.w, w.h);
      if (this.flash > 0) { g.fillStyle = `rgba(220,225,255,${this.flash * 0.8})`; g.fillRect(w.x, w.y, w.w, w.h); }
      if (wx === 'clear' && this.v.time === 'Night') {
        const r = rnd(Math.round(w.x) + 3);
        g.fillStyle = 'rgba(255,255,240,0.8)';
        for (let i = 0; i < 14; i++) { const tw = 0.5 + 0.5 * Math.sin(t * 2 + i); g.globalAlpha = 0.4 + 0.6 * tw; g.fillRect(w.x + r() * w.w, w.y + r() * w.h * 0.8, 1.5, 1.5); }
        g.globalAlpha = 1;
        if (w === this.wins[1]) { g.fillStyle = '#efe8cf'; g.beginPath(); g.arc(w.x + w.w * 0.7, w.y + w.h * 0.3, w.h * 0.12, 0, Math.PI * 2); g.fill(); }
      }
      if (wx === 'dusk') {
        g.fillStyle = 'rgba(255,200,120,0.5)'; g.beginPath(); g.arc(w.x + w.w * 0.3, w.y + w.h * 0.95, w.h * 0.25, 0, Math.PI * 2); g.fill();
      }
      // the airfield beyond: a dark line of hangars and trees
      g.fillStyle = 'rgba(8,8,8,0.75)'; g.fillRect(w.x, w.y + w.h * 0.8, w.w, w.h * 0.2);
      g.fillRect(w.x + w.w * 0.15, w.y + w.h * 0.68, w.w * 0.3, w.h * 0.14);
      if (wx === 'fog') { g.fillStyle = 'rgba(170,175,180,0.45)'; g.fillRect(w.x, w.y, w.w, w.h); }
      if (wx === 'rain' || wx === 'storm') {
        g.strokeStyle = 'rgba(190,205,230,0.45)'; g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < 26; i++) {
          const x = w.x + ((i * 37.7 + t * 30) % w.w);
          const y = w.y + ((i * 53.3 + t * w.h * 2.6) % w.h);
          g.moveTo(x, y); g.lineTo(x - 2, y + w.h * 0.12);
        }
        g.stroke();
        // drops running down the glass
        if (this.drops.length < 8 && Math.random() < dt * 3) this.drops.push({ x: Math.random(), y: 0, v: 0.05 + Math.random() * 0.12, l: 0.04 + Math.random() * 0.05 });
      }
      if (wx === 'snow') {
        g.fillStyle = 'rgba(240,244,250,0.85)';
        for (let i = 0; i < 22; i++) {
          const x = w.x + ((i * 41.3 + Math.sin(t * 0.8 + i) * 6 + t * 4) % w.w);
          const y = w.y + ((i * 29.1 + t * w.h * 0.25) % w.h);
          g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill();
        }
      }
      for (const d of this.drops) {
        g.strokeStyle = 'rgba(220,230,250,0.55)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(w.x + d.x * w.w, w.y + d.y * w.h); g.lineTo(w.x + d.x * w.w, w.y + (d.y - d.l) * w.h); g.stroke();
      }
      // frame and glazing bars
      g.restore();
      g.strokeStyle = '#100c07'; g.lineWidth = Math.max(2, w.w * 0.05);
      g.strokeRect(w.x, w.y, w.w, w.h);
      g.lineWidth = Math.max(1, w.w * 0.025);
      g.beginPath(); g.moveTo(w.x + w.w / 2, w.y); g.lineTo(w.x + w.w / 2, w.y + w.h); g.moveTo(w.x, w.y + w.h / 2); g.lineTo(w.x + w.w, w.y + w.h / 2); g.stroke();
    }
    for (const d of this.drops) d.y += d.v * dt;
    this.drops = this.drops.filter((d) => d.y - d.l < 1);
  }
}

// ---------------- sound: voices and ambience ----------------

interface Clip { file: string; role: string; text: string; dur: number }
let manifest: Promise<Record<string, Clip> | null> | null = null;
function loadManifest() {
  manifest ??= fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => (m && typeof m.clips === 'object' ? m.clips as Record<string, Clip> : null)).catch(() => null);
  return manifest;
}

/** The recorded clip for a line in its speaker's voice (exact text, the man's voice role). */
export function clipFor(clips: Record<string, Clip>, l: SceneLine): string | null {
  if (l.dyn) return null;
  const want = norm(spokenText(l)), role = VOICE_ROLE[l.who];
  for (const [id, c] of Object.entries(clips)) if (id.startsWith('cr_') && c.role === role && norm(c.text) === want) return id;
  return null;
}

// speech-synthesis voice for each man (the dynamic lines): a stable pick among English voices
const TTS_PITCH: Record<Speaker, number> = { brenner: 0.85, doyle: 1.05, stern: 0.95, kessler: 0.9, mendez: 0.8, gallo: 1.1, reilly: 1.15, price: 0.75, walsh: 1.0, dawson: 1.0 };

class RoomSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private amb: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private gram: GainNode | null = null;
  private gramTimer = 0;
  private bufs = new Map<string, Promise<AudioBuffer | null>>();
  private src: AudioBufferSourceNode | null = null;
  private speaking: SpeechSynthesisUtterance | null = null;
  private duckTimer = 0;
  clips: Record<string, Clip> | null = null;

  get voices() { return sound.radioEnabled; }

  async prepare(lines: SceneLine[]) {
    this.clips = this.voices ? await loadManifest() : null;
    const ctx = sound.ctx;
    if (!ctx || !this.clips) return;
    for (const l of lines) { const id = clipFor(this.clips, l); if (id) this.buf(ctx, id); }
  }

  private buf(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
    let p = this.bufs.get(id);
    if (!p) {
      const c = this.clips?.[id];
      p = !c ? Promise.resolve(null) : fetch(BASE + c.file).then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('text/html') ? r.arrayBuffer() : null))
        .then((data) => (data ? new Promise<AudioBuffer | null>((res) => { const pr = ctx.decodeAudioData(data, res, () => res(null)) as Promise<AudioBuffer> | undefined; pr?.catch(() => res(null)); }) : null))
        .catch(() => null);
      this.bufs.set(id, p);
    }
    return p;
  }

  // keep the menu music down for the whole scene
  private keepDucked() {
    sound.duckFor(25, MUSIC_DUCK, 1);
    this.duckTimer = window.setTimeout(() => this.keepDucked(), 20000);
  }

  startAmbience(v: Vignette) {
    const ctx = sound.ctx, bus = sound.sfxBus();
    if (!ctx || !bus) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(bus);
    this.out = out;
    this.keepDucked();
    const loop = (buf: AudioBuffer, gain: number, filter?: BiquadFilterNode) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = gain;
      if (filter) s.connect(filter).connect(g); else s.connect(g);
      g.connect(out);
      s.start(ctx.currentTime + Math.random() * 0.1, Math.random() * buf.duration);
      this.amb.push(s); this.nodes.push(g); if (filter) this.nodes.push(filter);
    };
    const wet = v.weather === 'rain' || v.weather === 'storm';
    if (wet) loop(rainBuffer(ctx, v.weather === 'storm' ? 1.4 : 1), 0.5);
    else loop(windBuffer(ctx, v.weather === 'snow' ? 1.2 : 0.7), 0.35);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
    loop(stoveBuffer(ctx), 0.42, lp);
    this.gramophone(ctx, out, !!v.gramophone);
  }

  // A gramophone: an original slow waltz on a worn record, band-limited, with crackle and wow.
  // Distant (the next hut) unless the scene is at the club or someone winds it up (cue).
  private gramophone(ctx: AudioContext, out: AudioNode, near: boolean) {
    const g = ctx.createGain(); g.gain.value = near ? 0.32 : 0.11;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = near ? 3200 : 1500;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 1100; bp.gain.value = 5; bp.Q.value = 0.8;
    hp.connect(bp).connect(lp).connect(g).connect(out);
    this.nodes.push(g, hp, lp, bp);
    this.gram = g;
    this.gramLp = lp;
    // record crackle
    const cr = ctx.createBufferSource(); cr.buffer = crackleBuffer(ctx); cr.loop = true;
    const cg = ctx.createGain(); cg.gain.value = 0.5; cr.connect(cg).connect(hp); cr.start();
    this.amb.push(cr); this.nodes.push(cg);
    // wow: a slow wobble on every note
    const wow = ctx.createOscillator(); wow.frequency.value = 0.55;
    const wowG = ctx.createGain(); wowG.gain.value = 9; wow.connect(wowG); wow.start();
    this.amb.push(wow); this.nodes.push(wowG);
    const beat = 60 / 88;   // 3/4 at 88 bpm
    let t = ctx.currentTime + 1.2, i = 0;
    const note = (midi: number, at: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      wowG.connect(o.detune);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(vol, at + 0.03); e.gain.exponentialRampToValueAtTime(vol * 0.35, at + dur * 0.6); e.gain.linearRampToValueAtTime(0, at + dur);
      o.connect(e).connect(hp);
      o.start(at); o.stop(at + dur + 0.05);
      o.onended = () => { try { wowG.disconnect(o.detune); } catch { /* */ } o.disconnect(); e.disconnect(); };
    };
    const tick = () => {
      if (!this.gram) return;
      while (t < ctx.currentTime + 0.6) {
        const bar = WALTZ[i % WALTZ.length];
        const [root, third, fifth] = bar.chord;
        note(root - 12, t, beat * 0.9, 'triangle', 0.16);
        note(third, t + beat, beat * 0.6, 'sine', 0.05); note(fifth, t + beat, beat * 0.6, 'sine', 0.05);
        note(third, t + 2 * beat, beat * 0.6, 'sine', 0.05); note(fifth, t + 2 * beat, beat * 0.6, 'sine', 0.05);
        let bt = 0;
        for (const [m, len] of bar.mel) { if (m > 0) note(m, t + bt * beat, len * beat * 0.95, 'triangle', 0.13); bt += len; }
        t += 3 * beat; i++;
      }
      this.gramTimer = window.setTimeout(tick, 200);
    };
    tick();
  }
  private gramLp: BiquadFilterNode | null = null;

  /** Someone winds up the gramophone: it plays nearer and louder. */
  cue() {
    const ctx = this.ctx;
    if (!ctx || !this.gram) return;
    this.gram.gain.setTargetAtTime(0.34, ctx.currentTime, 0.6);
    this.gramLp?.frequency.setTargetAtTime(3200, ctx.currentTime, 0.6);
  }

  /** Play a line; resolves when it has been said (or skipped). */
  async say(l: SceneLine, onStart: () => void): Promise<void> {
    this.hush();
    const ctx = sound.ctx;
    const id = this.clips ? clipFor(this.clips, l) : null;
    if (id && ctx && this.voices) {
      const buf = await Promise.race([this.buf(ctx, id), new Promise<null>((r) => setTimeout(() => r(null), 1800))]);
      if (buf) {
        if (ctx.state !== 'running') await ctx.resume().catch(() => {});
        return new Promise((resolve) => {
          const s = ctx.createBufferSource(); s.buffer = buf;
          const g = ctx.createGain(); g.gain.value = VOICE_GAIN;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7600;
          s.connect(lp).connect(g).connect(sound.voiceBus() ?? ctx.destination);
          let done = false;
          const fin = () => { if (done) return; done = true; s.onended = null; s.disconnect(); lp.disconnect(); g.disconnect(); if (this.src === s) this.src = null; resolve(); };
          s.onended = fin;
          this.src = s;
          (s as any)._fin = fin;
          s.start(ctx.currentTime + 0.03);
          onStart();
          sound.duckFor(buf.duration + 0.2, MUSIC_DUCK * 0.8, 0.7);
          setTimeout(fin, (buf.duration + 2.5) * 1000);   // a suspended context never ends the clip
        });
      }
    }
    onStart();
    const text = spokenText(l);
    if (this.voices && typeof speechSynthesis !== 'undefined') {
      const ok = await this.tts(l.who, text);
      if (ok) return;
    }
    // subtitles only: reading time
    const shown = isAr() ? tx(l.text, l.show ?? l.vars) : text;
    await new Promise((r) => setTimeout(r, Math.min(9000, 1400 + shown.length * 55)));
  }

  private tts(who: Speaker, text: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text.replace(/[—–]/g, ', '));
        const en = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
        const idx = ['brenner', 'doyle', 'stern', 'kessler', 'mendez', 'gallo', 'reilly', 'price', 'walsh', 'dawson'].indexOf(who);
        const male = en.filter((v) => /Daniel|Fred|Alex|Ralph|Reed|Eddy|Rocko|Grandpa|Male|Guy|David|Mark|George|James/i.test(v.name));
        const pool = male.length ? male : en;
        if (pool.length) u.voice = pool[idx % pool.length];
        u.lang = 'en-US'; u.rate = 0.98; u.pitch = TTS_PITCH[who] ?? 1; u.volume = Math.min(1, 0.95 * sound.volume + 0.1);
        let settled = false;
        const fin = (ok: boolean) => { if (settled) return; settled = true; if (this.speaking === u) this.speaking = null; resolve(ok); };
        u.onend = () => fin(true);
        u.onerror = () => fin(false);
        this.speaking = u;
        (u as any)._fin = fin;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        sound.duckFor(Math.min(12, 1 + text.length * 0.06), MUSIC_DUCK * 0.8, 0.7);
        // engines that never fire onend (or never start): fall back on a generous estimate
        setTimeout(() => fin(true), Math.min(16000, 2500 + text.length * 85));
      } catch { resolve(false); }
    });
  }

  /** Cut the current line short. */
  hush() {
    if (this.src) { const f = (this.src as any)._fin as (() => void) | undefined; try { this.src.stop(); } catch { /* */ } f?.(); }
    if (this.speaking) { const f = (this.speaking as any)._fin as ((ok: boolean) => void) | undefined; try { speechSynthesis.cancel(); } catch { /* */ } f?.(true); }
  }

  stop() {
    this.hush();
    clearTimeout(this.duckTimer);
    clearTimeout(this.gramTimer);
    this.gram = null;
    const ctx = this.ctx, out = this.out;
    if (ctx && out) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      const amb = this.amb, nodes = this.nodes;
      setTimeout(() => { for (const s of amb) { try { s.stop(); } catch { /* */ } s.disconnect(); } for (const n of nodes) n.disconnect(); out.disconnect(); }, 1800);
    }
    this.amb = []; this.nodes = []; this.out = null; this.ctx = null;
    sound.duckFor(0.01, 1, 1);
  }
}

// 3/4: a melody of [midi, beats] (0 = rest) over a chord (root, third, fifth). F major, original.
const WALTZ: { chord: [number, number, number]; mel: [number, number][] }[] = [
  { chord: [53, 57, 60], mel: [[69, 2], [67, 1]] }, { chord: [53, 57, 60], mel: [[65, 3]] },
  { chord: [50, 53, 57], mel: [[74, 2], [72, 1]] }, { chord: [50, 53, 57], mel: [[69, 3]] },
  { chord: [55, 58, 62], mel: [[70, 2], [69, 1]] }, { chord: [48, 52, 58], mel: [[67, 2], [64, 1]] },
  { chord: [53, 57, 60], mel: [[65, 2], [67, 1]] }, { chord: [48, 52, 58], mel: [[69, 3]] },
  { chord: [53, 57, 60], mel: [[72, 2], [69, 1]] }, { chord: [58, 62, 65], mel: [[74, 2], [72, 1]] },
  { chord: [53, 57, 60], mel: [[69, 2], [65, 1]] }, { chord: [50, 54, 57], mel: [[66, 2], [69, 1]] },
  { chord: [55, 58, 62], mel: [[67, 2], [70, 1]] }, { chord: [48, 52, 58], mel: [[64, 2], [67, 1]] },
  { chord: [53, 57, 60], mel: [[65, 3]] }, { chord: [53, 57, 60], mel: [[65, 2], [0, 1]] },
];

// ---- procedural ambience buffers (made once per context) ----
const bufCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function cached(ctx: BaseAudioContext, key: string, seconds: number, fill: (d: Float32Array, sr: number, ch: number) => void, channels = 2): AudioBuffer {
  let m = bufCache.get(ctx);
  if (!m) bufCache.set(ctx, (m = new Map()));
  let b = m.get(key);
  if (!b) {
    const sr = ctx.sampleRate;
    b = ctx.createBuffer(channels, Math.floor(sr * seconds), sr);
    for (let c = 0; c < channels; c++) fill(b.getChannelData(c), sr, c);
    m.set(key, b);
  }
  return b;
}

// rain on a tin roof: a bright hiss and a patter of small metallic ticks
function rainBuffer(ctx: BaseAudioContext, k: number) {
  return cached(ctx, 'rain' + k, 4, (d, sr, ch) => {
    const r = rnd(101 + ch * 7);
    let hp = 0, prev = 0;
    for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; hp = 0.92 * (hp + w - prev); prev = w; d[i] = hp * 0.07 * k; }
    const n = Math.floor(4 * 160 * k);
    for (let j = 0; j < n; j++) {
      const at = Math.floor(r() * d.length), f = 2200 + r() * 3800, a = (0.05 + r() * r() * 0.35) * k, len = Math.floor(sr * (0.004 + r() * 0.012));
      for (let i = 0; i < len; i++) { const idx = (at + i) % d.length; d[idx] += a * Math.exp(-i / (len * 0.25)) * Math.sin((2 * Math.PI * f * i) / sr); }
    }
    // a drip from the eaves every second or so
    for (let j = 0; j < 4; j++) {
      const at = Math.floor(((j + r() * 0.5) / 4) * d.length), len = Math.floor(sr * 0.05);
      for (let i = 0; i < len; i++) d[(at + i) % d.length] += 0.12 * Math.exp(-i / (len * 0.2)) * Math.sin((2 * Math.PI * (900 - i * 4) * i) / sr);
    }
  });
}

// wind round the hut: brown noise that swells and falls
function windBuffer(ctx: BaseAudioContext, k: number) {
  return cached(ctx, 'wind' + k, 6, (d, sr, ch) => {
    const r = rnd(202 + ch * 13);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      b = (b + 0.02 * (r() * 2 - 1)) / 1.02;
      const sw = 0.55 + 0.45 * Math.sin((2 * Math.PI * i) / d.length + ch) * Math.sin((6 * Math.PI * i) / d.length);
      d[i] = b * 2.2 * sw * k;
    }
  });
}

// the coke stove: a low roar and pops and snaps
function stoveBuffer(ctx: BaseAudioContext) {
  return cached(ctx, 'stove', 5, (d, sr, ch) => {
    const r = rnd(303 + ch * 5);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = (b + 0.03 * (r() * 2 - 1)) / 1.03; d[i] = b * 1.6; }
    const pops = 5 * 9;
    for (let j = 0; j < pops; j++) {
      const at = Math.floor(r() * d.length), big = r() < 0.12, a = big ? 0.5 + r() * 0.3 : 0.08 + r() * 0.2, len = Math.floor(sr * (big ? 0.012 : 0.003 + r() * 0.004));
      let x = 0;
      for (let i = 0; i < len; i++) { x = 0.6 * x + (r() * 2 - 1); d[(at + i) % d.length] += a * x * 0.4 * Math.exp(-i / (len * 0.3)); }
    }
  });
}

// a worn 78: hiss and sparse clicks
function crackleBuffer(ctx: BaseAudioContext) {
  return cached(ctx, 'crackle', 3, (d, sr) => {
    const r = rnd(404);
    for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * 0.012;
    for (let j = 0; j < 3 * 14; j++) { const at = Math.floor(r() * d.length), a = 0.08 + r() * 0.25; d[at] += a; if (at + 1 < d.length) d[at + 1] -= a * 0.6; }
    for (let k = 0; k < 3; k++) { const at = Math.floor(((k + 0.5) / 3) * d.length); for (let i = 0; i < sr * 0.002; i++) d[(at + i) % d.length] += 0.2 * (r() * 2 - 1); }
  }, 1);
}

// ---------------- the scene ----------------

export class CrewRoomScene {
  /** Dev autoplay: never play. */
  auto = false;
  private pending: { m: Mission; ctx: CrewRoomCtx; settingOn: boolean; auto: boolean } | null = null;
  private running: Running | null = null;
  log: string[] = [];

  /** End of MissionFlow.showDebrief: remember this mission's outcome for the scene. */
  capture(g: Game, m: Mission, d: DebriefData) {
    this.pending = null;
    if (!d.success || d.survival || (!CAMPAIGN.includes(m) && !isChapterMission(m.id) && !isSecondTourId(m.id)) || !vignetteFor(m.id)) return;
    try {
      const role = m.role;
      const wounded = role === 'gunner' && base ? MEN.filter((x) => crewRoster.men[x.id].wounds > (base!.wounds[x.id] ?? Infinity)).map((x) => x.id as Speaker) : [];
      const memorial = MEN.filter((x) => crewRoster.men[x.id].dead).map((x) => x.id);
      const hospital = MEN.filter((x) => crewRoster.men[x.id].rest > 0 && !crewRoster.men[x.id].dead).map((x) => x.id);
      const patched = wounded.filter((id) => !hospital.includes(id) && !memorial.includes(id));
      const nem = g.specials?.nemesis?.st;
      const last = nem?.last;
      const aces = last && last.n === nem!.missions && last.mission === m.title ? last.items.map((it) => ({ last: it.ace.last, fate: it.enc.fate, byPlayer: it.enc.byPlayer })) : [];
      const camp = loadCampaign(g.progress, { noReconcile: true });
      const finale = vignetteFor(m.id)?.finale;
      const tt = finale ? totals(camp) : null;
      const ctx: CrewRoomCtx = {
        mission: m.id, role, kills: d.kills, shots: d.rounds ?? 0, hits: d.hits ?? 0,
        lost: d.bombersLost, total: d.bombersTotal, hospital, patched, memorial,
        rookies: role === 'gunner' ? base?.rookies ?? [] : [],
        aces, luftwaffe: camp.luftwaffe,
        tour: tt ? { kills: tt.kills, lost: tt.lost } : undefined,
      };
      this.pending = { m, ctx, settingOn: g.settings.crewRoom !== false, auto: this.auto || !!g.bookends?.auto };
    } catch (e) {
      console.warn('crew room: no scene', e);
    }
  }

  /**
   * On the debrief's way to the campaign map: play this mission's scene first (once), then `done`.
   * Calls `done` straight away when there is no scene (failure, setting off, autoplay, replays
   * of other missions).
   */
  play(m: Mission, done: () => void) {
    const p = this.pending;
    this.pending = null;
    if (this.running) { this.running.finish(); }
    if (!p || p.m !== m || !p.settingOn || p.auto || typeof document === 'undefined') { done(); return; }
    const scene = buildScene(m.id, p.ctx);
    if (!scene) { done(); return; }
    this.run(scene, m, done);
  }

  /** Dev: play a vignette with a made-up outcome (sws console: swsCrewRoom('m8', { lost: 4 })). */
  preview(missionId: string, over: Partial<CrewRoomCtx> = {}, done: () => void = () => {}) {
    const m = [...CAMPAIGN, ...DEEP_PENETRATION].find((x) => x.id === missionId);
    if (!m) return null;
    const ctx: CrewRoomCtx = { mission: m.id, role: m.role, kills: 4, shots: 400, hits: 96, lost: 1, total: m.bombers, hospital: [], patched: [], rookies: [], aces: [], luftwaffe: 96, ...over };
    const scene = buildScene(m.id, ctx);
    if (scene) this.run(scene, m, done);
    return scene;
  }

  get playing() { return !!this.running; }
  /** Dev: jump to the next line / end the scene. */
  next() { this.running?.next(); }
  skip() { this.running?.finish(); }

  private run(scene: Scene, m: Mission, done: () => void) {
    ensureStyle();
    this.log = scene.lines.map((l) => `${l.who}: ${spokenText(l)}${l.dyn ? ' [tts]' : ''}`);
    this.running = new Running(scene, m, () => { this.running = null; done(); });
  }
}

class Running {
  private root: HTMLElement;
  private painter: HutPainter;
  private audio = new RoomSound();
  private i = -1;
  private raf = 0;
  private t0 = performance.now();
  private last = performance.now();
  private ended = false;
  private seq = 0;
  private men = new Map<Speaker, HTMLElement>();
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.finish(); }
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.next(); }
  };
  private onResize = () => this.layout();

  constructor(private scene: Scene, private m: Mission, private done: () => void) {
    const v = scene.v;
    this.painter = new HutPainter(v, scene.emptyBunk);
    const root = document.createElement('div');
    root.id = 'crewRoom';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', tx('Crew room'));
    const touch = document.body.classList.contains('touch');
    // short written vignettes from the crew's stories (morale, letters, friends and friction)
    const stories = crewStories.vignettes(scene.present as ManId[]);
    root.innerHTML = `<div class="crm-cast"></div>
      ${scene.memorial.length ? `<div class="crm-memorial">${scene.memorial.map((id) => esc(tx('In memory of {who}', { who: tx(manDef(id).call) }))).join('<br>')}</div>` : ''}
      ${stories.length ? `<div class="crm-story" style="top:${82 + scene.memorial.length * 24}px">${stories.map((n) => `<p>${esc(storySay(n.text, n.vars))}</p>`).join('')}</div>` : ''}
      <div class="crm-cap"><b>${esc(tx(v.place))}</b><span>${esc(tx(m.date))} · ${esc(tx(v.time))}</span></div>
      <button class="crm-skip" type="button">${esc(tx('Skip scene'))} ›</button>
      <div class="crm-sub fade" aria-live="polite"><span class="who"></span><span class="txt"></span></div>
      <div class="crm-hint">${esc(tx(touch ? 'Tap · next line' : 'Space · next line'))}  ·  ${esc(tx('Esc · skip'))}</div>
      <div class="crm-end">${v.finale ? esc(tx('Tour complete')) : ''}</div>
      <div class="crm-fade"></div>`;
    root.prepend(this.painter.canvas);
    const cast = root.querySelector<HTMLElement>('.crm-cast')!;
    for (const id of scene.present) {
      const d = manDef(id as ManId);
      const el = document.createElement('div');
      el.className = 'crm-man';
      el.innerHTML = `<img alt="" src="${portraitUrl(d.look, 160)}"><b>${esc(tx(d.last))}</b>`;
      el.title = `${tx(d.call)} "${tx(d.nick)}"`;
      cast.appendChild(el);
      this.men.set(id, el);
    }
    document.body.appendChild(root);
    this.root = root;
    root.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.crm-skip')) return; this.next(); });
    root.querySelector('.crm-skip')!.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.layout();
    const fade = root.querySelector<HTMLElement>('.crm-fade')!;
    requestAnimationFrame(() => {
      fade.style.opacity = '0'; root.querySelector<HTMLElement>('.crm-cap')!.style.opacity = '1';
      const st = root.querySelector<HTMLElement>('.crm-story'); if (st) st.style.opacity = '1';
    });
    this.loop();
    sound.stopSpeech();
    sound.music.setCrewRoom(scene.emptyBunk);
    this.audio.startAmbience(v);
    const ready = this.audio.prepare(scene.lines);
    // a moment to take the room in, then the first line
    Promise.all([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => { if (!this.ended && this.i < 0) this.next(); });
  }

  private layout() {
    const w = window.innerWidth, h = window.innerHeight;
    this.painter.resize(w, h);
    const spots = this.painter.castSpots(this.scene.present.length);
    this.scene.present.forEach((id, k) => {
      const el = this.men.get(id)!;
      const s = spots[k];
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      el.style.setProperty('--ps', `${s.size}px`);
    });
  }

  private loop = () => {
    if (this.ended && !this.root.isConnected) return;
    const now = performance.now();
    // ~30 fps is plenty for a stove and the rain
    if (now - this.last >= 30 || !this.raf) {
      this.painter.frame((now - this.t0) / 1000, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Next line (or the end after the last one). */
  next() {
    if (this.ended) return;
    this.audio.hush();
    this.i++;
    if (this.i >= this.scene.lines.length) { this.finish(true); return; }
    const l = this.scene.lines[this.i];
    const seq = ++this.seq;
    const sub = this.root.querySelector<HTMLElement>('.crm-sub')!;
    const d = manDef(l.who as ManId);
    const vars = isAr() ? Object.fromEntries(Object.entries(l.show ?? l.vars ?? {}).map(([k, v]) => [k, typeof v === 'string' ? tx(v) : v])) : l.vars;
    sub.classList.add('fade');
    for (const [id, el] of this.men) el.classList.toggle('on', id === l.who);
    if (l.cue === 'gramophone') this.audio.cue();
    void this.audio.say(l, () => {
      if (seq !== this.seq) return;
      sub.querySelector('.who')!.textContent = `${tx(d.rank)} ${tx(d.last)}`;
      const txt = sub.querySelector<HTMLElement>('.txt')!;
      txt.textContent = tx(l.text, vars);
      txt.dir = 'auto';
      sub.classList.remove('fade');
    }).then(() => {
      if (seq !== this.seq || this.ended) return;
      setTimeout(() => { if (seq === this.seq && !this.ended) this.next(); }, GAP_S * 1000);
    });
  }

  /** End the scene: fade to black, hand over to the map, fade the overlay out. */
  finish(natural = false) {
    if (this.ended) return;
    this.ended = true;
    this.seq++;
    this.audio.stop();
    sound.music.setCrewRoom(null);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    const root = this.root;
    const fade = root.querySelector<HTMLElement>('.crm-fade')!;
    const endCard = root.querySelector<HTMLElement>('.crm-end')!;
    root.querySelector<HTMLElement>('.crm-sub')?.classList.add('fade');
    for (const el of this.men.values()) el.classList.remove('on');
    const handOver = () => {
      fade.style.opacity = '1';
      setTimeout(() => {
        cancelAnimationFrame(this.raf);
        this.done();
        root.style.transition = 'opacity .6s';
        root.style.opacity = '0';
        setTimeout(() => root.remove(), 700);
      }, 750);
    };
    if (natural && this.scene.v.finale) { endCard.style.opacity = '1'; setTimeout(handOver, 3200); }
    else setTimeout(handOver, natural ? 900 : 50);
  }
}

export const crewRoomScene = new CrewRoomScene();
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).swsCrewRoom = Object.assign((id: string, over?: Partial<CrewRoomCtx>) => crewRoomScene.preview(id, over), { scene: crewRoomScene });
