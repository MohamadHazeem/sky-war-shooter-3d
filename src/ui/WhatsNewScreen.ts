// "What's new" bulletin board (game/WhatsNew.ts has the cards and the once-per-version rule,
// game/TitleExtras.ts opens it). A cork board of pinned typewritten orders, one card per big
// new feature with a small ink illustration (procedural SVG: no screenshots ship with the
// game) and a "Try it" stamp that goes straight there.
// A '.layer', so UI.show() closes it whenever the game opens another screen; the gamepad
// moves between its buttons and B presses "Understood" (data-back).
import { tx } from '../i18n';
import type { NewsCard, TryTarget } from '../game/WhatsNew';
import { onBackKey } from './serviceCommon';

const CSS = `
#whatsNew { overflow: auto; -webkit-overflow-scrolling: touch; z-index: 14;
  background-color: #5d4329;
  background-image:
    radial-gradient(rgba(0,0,0,.22) 1px, transparent 1.6px), radial-gradient(rgba(255,226,170,.10) 1px, transparent 1.8px),
    radial-gradient(ellipse at 50% 40%, rgba(255,214,150,.16), rgba(0,0,0,.55) 85%);
  background-size: 7px 7px, 11px 11px, 100% 100%; background-position: 0 0, 3px 5px, 0 0; }
#whatsNew .wn-board { max-width: 1180px; margin: 0 auto; padding: 26px 28px 30px; position: relative; }
#whatsNew .wn-board::before { content: ''; position: fixed; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 10px #3b2a19, inset 0 0 0 13px #24190e, inset 0 0 60px rgba(0,0,0,.6); }
#whatsNew .wn-head { display: flex; align-items: flex-end; gap: 18px; margin-bottom: 18px; flex-wrap: wrap; }
#whatsNew .wn-sheet { background: #e8dfc6; color: #2b2518; padding: 12px 20px 12px; transform: rotate(-.6deg); box-shadow: 0 6px 16px rgba(0,0,0,.45); position: relative; }
#whatsNew .wn-sheet::after { content: ''; position: absolute; top: -9px; left: 50%; width: 70px; height: 20px; margin-left: -35px; background: rgba(233,220,170,.55); transform: rotate(2deg); box-shadow: 0 1px 2px rgba(0,0,0,.2); }
#whatsNew .wn-k { font: 600 11px/1.3 "IBM Plex Mono", monospace; letter-spacing: 2.5px; color: #8c1d15; text-transform: uppercase; }
#whatsNew h2 { font: 700 36px/1 Oswald, "Arial Narrow", sans-serif; letter-spacing: 3px; text-transform: uppercase; margin: 4px 0 2px; }
#whatsNew .wn-sub { font: 14px/1.35 "Special Elite", monospace; color: #4a3f2b; }
#whatsNew .wn-sp { flex: 1; }
#whatsNew .wn-close { font: 600 15px/1 Oswald, sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #f1e8cf; background: #3b4228; border: 2px solid #c9b77d; padding: 11px 18px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,.45); }
#whatsNew .wn-close:hover, #whatsNew .wn-close:focus-visible { background: #4b5132; outline: none; color: #fff; }
#whatsNew .wn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 20px 18px; }
#whatsNew .wn-card { position: relative; background: linear-gradient(178deg, #efe7d0, #e2d7b9); color: #2b2518; padding: 16px 14px 12px; box-shadow: 0 7px 14px rgba(0,0,0,.42), 0 1px 0 rgba(255,255,255,.5) inset;
  transform: rotate(var(--r, 0deg)); display: flex; flex-direction: column; animation: wn-pin .45s cubic-bezier(.2,.9,.3,1.2) both; animation-delay: var(--d, 0s); }
#whatsNew .wn-card:nth-child(3n+1) { --r: -1.1deg; } #whatsNew .wn-card:nth-child(3n+2) { --r: .7deg; } #whatsNew .wn-card:nth-child(4n) { --r: -.4deg; } #whatsNew .wn-card:nth-child(5n) { --r: 1.3deg; }
#whatsNew .wn-card:nth-child(2n) { background: linear-gradient(178deg, #f1e9d3, #e6dcc0); }
#whatsNew .wn-pin { position: absolute; top: -7px; left: 50%; width: 15px; height: 15px; margin-left: -7px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff8a73, #b3321f 55%, #5e140c); box-shadow: 1px 3px 3px rgba(0,0,0,.45); }
#whatsNew .wn-card:nth-child(3n) .wn-pin { background: radial-gradient(circle at 35% 30%, #fff1a8, #c9a227 55%, #5e4a0c); }
#whatsNew .wn-ill { display: block; width: 100%; height: auto; aspect-ratio: 120 / 60; margin-bottom: 8px; background: rgba(60,50,30,.06); border: 1px solid rgba(60,50,30,.18); }
#whatsNew .wn-t { font: 600 18px/1.15 Oswald, "Arial Narrow", sans-serif; letter-spacing: 1.5px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
#whatsNew .wn-tag { font: 700 10px/1 "IBM Plex Mono", monospace; letter-spacing: 2px; color: #8c1d15; border: 2px solid #8c1d15; padding: 2px 5px; transform: rotate(-6deg); }
#whatsNew .wn-d { font: 13px/1.45 "Special Elite", monospace; color: #3d3423; margin: 6px 0 10px; flex: 1; }
#whatsNew .wn-try { align-self: flex-start; font: 700 13px/1 "IBM Plex Mono", monospace; letter-spacing: 2px; text-transform: uppercase; color: #8c1d15; background: transparent;
  border: 2px solid #8c1d15; padding: 9px 12px; min-height: 40px; cursor: pointer; transform: rotate(-2deg); transition: background .15s, color .15s; }
#whatsNew .wn-try:hover, #whatsNew .wn-try:focus-visible { background: #8c1d15; color: #f4ead0; outline: none; }
#whatsNew .wn-foot { margin-top: 22px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
#whatsNew .wn-note { font: 12px/1.4 "IBM Plex Mono", monospace; color: #f0e3c2; opacity: .85; text-shadow: 0 1px 2px #000; }
@keyframes wn-pin { from { opacity: 0; transform: translateY(-14px) rotate(calc(var(--r, 0deg) - 4deg)) scale(1.04); } to { opacity: 1; transform: rotate(var(--r, 0deg)); } }
@media (prefers-reduced-motion: reduce) { #whatsNew .wn-card { animation: none; } }
@media (max-height: 520px), (max-width: 700px) {
  #whatsNew .wn-board { padding: 14px 16px 18px; }
  #whatsNew .wn-board::before { box-shadow: inset 0 0 0 6px #3b2a19, inset 0 0 40px rgba(0,0,0,.6); }
  #whatsNew .wn-head { margin-bottom: 12px; gap: 10px; }
  #whatsNew .wn-sheet { padding: 8px 14px; }
  #whatsNew h2 { font-size: 26px; }
  #whatsNew .wn-sub { font-size: 12px; }
  #whatsNew .wn-grid { grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 14px 12px; }
  #whatsNew .wn-card { padding: 12px 11px 10px; }
  #whatsNew .wn-ill { aspect-ratio: 120 / 40; margin-bottom: 6px; }
  #whatsNew .wn-t { font-size: 15px; }
  #whatsNew .wn-d { font-size: 12px; line-height: 1.38; margin: 4px 0 8px; }
}
/* Arabic: the board reads from the right (grid order follows dir); Arabic faces for the text */
html[lang=ar] #whatsNew h2, html[lang=ar] #whatsNew .wn-t, html[lang=ar] #whatsNew .wn-close { font-family: Oswald, "Noto Kufi Arabic", sans-serif; letter-spacing: 0; }
html[lang=ar] #whatsNew .wn-sub, html[lang=ar] #whatsNew .wn-d { font-family: "Special Elite", "Noto Naskh Arabic", serif; font-size: 14px; line-height: 1.6; }
html[lang=ar] #whatsNew .wn-k, html[lang=ar] #whatsNew .wn-try, html[lang=ar] #whatsNew .wn-note, html[lang=ar] #whatsNew .wn-tag { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 0; }
html[dir=rtl] #whatsNew .wn-try { align-self: flex-end; transform: rotate(2deg); }
@media (max-height: 520px), (max-width: 700px) { html[lang=ar] #whatsNew .wn-d { font-size: 12.5px; line-height: 1.5; } }
`;

