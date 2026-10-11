// Field Manual (Phase 5 extra goal 36): the in-game handbook, laid out like a WWII training
// booklet (FM 1-M): numbered chapters and paragraphs, typewriter headings, ink line diagrams
// drawn in SVG. Content lives in game/FieldManual.ts; this file draws it.
// A '.layer' over whatever was showing (title menu, pause screen, Settings); closing it brings
// those layers back. The gamepad moves between its buttons and B presses Close (data-back).
// Openers: game/ManualHooks.ts (title menu, pause menu, Settings) and ui/ControlsCard.ts
// ("Full manual" on the H card).
import { isAr, tx } from '../i18n';
import { keyMap, type ActionId } from '../core/KeyMap';
import { padConnected } from '../core/Gamepad';
import { CHAPTERS, type ChapterId, type DiagramId, type LinkId } from '../game/FieldManual';
import { controlRows, type ControlsDevice } from './ControlsCard';
import { onBackKey } from './serviceCommon';

const CSS = `
#fieldManual { overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; z-index: 46;
  background: #2f3324 radial-gradient(ellipse at 50% 30%, rgba(255,240,200,.10), rgba(0,0,0,.55) 90%); color: #2b2518; }
#fieldManual .fm-wrap { max-width: 1120px; margin: 0 auto; padding: 22px 24px 30px; }
#fieldManual .fm-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 14px;
  background: #ddd2b2; padding: 12px 18px; border: 1px solid #8a7c58; box-shadow: 0 6px 18px rgba(0,0,0,.5); position: relative; }
#fieldManual .fm-top::after { content: ''; position: absolute; inset: 4px; border: 1px solid rgba(60,50,30,.35); pointer-events: none; }
#fieldManual .fm-stamp { font: 700 12px/1 "IBM Plex Mono", monospace; letter-spacing: 3px; color: #8c1d15; border: 2px solid #8c1d15; padding: 5px 8px; transform: rotate(-4deg); }
#fieldManual .fm-k { font: 600 11px/1.3 "IBM Plex Mono", monospace; letter-spacing: 2px; color: #5a4d33; text-transform: uppercase; }
#fieldManual h2 { font: 400 32px/1 "Special Elite", "Courier New", monospace; letter-spacing: 2px; text-transform: uppercase; margin: 3px 0 2px; }
#fieldManual .fm-sub { font: 13px/1.35 "Special Elite", monospace; color: #4a3f2b; }
#fieldManual .fm-sp { flex: 1; }
#fieldManual .fm-close { font: 600 14px/1 Oswald, "Noto Kufi Arabic", sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #f1e8cf; background: #3b4228; border: 2px solid #c9b77d; padding: 11px 18px; min-height: 42px; cursor: pointer; }
#fieldManual .fm-close:hover, #fieldManual .fm-close:focus-visible { background: #4b5132; color: #fff; outline: none; }
#fieldManual .fm-book { display: grid; grid-template-columns: 230px 1fr; gap: 16px; align-items: start; }
#fieldManual .fm-toc { position: sticky; top: 0; background: #d6caa7; border: 1px solid #8a7c58; padding: 12px 10px; box-shadow: 0 6px 16px rgba(0,0,0,.45); }
#fieldManual .fm-toc-h { font: 600 11px/1 "IBM Plex Mono", monospace; letter-spacing: 3px; color: #8c1d15; text-transform: uppercase; margin: 0 6px 8px; }
#fieldManual .fm-toc button { display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: start; background: transparent; border: 0; border-bottom: 1px dotted rgba(60,50,30,.4);
  padding: 8px 6px; min-height: 36px; font: 14px/1.2 "Special Elite", monospace; color: #2b2518; cursor: pointer; }
#fieldManual .fm-toc button b { font: 700 12px/1 "IBM Plex Mono", monospace; color: #8c1d15; min-width: 16px; }
#fieldManual .fm-toc button:hover, #fieldManual .fm-toc button:focus-visible { background: rgba(140,29,21,.12); outline: none; }
#fieldManual .fm-toc button.on { background: #2b2518; color: #efe6cc; }
#fieldManual .fm-toc button.on b { color: #e9c46a; }
#fieldManual .fm-page { background: linear-gradient(180deg, #efe7d0, #e6dcbf); border: 1px solid #8a7c58; padding: 20px 26px 18px; box-shadow: 0 8px 20px rgba(0,0,0,.5); min-width: 0; position: relative; }
#fieldManual .fm-page::before { content: ''; position: absolute; inset: 6px; border: 1px solid rgba(60,50,30,.25); pointer-events: none; }
#fieldManual .fm-chap { font: 600 12px/1 "IBM Plex Mono", monospace; letter-spacing: 4px; color: #8c1d15; text-transform: uppercase; }
#fieldManual h3 { font: 400 28px/1.1 "Special Elite", "Courier New", monospace; text-transform: uppercase; letter-spacing: 1px; margin: 6px 0 6px; border-bottom: 3px double #2b2518; padding-bottom: 6px; }
#fieldManual .fm-lead { font: 15px/1.5 "Special Elite", monospace; color: #3d3423; margin: 8px 0 4px; }
#fieldManual .fm-sec { margin-top: 16px; display: flow-root; }
#fieldManual h4 { font: 400 17px/1.2 "Special Elite", monospace; text-transform: uppercase; margin: 0 0 6px; }
#fieldManual h4 span { font: 700 12px/1 "IBM Plex Mono", monospace; color: #8c1d15; margin-inline-end: 8px; }
#fieldManual ul { margin: 0; padding-inline-start: 20px; }
#fieldManual li { font: 14px/1.5 "IBM Plex Mono", monospace; color: #2b2518; margin: 3px 0; }
#fieldManual li::marker { color: #8c1d15; }
#fieldManual li b { color: #6b1710; }
#fieldManual kbd { font: 600 12px/1 "IBM Plex Mono", monospace; border: 1px solid #2b2518; border-bottom-width: 2px; padding: 1px 5px; border-radius: 3px; background: #f6f0de; color: #2b2518; opacity: 1; white-space: nowrap; }
#fieldManual .fm-rows { display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 0; border-top: 1px solid rgba(60,50,30,.35); }
#fieldManual .fm-rows > div { padding: 6px 8px; border-bottom: 1px solid rgba(60,50,30,.25); font: 13.5px/1.45 "IBM Plex Mono", monospace; }
#fieldManual .fm-rows .fm-rk { font-weight: 700; color: #2b2518; background: rgba(60,50,30,.06); }
#fieldManual figure { float: inline-end; width: min(46%, 360px); margin: 2px 0 10px 18px; }
html[dir=rtl] #fieldManual figure { margin: 2px 18px 10px 0; }
#fieldManual figure svg { display: block; width: 100%; height: auto; direction: ltr; background: rgba(255,255,255,.35); border: 1px solid rgba(60,50,30,.4); }
#fieldManual figcaption { font: 11.5px/1.35 "IBM Plex Mono", monospace; color: #5a4d33; margin-top: 4px; text-align: center; }
#fieldManual .fm-link { margin-top: 8px; font: 700 12px/1 "IBM Plex Mono", monospace; letter-spacing: 1.5px; text-transform: uppercase; color: #8c1d15; background: transparent; border: 2px solid #8c1d15; padding: 9px 12px; min-height: 38px; cursor: pointer; }
#fieldManual .fm-link:hover, #fieldManual .fm-link:focus-visible { background: #8c1d15; color: #f4ead0; outline: none; }
#fieldManual .fm-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
#fieldManual .fm-tabs button { font: 600 12px/1 "IBM Plex Mono", monospace; letter-spacing: 1px; text-transform: uppercase; background: transparent; color: #2b2518; border: 1px solid #2b2518; padding: 8px 12px; min-height: 36px; cursor: pointer; }
#fieldManual .fm-tabs button.on { background: #2b2518; color: #efe6cc; }
#fieldManual .fm-tabs button:focus-visible { outline: 2px solid #8c1d15; outline-offset: 2px; }
#fieldManual .fm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; }
#fieldManual .fm-cols h4 { margin-bottom: 4px; }
#fieldManual .fm-cols .fm-rows { grid-template-columns: max-content 1fr; }
#fieldManual .fm-cols .fm-rows > div { font-size: 12.5px; }
#fieldManual .fm-note { font: 12.5px/1.45 "IBM Plex Mono", monospace; color: #5a4d33; margin-top: 10px; border-inline-start: 3px solid #8c1d15; padding-inline-start: 10px; }
#fieldManual .fm-nav { display: flex; gap: 10px; justify-content: space-between; margin-top: 20px; padding-top: 10px; border-top: 1px solid rgba(60,50,30,.4); clear: both; }
#fieldManual .fm-nav button { font: 600 13px/1.2 "Special Elite", monospace; background: transparent; color: #2b2518; border: 1px solid #2b2518; padding: 9px 12px; min-height: 40px; cursor: pointer; }
#fieldManual .fm-nav button:hover, #fieldManual .fm-nav button:focus-visible { background: #2b2518; color: #efe6cc; outline: none; }
#fieldManual .fm-foot { font: 11px/1.4 "IBM Plex Mono", monospace; color: #e8dcb8; opacity: .8; text-align: center; margin-top: 12px; }
@media (max-width: 900px) { #fieldManual .fm-cols { grid-template-columns: 1fr; } }
/* phones (landscape 812 × 375 included): one column, the contents become a scrolling strip */
@media (max-height: 520px), (max-width: 760px) {
  #fieldManual .fm-wrap { padding: 10px 14px 18px; }
  #fieldManual .fm-top { padding: 8px 12px; gap: 10px; margin-bottom: 8px; }
  #fieldManual h2 { font-size: 22px; }
  #fieldManual .fm-sub { display: none; }
  #fieldManual .fm-close { padding: 9px 14px; min-height: 40px; }
  #fieldManual .fm-book { grid-template-columns: 1fr; gap: 8px; }
  #fieldManual .fm-toc { position: static; display: flex; overflow-x: auto; gap: 4px; padding: 6px; -webkit-overflow-scrolling: touch; }
  #fieldManual .fm-toc-h { display: none; }
  #fieldManual .fm-toc button { width: auto; flex: 0 0 auto; white-space: nowrap; border: 1px solid rgba(60,50,30,.35); padding: 8px 10px; min-height: 40px; font-size: 13px; }
  #fieldManual .fm-page { padding: 14px 16px 12px; }
  #fieldManual h3 { font-size: 22px; }
  #fieldManual .fm-lead { font-size: 13.5px; }
  #fieldManual li, #fieldManual .fm-rows > div { font-size: 12.5px; }
  #fieldManual figure { width: min(44%, 300px); }
}
@media (max-width: 520px) { #fieldManual figure { float: none; width: 100%; margin: 4px 0 10px; } }
/* Arabic faces; the booklet mirrors with dir (grid, floats, padding all use logical sides) */
html[lang=ar] #fieldManual h2, html[lang=ar] #fieldManual h3, html[lang=ar] #fieldManual h4, html[lang=ar] #fieldManual .fm-toc button, html[lang=ar] #fieldManual .fm-nav button { font-family: "Noto Kufi Arabic", "Special Elite", sans-serif; letter-spacing: 0; }
html[lang=ar] #fieldManual h3 { font-size: 26px; font-weight: 700; }
html[lang=ar] #fieldManual h4 { font-weight: 600; }
html[lang=ar] #fieldManual .fm-lead, html[lang=ar] #fieldManual .fm-sub { font-family: "Noto Naskh Arabic", "Special Elite", serif; font-size: 16px; line-height: 1.7; }
html[lang=ar] #fieldManual li, html[lang=ar] #fieldManual .fm-rows > div, html[lang=ar] #fieldManual .fm-note, html[lang=ar] #fieldManual figcaption { font-family: "IBM Plex Sans Arabic", "IBM Plex Mono", sans-serif; line-height: 1.7; }
html[lang=ar] #fieldManual .fm-k, html[lang=ar] #fieldManual .fm-chap, html[lang=ar] #fieldManual .fm-toc-h, html[lang=ar] #fieldManual .fm-link, html[lang=ar] #fieldManual .fm-tabs button, html[lang=ar] #fieldManual .fm-stamp { font-family: "IBM Plex Sans Arabic", "IBM Plex Mono", monospace; letter-spacing: 0; }
html[dir=rtl] #fieldManual kbd { direction: ltr; unicode-bidi: isolate; }
`;

let cssDone = false;
function injectCss() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ---------------- key names (remaps show here: Settings > Key bindings) ----------------
const kb = (s: string) => `<kbd>${s}</kbd>`;
/** {fire}, {zoom}, {reload}, {map}, {pause}, {help}, {seats}, {wings} in the manual's texts */
export function keyVars(): Record<string, string> {
  const l = (id: ActionId) => kb(keyMap.label(id));
  return {
    fire: l('fire'), zoom: l('zoom'), reload: l('reload'), map: l('map'), pause: l('pause'), help: l('help'),
    seats: (['seat1', 'seat2', 'seat3', 'seat4', 'seat5'] as ActionId[]).map(l).join(' '),
    wing1: l('wing1'), wing2: l('wing2'), wing3: l('wing3'), wing4: l('wing4'),
  };
}

// ---------------- ink diagrams (viewBox 200 × 120) ----------------
const INK = '#2b2518', RED = '#8c1d15', DIM = '#7a6c4c';
const T = (x: number, y: number, s: string, o: { a?: string; c?: string; z?: number; w?: number } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${o.a ?? 'middle'}" font-family="IBM Plex Mono, IBM Plex Sans Arabic, monospace" font-size="${o.z ?? 8}" font-weight="${o.w ?? 600}" fill="${o.c ?? INK}">${tx(s)}</text>`;
const FIGHTER = 'M0,-10 L1.2,-7 L1.2,-2 L10,0 L10,1.6 L1.2,1.6 L0.9,6 L4,7.6 L4,8.8 L0,8.2 L-4,8.8 L-4,7.6 L-0.9,6 L-1.2,1.6 L-10,1.6 L-10,0 L-1.2,-2 L-1.2,-7 Z';
const BOMBER = 'M0,-12 L1.8,-9 L1.8,-3 L16,-1 L16,1.5 L1.8,2 L1.2,9 L6,10.5 L6,12 L0,11.5 L-6,12 L-6,10.5 L-1.2,9 L-1.8,2 L-16,1.5 L-16,-1 L-1.8,-3 L-1.8,-9 Z';
const plane = (d: string, x: number, y: number, s: number, rot: number, filled = false) =>
  `<path d="${d}" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${filled ? INK : 'none'}" stroke="${INK}" stroke-width="${(1.1 / s).toFixed(2)}"/>`;
const ARROW = `<defs><marker id="fmA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${INK}"/></marker>
  <marker id="fmR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${RED}"/></marker></defs>`;

/** Every label drawn in the diagrams (tests: all of them have Arabic) */
export const DIAGRAM_LABELS = [
  'GUN', 'AIM HERE', 'NOT HERE', 'target path', 'lead ◇',
  'COOL', 'HOT', 'JAM', 'short bursts', 'long burst',
  'Left Waist', 'Right Waist', 'Top Turret', 'Ball Turret', 'Tail Gun', 'NOSE',
  'aim circle', 'nose follows', 'mouse',
  'SPEED', 'HEIGHT', 'dive: trade height for speed', 'zoom climb', 'slow turn = target',
  'Marksman', 'Gunnery Sergeant', 'Survivor', 'capstone',
  'turrets', 'engines', 'flak', 'rocket pods', 'HULL', 'armour breached',
  'BK 5 run: kill him now', 'wingman',
];

const DIAGRAMS: Record<DiagramId, () => string> = {
  // Deflection: fire where the fighter will be, at the yellow lead diamond
  lead: () => `${ARROW}<path d="M20 30 Q100 8 186 34" fill="none" stroke="${DIM}" stroke-width="1" stroke-dasharray="4 3"/>
    ${plane(FIGHTER, 60, 21, 0.9, 74, true)}${T(60, 40, 'NOT HERE', { c: DIM, z: 7 })}
    <path d="M130 16 l6 6 l-6 6 l-6 -6 z" fill="none" stroke="#b08a10" stroke-width="2"/>${T(142, 31, 'AIM HERE', { a: 'start', c: RED })}
    <circle cx="100" cy="104" r="5" fill="${INK}"/>${T(100, 116, 'GUN', { z: 7 })}
    <path d="M100 98 L128 31" stroke="${RED}" stroke-width="1.4" stroke-dasharray="3 2" marker-end="url(#fmR)"/>
    ${T(188, 52, 'target path', { a: 'end', c: DIM, z: 7, w: 400 })}${T(130, 9, 'lead ◇', { c: '#8a6c08', z: 7 })}`,
  // Heat gauge: short bursts stay in the cool band, a long burst runs into the jam
  heat: () => `<rect x="20" y="30" width="160" height="16" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <rect x="20" y="30" width="96" height="16" fill="${INK}" opacity=".12"/><rect x="148" y="30" width="32" height="16" fill="${RED}" opacity=".35"/>
    ${T(24, 24, 'COOL', { a: 'start', z: 7 })}${T(132, 24, 'HOT', { z: 7 })}${T(176, 24, 'JAM', { a: 'end', c: RED, z: 7 })}
    <path d="M20 96 l8 -24 l6 0 l6 18 l8 -18 l6 0 l6 18 l8 -18 l6 0 l6 18 l8 -18 l6 0 l6 24" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${T(62, 110, 'short bursts', { z: 7 })}
    <path d="M118 96 L176 56" fill="none" stroke="${RED}" stroke-width="1.6"/><circle cx="176" cy="56" r="3" fill="${RED}"/>${T(150, 110, 'long burst', { c: RED, z: 7 })}`,
  // Gun positions, top view, with the bound keys
  stations: () => {
    const key = (id: ActionId) => keyMap.label(id);
    const tag = (x: number, y: number, id: ActionId, label: string, lx: number, ly: number, a = 'middle') =>
      `<circle cx="${x}" cy="${y}" r="6.5" fill="#f6f0de" stroke="${RED}" stroke-width="1.4"/>${T(x, y + 3, key(id), { c: RED, z: 8, w: 700 })}${T(lx, ly, label, { a, z: 7, w: 500 })}`;
    return `${plane(BOMBER, 100, 60, 3.6, 90)}${T(164, 58, 'NOSE', { a: 'start', c: DIM, z: 7 })}
      ${tag(86, 52, 'seat1', 'Left Waist', 86, 20)}${tag(86, 68, 'seat2', 'Right Waist', 86, 106)}
      ${tag(126, 60, 'seat3', 'Top Turret', 130, 36, 'start')}${tag(104, 60, 'seat4', 'Ball Turret', 108, 86, 'start')}${tag(48, 60, 'seat5', 'Tail Gun', 40, 84)}
      <path d="M86 45 V25 M86 75 V97" stroke="${DIM}" stroke-width=".6"/>`;
  },
  // Mouse aim: the nose chases the aim circle
  mouseAim: () => `${ARROW}<circle cx="150" cy="40" r="10" fill="none" stroke="${RED}" stroke-width="1.6"/><path d="M150 26 v6 M150 48 v6 M136 40 h6 M158 40 h6" stroke="${RED}" stroke-width="1.2"/>
    ${T(150, 20, 'aim circle', { c: RED, z: 7 })}${plane(FIGHTER, 70, 76, 2.2, 55)}
    <path d="M86 66 Q118 48 136 44" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#fmA)"/>${T(70, 108, 'nose follows', { z: 7 })}
    <rect x="164" y="80" width="18" height="28" rx="9" fill="none" stroke="${INK}" stroke-width="1.2"/><path d="M173 80 v9" stroke="${INK}" stroke-width="1"/>${T(173, 117, 'mouse', { z: 7, w: 400 })}`,
  // Energy: height is stored speed
  energy: () => `${ARROW}<path d="M20 104 H190 M20 104 V10" stroke="${INK}" stroke-width="1"/>${T(186, 114, 'SPEED', { a: 'end', z: 7 })}${T(24, 10, 'HEIGHT', { a: 'start', z: 7 })}
    <path d="M40 24 Q70 30 96 84" fill="none" stroke="${INK}" stroke-width="1.6" marker-end="url(#fmA)"/>${T(70, 100, 'dive: trade height for speed', { z: 6.5, w: 500 })}
    <path d="M104 84 Q140 70 152 30" fill="none" stroke="${RED}" stroke-width="1.6" marker-end="url(#fmR)"/>${T(156, 24, 'zoom climb', { c: RED, z: 7 })}
    <circle cx="176" cy="70" r="9" fill="none" stroke="${DIM}" stroke-width="1" stroke-dasharray="2 2"/>${T(196, 90, 'slow turn = target', { a: 'end', c: DIM, z: 6.5, w: 500 })}`,
  // Skill tree: three branches, a capstone on top of each
  skills: () => {
    const xs = [40, 100, 160], names = ['Marksman', 'Gunnery Sergeant', 'Survivor'];
    return `<path d="M100 110 V92 M100 92 L40 78 M100 92 V78 M100 92 L160 78" stroke="${INK}" stroke-width="1.2" fill="none"/>
      <circle cx="100" cy="110" r="0"/>${xs.map((x, i) => `<path d="M${x} 78 V24" stroke="${INK}" stroke-width="1.2"/>
      ${[66, 52, 38].map((y) => `<circle cx="${x}" cy="${y}" r="5" fill="#f6f0de" stroke="${INK}" stroke-width="1.2"/>`).join('')}
      <path d="M${x} 13 l7 7 l-7 7 l-7 -7 z" fill="${RED}"/>${T(x, 90, names[i], { z: 6.5 })}`).join('')}
      ${T(100, 9, 'capstone', { c: RED, z: 7 })}`;
  },
  // Luftkreuzer, side view: shoot the parts away, then the hull
  boss: () => `${ARROW}<path d="M14 62 Q100 44 188 58 L188 66 Q100 82 14 70 Z" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <rect x="70" y="48" width="56" height="7" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <path d="M48 56 h10 v-6 h-3 v3 h-7z M96 47 h10 v-7 h-3 v4 h-7z M144 55 h10 v-6 h-3 v3 h-7z" fill="${INK}"/>
    <ellipse cx="40" cy="76" rx="8" ry="4" fill="none" stroke="${INK}" stroke-width="1.2"/><ellipse cx="160" cy="74" rx="8" ry="4" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <rect x="116" y="70" width="12" height="5" fill="${INK}"/><rect x="74" y="72" width="12" height="5" fill="${INK}"/>
    ${T(100, 22, 'turrets', { c: RED, z: 7 })}<path d="M100 26 L101 40 M92 26 L56 48 M108 26 L146 49" stroke="${RED}" stroke-width=".8"/>
    ${T(40, 100, 'engines', { z: 7 })}<path d="M40 92 V80" stroke="${INK}" stroke-width=".8"/>
    ${T(122, 98, 'rocket pods', { z: 7 })}<path d="M122 90 V76" stroke="${INK}" stroke-width=".8"/>
    ${T(76, 98, 'flak', { z: 7 })}<path d="M78 90 V78" stroke="${INK}" stroke-width=".8"/>
    ${T(170, 98, 'HULL', { c: RED, z: 8, w: 700 })}<path d="M170 90 L176 66" stroke="${RED}" stroke-width=".8"/>
    ${T(100, 116, 'armour breached', { c: RED, z: 7 })}`,
  // Wingman: the four orders around the two fighters
  wingman: () => {
    const k = keyVars();
    const strip = (s: string) => s.replace(/<[^>]+>/g, '');
    return `${plane(FIGHTER, 80, 64, 2.4, 0, true)}${plane(FIGHTER, 120, 82, 2.0, 0)}${T(120, 112, 'wingman', { z: 7 })}
      ${[[strip(k.wing1), 30, 26], [strip(k.wing2), 170, 26], [strip(k.wing3), 30, 98], [strip(k.wing4), 170, 98]].map(([s, x, y]) =>
        `<rect x="${(x as number) - 9}" y="${(y as number) - 10}" width="18" height="16" fill="#f6f0de" stroke="${INK}"/><text x="${x}" y="${(y as number) + 2}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-weight="700" font-size="9" fill="${RED}">${s}</text>`).join('')}`;
  },
  // Me 410: the long straight run from astern is the telegraph
  bk5: () => `${ARROW}${plane(BOMBER, 160, 60, 2.2, 90)}<path d="M20 60 H120" stroke="${RED}" stroke-width="1.4" stroke-dasharray="5 3" marker-end="url(#fmR)"/>
    ${plane(FIGHTER, 30, 60, 1.6, 90, true)}${T(70, 44, 'BK 5 run: kill him now', { c: RED, z: 7 })}`,
};

function diagram(id: DiagramId, caption?: string) {
  return `<figure><svg viewBox="0 0 200 120" role="img" aria-label="${caption ? tx(caption) : ''}">${DIAGRAMS[id]()}</svg>${caption ? `<figcaption>${tx(caption)}</figcaption>` : ''}</figure>`;
}

// ---------------- the screen ----------------
export interface ManualOptions {
  chapter?: ChapterId;
  onClose?: () => void;
  /** cross-links (only offered where they can be followed, e.g. the title menu) */
  links?: Partial<Record<LinkId, () => void>>;
}

let opts: ManualOptions = {};
let returnTo: Element[] = [];
let device: ControlsDevice = 'keyboard';
let current: ChapterId = CHAPTERS[0].id;

export function isManualOpen() { return !!document.getElementById('fieldManual')?.classList.contains('show'); }

/** Opens the manual over the current screen; closing it restores what was showing. */
export function openFieldManual(o: ManualOptions = {}): HTMLElement {
  injectCss();
  opts = o;
  device = padConnected() ? 'pad' : document.body.classList.contains('touch') ? 'touch' : 'keyboard';
  let el = document.getElementById('fieldManual');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fieldManual';
    el.className = 'layer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  if (!el.classList.contains('show')) returnTo = Array.from(document.querySelectorAll('.layer.show')).filter((l) => l !== el);
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === el));
  render(o.chapter ?? current);
  onBackKey(el, closeFieldManual);
  return el;
}