let cssDone = false;
function injectCss() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------------- ink illustrations (viewBox 120 × 60) ----------------
const INK = '#3a3122', RED = '#a3321f', GOLD = '#c9a227', OLIVE = '#5b6238', SKY = '#9fb3b8';
// top views, nose up, about 20 units across: a fighter and a four-engine bomber
const FIGHTER = 'M0,-10 L1.2,-7 L1.2,-2 L10,0 L10,1.6 L1.2,1.6 L0.9,6 L4,7.6 L4,8.8 L0,8.2 L-4,8.8 L-4,7.6 L-0.9,6 L-1.2,1.6 L-10,1.6 L-10,0 L-1.2,-2 L-1.2,-7 Z';
const BOMBER = 'M0,-12 L1.8,-9 L1.8,-3 L16,-1 L16,1.5 L1.8,2 L1.2,9 L6,10.5 L6,12 L0,11.5 L-6,12 L-6,10.5 L-1.2,9 L-1.8,2 L-16,1.5 L-16,-1 L-1.8,-3 L-1.8,-9 Z';
const ac = (d: string, x: number, y: number, s: number, rot: number, fill = INK) => `<path d="${d}" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${fill}"/>`;
// side view of a fighter (nose right), about 24 long
const SIDE = 'M-12,0 L-10,-3.5 L-8,-3.5 L-6,-0.8 L4,-1 L6,-2.6 L8.5,-2.4 L10,-0.8 L12,-0.3 L12,1.2 L-6,1.6 Z';

const ILL: Record<TryTarget, () => string> = {
  campaign: () => `<path d="M8 50 C20 44 18 30 30 28 S48 14 60 18 S80 10 92 16 S108 12 114 8" fill="none" stroke="${SKY}" stroke-width="2"/>
    <path d="M0 20h120M0 40h120M30 0v60M60 0v60M90 0v60" stroke="${INK}" stroke-width=".4" opacity=".35"/>
    <path d="M14 46 L44 34 L78 24 L102 14" fill="none" stroke="${RED}" stroke-width="1.6" stroke-dasharray="4 3"/>
    <circle cx="14" cy="46" r="3.2" fill="${OLIVE}"/><circle cx="78" cy="24" r="3.6" fill="${RED}"/><circle cx="102" cy="14" r="3.6" fill="${RED}"/>
    <circle cx="56" cy="44" r="2.4" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="88" cy="40" r="2.4" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <path d="M44 34 L56 44 M78 24 L88 40" stroke="${INK}" stroke-width=".8" stroke-dasharray="2 2"/>`,
  takeoff: () => `<circle cx="96" cy="16" r="9" fill="${GOLD}" opacity=".55"/><path d="M0 44 H120" stroke="${INK}" stroke-width=".6"/>
    <path d="M40 60 L56 44 L64 44 L80 60 Z" fill="${INK}" opacity=".18"/><path d="M60 46 V48 M60 51 V54 M60 57 V60" stroke="#efe7d0" stroke-width="1.2"/>
    ${ac(BOMBER, 38, 26, 1.05, 62)}<path d="M8 36 l10 -2 M6 30 l9 -2" stroke="${INK}" stroke-width=".6" opacity=".5"/>`,
  boss: () => `<path d="M8 32 Q60 18 112 30 L112 34 Q60 44 8 36 Z" fill="${INK}"/><rect x="40" y="22" width="40" height="5" fill="${INK}"/>
    <path d="M30 26 h8 v-4 h-2 v2 h-4z M52 21 h8 v-5 h-2 v3 h-6z M84 25 h8 v-4 h-2 v2 h-4z" fill="${INK}"/><path d="M58 16 l12 -6" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="70" cy="10" r="2" fill="${RED}"/>${ac(FIGHTER, 18, 12, .45, 120, OLIVE)}${ac(FIGHTER, 104, 50, .45, -60, OLIVE)}
    <path d="M20 46 l6 4 M96 12 l6 -3" stroke="${RED}" stroke-width="1"/>`,
  interior: () => `<rect x="0" y="0" width="120" height="60" fill="${INK}" opacity=".12"/><rect x="26" y="8" width="54" height="40" rx="8" fill="${SKY}" stroke="${INK}" stroke-width="3"/>
    ${ac(FIGHTER, 62, 22, .5, -100)}<path d="M8 58 L46 36" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M44 37 L58 29" stroke="${INK}" stroke-width="2.4"/>
    <path d="M14 52 l3 4 M20 54 l4 2 M10 56 l4 1" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>
    <rect x="90" y="18" width="20" height="20" rx="3" fill="#efe7d0" stroke="${INK}" stroke-width="1.6"/><text x="100" y="33" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-weight="700" font-size="14" fill="${INK}">C</text>`,
  specials: () => `<path d="M0 50 H120" stroke="${INK}" stroke-width="1"/><path d="M0 53 H120" stroke="${INK}" stroke-width=".6" stroke-dasharray="3 2"/>
    <rect x="16" y="38" width="22" height="10" fill="${INK}"/><rect x="30" y="31" width="8" height="8" fill="${INK}"/><rect x="18" y="33" width="4" height="6" fill="${INK}"/>
    <rect x="41" y="40" width="18" height="8" fill="${INK}" opacity=".8"/><rect x="62" y="40" width="18" height="8" fill="${INK}" opacity=".8"/>
    <path d="M20 32 q-4 -6 2 -10 q6 -4 2 -10" fill="none" stroke="${INK}" stroke-width="2" opacity=".35"/>
    <path d="M96 60 L70 0 L78 0 Z" fill="${GOLD}" opacity=".25"/><path d="${SIDE}" transform="translate(84 20) rotate(14) scale(1.1)" fill="${OLIVE}"/>
    <path d="M70 26 L50 38" stroke="${RED}" stroke-width="1.2" stroke-dasharray="3 2"/>`,
  wingman: () => `${ac(FIGHTER, 46, 34, 1.4, 0)}${ac(FIGHTER, 76, 46, 1.4, 0, OLIVE)}
    <path d="M60 22 a8 8 0 0 1 10 -4 M57 18 a13 13 0 0 1 16 -6" fill="none" stroke="${RED}" stroke-width="1.4"/>
    <g font-family="IBM Plex Mono, monospace" font-weight="700" font-size="9" fill="${INK}"><text x="92" y="16">1</text><text x="102" y="16">2</text><text x="92" y="28">3</text><text x="102" y="28">4</text></g>`,
  nemesis: () => `<rect x="10" y="6" width="44" height="50" fill="#efe7d0" stroke="${INK}" stroke-width="1.2"/><circle cx="32" cy="24" r="9" fill="${INK}" opacity=".75"/>
    <path d="M18 50 q14 -16 28 0" fill="${INK}" opacity=".75"/><text x="32" y="15" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="5" font-weight="700" fill="${RED}">${tx('WANTED')}</text>
    <path d="${SIDE}" transform="translate(88 30) scale(1.5)" fill="${INK}"/><path d="M104 28.5 L106 27 L108 28.2 L108 31 L104 31.5 Z" fill="${GOLD}"/>
    <path d="M70 46 h34" stroke="${RED}" stroke-width="1.4"/><path d="M72 50 h8 M84 50 h8 M96 50 h8" stroke="${INK}" stroke-width="2"/>`,
  skills: () => `<g stroke="${INK}" stroke-width="1.4"><path d="M60 54 V40 M60 40 L30 26 M60 40 L60 26 M60 40 L90 26 M30 26 V12 M60 26 V12 M90 26 V12"/></g>
    <circle cx="60" cy="54" r="4.5" fill="${RED}"/>${[30, 60, 90].map((x) => `<circle cx="${x}" cy="26" r="4.5" fill="${OLIVE}"/><circle cx="${x}" cy="12" r="4.5" fill="#efe7d0" stroke="${INK}" stroke-width="1.4"/>`).join('')}
    <path d="M57.5 12 l2 2 l3.5 -4" stroke="${INK}" stroke-width="1.4" fill="none"/>`,
  custom: () => `<rect x="10" y="6" width="40" height="48" fill="#efe7d0" stroke="${INK}" stroke-width="1.2"/><rect x="10" y="6" width="40" height="11" fill="${RED}"/>
    <text x="30" y="14.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="6.5" font-weight="700" fill="#efe7d0">${tx('WEEK')}</text>
    <text x="30" y="42" text-anchor="middle" font-family="Oswald, sans-serif" font-size="22" font-weight="700" fill="${INK}">41</text>
    <g stroke="${INK}" stroke-width="1.4"><path d="M64 16 H112 M64 30 H112 M64 44 H112"/></g>
    <circle cx="78" cy="16" r="4" fill="${OLIVE}"/><circle cx="100" cy="30" r="4" fill="${OLIVE}"/><circle cx="70" cy="44" r="4" fill="${RED}"/>`,
  theatre: () => `<rect x="4" y="12" width="112" height="36" fill="${INK}"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => `<rect x="${7 + i * 8}" y="14" width="4" height="3" fill="#efe7d0"/><rect x="${7 + i * 8}" y="43" width="4" height="3" fill="#efe7d0"/>`).join('')}
    <rect x="10" y="19" width="30" height="22" fill="${SKY}"/><rect x="45" y="19" width="30" height="22" fill="${SKY}"/><rect x="80" y="19" width="30" height="22" fill="${SKY}"/>
    ${ac(FIGHTER, 25, 30, .5, 70)}<circle cx="62" cy="30" r="6" fill="${GOLD}"/><circle cx="62" cy="30" r="3" fill="${RED}"/>${ac(FIGHTER, 95, 30, .5, 110)}
    <path d="M0 54 H120" stroke="${INK}" stroke-width="1"/><path d="M60 50 l3 4 l-3 4" fill="${RED}"/>`,
  coop: () => `<path d="M18 40 a14 14 0 0 1 28 0" fill="none" stroke="${INK}" stroke-width="4"/><rect x="14" y="38" width="8" height="12" rx="2" fill="${INK}"/><rect x="42" y="38" width="8" height="12" rx="2" fill="${INK}"/>
    <path d="M74 40 a14 14 0 0 1 28 0" fill="none" stroke="${OLIVE}" stroke-width="4"/><rect x="70" y="38" width="8" height="12" rx="2" fill="${OLIVE}"/><rect x="98" y="38" width="8" height="12" rx="2" fill="${OLIVE}"/>
    <path d="M50 30 q10 -10 20 0" fill="none" stroke="${RED}" stroke-width="1.6" stroke-dasharray="3 2"/>
    <text x="60" y="58" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" font-weight="700" fill="${INK}">7K2P9Q</text>`,
  arabic: () => `<text x="38" y="46" text-anchor="middle" font-family="Noto Kufi Arabic, Noto Naskh Arabic, serif" font-size="38" font-weight="700" fill="${INK}">ع</text>
    <text x="88" y="44" text-anchor="middle" font-family="Oswald, sans-serif" font-size="30" font-weight="700" fill="${OLIVE}">Aa</text>
    <path d="M56 30 h10 m-3 -3 l3 3 l-3 3 M66 38 h-10 m3 -3 l-3 3 l3 3" fill="none" stroke="${RED}" stroke-width="1.4"/>`,
};