export function closeFieldManual() {
  const el = document.getElementById('fieldManual');
  if (!el?.classList.contains('show')) return;
  el.classList.remove('show');
  for (const l of returnTo) if (l.isConnected) l.classList.add('show');
  returnTo = [];
  const done = opts.onClose;
  opts = {};
  done?.();
}

function render(id: ChapterId) {
  const el = document.getElementById('fieldManual')!;
  current = id;
  const i = Math.max(0, CHAPTERS.findIndex((c) => c.id === id));
  const ch = CHAPTERS[i];
  const vars = keyVars();
  const n = i + 1;
  const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
  const [back, fwd] = isAr() ? ['›', '‹'] : ['‹', '›'];
  el.setAttribute('aria-label', tx('Field Manual'));
  el.innerHTML = `<div class="fm-wrap">
    <div class="fm-top"><span class="fm-stamp">${tx('RESTRICTED')}</span>
      <div><div class="fm-k">${tx('FM 1-M · War Department field manual')}</div><h2>${tx('Field Manual')}</h2>
        <div class="fm-sub">${tx('Aerial gunnery and fighter tactics for B-17 crews and P-51 pilots')}</div></div>
      <div class="fm-sp"></div><button class="fm-close" data-back>${tx('Close')}</button></div>
    <div class="fm-book">
      <nav class="fm-toc" aria-label="${tx('Contents')}"><div class="fm-toc-h">${tx('Contents')}</div>
        ${CHAPTERS.map((c, j) => `<button data-ch="${c.id}" class="${c.id === id ? 'on' : ''}"${c.id === id ? ' aria-current="page"' : ''}><b>${j + 1}</b><span>${tx(c.title)}</span></button>`).join('')}</nav>
      <article class="fm-page">
        <div class="fm-chap">${tx('Chapter {n}', { n })}</div><h3>${tx(ch.title)}</h3>
        <p class="fm-lead">${tx(ch.lead, vars)}</p>
        ${ch.id === 'controls' ? controlsChapter() : ''}
        ${ch.sections.map((s, j) => `<section class="fm-sec"><h4><span>${n}-${j + 1}</span>${tx(s.h)}</h4>
          ${s.diagram ? diagram(s.diagram, s.caption) : ''}
          ${s.rows ? `<div class="fm-rows">${s.rows.map(([k, v]) => `<div class="fm-rk">${tx(k)}</div><div>${tx(v, vars)}</div>`).join('')}</div>` : ''}
          ${s.items ? `<ul>${s.items.map((t) => `<li>${tx(t, vars)}</li>`).join('')}</ul>` : ''}
          ${s.link && opts.links?.[s.link.id] ? `<button class="fm-link" data-link="${s.link.id}">${tx(s.link.label)} ${fwd}</button>` : ''}
        </section>`).join('')}
        <div class="fm-nav">${prev ? `<button data-ch="${prev.id}">${back} ${tx('Chapter {n}', { n: i })}: ${tx(prev.title)}</button>` : '<span></span>'}
          ${next ? `<button data-ch="${next.id}">${tx('Chapter {n}', { n: i + 2 })}: ${tx(next.title)} ${fwd}</button>` : `<button data-back>${tx('Close')}</button>`}</div>
      </article>
    </div>
    <div class="fm-foot">${tx('Reachable from the title menu, the pause menu, Settings and the controls card ({help}).', { help: keyMap.label('help') })}</div>
  </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach((b) => b.addEventListener('click', () => {
    render(b.dataset.ch as ChapterId);
    el.scrollTop = 0;
    el.querySelector<HTMLElement>(`.fm-toc [data-ch="${b.dataset.ch}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => b.addEventListener('click', closeFieldManual));
  el.querySelectorAll<HTMLButtonElement>('[data-link]').forEach((b) => b.addEventListener('click', () => {
    const go = opts.links?.[b.dataset.link as LinkId];
    // a link leaves for another screen: nothing to restore
    el.classList.remove('show');
    returnTo = [];
    opts = {};
    go?.();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-dev]').forEach((b) => b.addEventListener('click', () => {
    device = b.dataset.dev as ControlsDevice;
    render('controls');
    el.querySelector<HTMLElement>(`[data-dev="${device}"]`)?.focus({ preventScroll: true });
  }));
}

// Chapter 8: the controls card's own rows (so remapped keys and the pad / touch layouts match)
function controlsChapter() {
  const devs: [ControlsDevice, string][] = [['keyboard', 'Keyboard and mouse'], ['pad', 'Gamepad'], ['touch', 'Touch']];
  const table = (role: 'gunner' | 'pilot') => `<div><h4>${tx(role === 'gunner' ? 'B-17 GUNNER' : 'P-51 PILOT')}</h4>
    <div class="fm-rows">${controlRows(role, device).map(([k, v]) => `<div class="fm-rk">${k}</div><div>${v}</div>`).join('')}</div></div>`;
  return `<div class="fm-tabs" role="tablist">${devs.map(([d, l]) => `<button role="tab" data-dev="${d}" class="${d === device ? 'on' : ''}" aria-selected="${d === device}">${tx(l)}</button>`).join('')}</div>
    <div class="fm-cols">${table('gunner')}${table('pilot')}</div>`;
}