export function illustration(id: TryTarget): string {
  return `<svg class="wn-ill" viewBox="0 0 120 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ILL[id]()}</svg>`;
}

export interface WhatsNewHandlers {
  tryIt(id: TryTarget): void;
  close(): void;
}

/** Builds and shows the board (a '.layer'; the caller hides / restores the other layers). */
export function showWhatsNew(cards: NewsCard[], version: string, h: WhatsNewHandlers): HTMLElement {
  injectCss();
  let el = document.getElementById('whatsNew');
  if (!el) {
    el = document.createElement('div');
    el.id = 'whatsNew';
    el.className = 'layer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', tx("What's new"));
  el.innerHTML = `<div class="wn-board">
    <div class="wn-head">
      <div class="wn-sheet"><div class="wn-k">${tx('401st Bomb Group · Operations bulletin')}</div>
        <h2>${tx("What's new")}</h2>
        <div class="wn-sub">${tx('Orders of the day · version {v}', { v: esc(version) })}</div></div>
      <div class="wn-sp"></div>
      <button class="wn-close" data-back>${tx('Understood')}</button>
    </div>
    <div class="wn-grid">${cards.map((c, i) => `<div class="wn-card" style="--d:${(0.04 * i).toFixed(2)}s"><i class="wn-pin"></i>
      ${illustration(c.id)}
      <div class="wn-t"><span>${esc(tx(c.title))}</span>${c.tag ? `<span class="wn-tag">${esc(tx(c.tag))}</span>` : ''}</div>
      <div class="wn-d">${esc(tx(c.text))}</div>
      <button class="wn-try" data-try="${c.id}">${tx('Try it')} ›</button></div>`).join('')}</div>
    <div class="wn-foot"><button class="wn-close" data-back>${tx('Understood')}</button>
      <span class="wn-note">${tx('This bulletin stays pinned up: title menu → What\'s new, or Settings.')}</span></div>
  </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-try]').forEach((b) => b.addEventListener('click', () => h.tryIt(b.dataset.try as TryTarget)));
  el.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => b.addEventListener('click', () => h.close()));
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === el));
  el.scrollTop = 0;
  onBackKey(el, () => h.close());
  return el;
}

export function hideWhatsNew() {
  document.getElementById('whatsNew')?.classList.remove('show');
}
