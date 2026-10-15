// Aircraft recognition gallery (DOM): the aircraft list, the spec card, the previous / next
// bar, the controls hint and the recognition quiz panel, over the 3D hangar drawn by
// game/AircraftGallery.ts (all logic lives there, behind GalleryControl).
// A '.layer' (UI.show() closes it; AircraftGallery notices and shuts the hangar down); the
// layer itself lets pointer events through to the canvas (drag to orbit) and only its panels
// take clicks. The gamepad moves between its buttons; B presses Back (data-back).
// Phones (812×375 landscape): a narrow list, a compact spec card and a slim top bar.
// Arabic: the list and the card swap sides.
// Museum (Phase 11 goal 30): the card has four sections (specs, history, crew, facts: the facts
// unlock as you meet each type, game/Museum.ts), the list marks aircraft with facts not yet read,
// and the Codex tab shows crew roles, medals and operations (ui/CodexPanel.ts).
import { tx, num } from '../i18n';
import { serviceLabel, type AircraftId, type AircraftSpec } from '../game/AircraftData';
import { ruleText, type MuseumEntry } from '../game/Museum';
import type { CodexCtx, CodexEntry } from '../game/Codex';
import { CodexPanel, CODEX_CSS } from './CodexPanel';
import { onBackKey } from './serviceCommon';

/** The museum side of the card for one aircraft. */
export interface MuseumView { entry: MuseumEntry; open: boolean[] }
export type CardSection = 'specs' | 'history' | 'crew' | 'facts';
const SECTIONS: [CardSection, string][] = [['specs', 'Specs'], ['history', 'History'], ['crew', 'Crew'], ['facts', 'Facts']];

export interface GalleryControl {
  select(id: AircraftId): void;
  step(dir: number): void;
  startQuiz(): void;
  stopQuiz(): void;
  answer(id: AircraftId): void;
  nextRound(): void;
  back(): void;
  /** The Codex tab (the 3D aircraft keeps turning behind it). */
  openCodex(): void;
  /** The facts of this aircraft are on screen: they are no longer news. */
  factsSeen(id: AircraftId): void;
}

const CSS = `
#acGallery { pointer-events: none; z-index: 12; font-family: Oswald, "Arial Narrow", sans-serif; color: var(--ink, #e9e2cf); }
#acGallery .ag-p { position: absolute; pointer-events: auto; background: rgba(16,15,11,.76); border: 1px solid rgba(233,226,207,.16); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
#acGallery button { font: inherit; color: inherit; cursor: pointer; }
#acGallery .ag-top { left: 16px; right: 16px; top: 14px; display: flex; align-items: center; gap: 14px; padding: 8px 12px; }
#acGallery .ag-k { font: 600 11px/1.2 "IBM Plex Mono", monospace; letter-spacing: 3px; color: #d9573f; text-transform: uppercase; }
#acGallery .ag-h { font-size: 20px; letter-spacing: 3px; text-transform: uppercase; white-space: nowrap; }
#acGallery .ag-sp { flex: 1; }
#acGallery .ag-tab, #acGallery .ag-back { background: rgba(255,255,255,.04); border: 1px solid rgba(233,226,207,.22); padding: 7px 12px; min-height: 36px; letter-spacing: 1.5px; text-transform: uppercase; font-size: 14px; }
#acGallery .ag-tab.on { background: var(--khaki, #b9a76f); color: #1b1a12; border-color: var(--khaki, #b9a76f); }
#acGallery .ag-tab:hover, #acGallery .ag-back:hover, #acGallery .ag-tab:focus-visible, #acGallery .ag-back:focus-visible { border-color: var(--khaki, #b9a76f); outline: none; }
#acGallery .ag-list { left: 16px; top: 72px; bottom: 16px; width: 200px; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
#acGallery .ag-list button { display: flex; align-items: center; gap: 8px; text-align: start; background: none; border: 1px solid transparent; padding: 6px 8px; min-height: 40px; }
#acGallery .ag-list button i { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #d9573f; }
#acGallery .ag-list button.allied i { background: #9fc26b; }
#acGallery .ag-list button.fict i { background: #c9a227; border-radius: 1px; transform: rotate(45deg); }
#acGallery .ag-list button span { display: flex; flex-direction: column; min-width: 0; }
#acGallery .ag-list button b { font-weight: 500; font-size: 16px; letter-spacing: 1px; }
#acGallery .ag-list button small { font: 10.5px/1.25 "IBM Plex Mono", monospace; color: var(--ink-dim, #b9b19b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#acGallery .ag-list button:hover, #acGallery .ag-list button:focus-visible { border-color: rgba(233,226,207,.25); outline: none; }
#acGallery .ag-list button.on { background: rgba(185,167,111,.18); border-color: var(--khaki, #b9a76f); }
#acGallery .ag-card { right: 16px; top: 72px; width: 300px; max-height: calc(100% - 88px); overflow: auto; padding: 14px 16px 14px;
  background: linear-gradient(178deg, rgba(236,227,201,.96), rgba(222,211,180,.96)); color: #2b2518; border-color: rgba(0,0,0,.4); box-shadow: 0 8px 22px rgba(0,0,0,.45); }
#acGallery .ag-card .ag-k { color: #8c1d15; }
#acGallery .ag-card .ag-k.allied { color: #3d5a1f; }
#acGallery .ag-card h3 { margin: 4px 0 2px; font-size: 23px; line-height: 1.1; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
#acGallery .ag-role { font: 13px/1.35 "Special Elite", monospace; color: #4a3f2b; margin-bottom: 8px; }
#acGallery .ag-card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; font-size: 14px; }
#acGallery .ag-card dt { font: 600 10.5px/1.6 "IBM Plex Mono", monospace; letter-spacing: 1px; text-transform: uppercase; color: #6b5a3a; white-space: nowrap; }
#acGallery .ag-card dd { margin: 0; line-height: 1.3; }
#acGallery .ag-tip { margin-top: 11px; padding: 8px 10px; border-left: 3px solid #8c1d15; background: rgba(140,29,21,.07); font: 13px/1.45 "Special Elite", monospace; }
#acGallery .ag-tip b { display: block; font: 700 10px/1.4 "IBM Plex Mono", monospace; letter-spacing: 2px; color: #8c1d15; text-transform: uppercase; }
#acGallery .ag-kills { margin-top: 10px; font: 13px/1.3 "IBM Plex Mono", monospace; }
#acGallery .ag-kills b { font: 700 20px/1 Oswald, sans-serif; color: #8c1d15; margin-inline-start: 4px; }
#acGallery .ag-note { margin-top: 8px; font: 11px/1.4 "IBM Plex Mono", monospace; color: #6b5a3a; }
#acGallery .ag-note.fict { color: #8c1d15; font-weight: 700; }
#acGallery .ag-nav { left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 4px; }
#acGallery .ag-nav button { min-width: 44px; min-height: 40px; background: rgba(255,255,255,.04); border: 1px solid rgba(233,226,207,.2); font-size: 18px; }
#acGallery .ag-nav .ag-name { min-width: 150px; text-align: center; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; padding: 0 8px; }
#acGallery .ag-hint { position: absolute; left: 50%; bottom: 66px; transform: translateX(-50%); font: 11px/1.4 "IBM Plex Mono", monospace; letter-spacing: 1px; color: rgba(255,255,255,.62);
  text-shadow: 0 1px 3px #000; white-space: nowrap; pointer-events: none; }
#acGallery .ag-load { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: 13px/1 "IBM Plex Mono", monospace; letter-spacing: 3px; color: var(--khaki, #b9a76f);
  text-transform: uppercase; display: none; text-shadow: 0 1px 4px #000; }
#acGallery.loading .ag-load { display: block; }
#acGallery .ag-quiz { left: 50%; bottom: 16px; transform: translateX(-50%); width: min(560px, calc(100% - 32px)); padding: 12px 14px; display: none; text-align: center; }
#acGallery .ag-qhead { display: flex; justify-content: space-between; font: 12px/1.3 "IBM Plex Mono", monospace; letter-spacing: 2px; color: var(--ink-dim, #b9b19b); text-transform: uppercase; }
#acGallery .ag-qprompt { font-size: 19px; letter-spacing: 2px; text-transform: uppercase; margin: 6px 0 10px; min-height: 24px; }
#acGallery .ag-qprompt.ok { color: #9fc26b; } #acGallery .ag-qprompt.bad { color: #d9573f; }
#acGallery .ag-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#acGallery .ag-choices button { min-height: 44px; background: rgba(255,255,255,.05); border: 1px solid rgba(233,226,207,.25); font-size: 17px; letter-spacing: 1px; }
#acGallery .ag-choices button:hover:not(:disabled), #acGallery .ag-choices button:focus-visible { border-color: var(--khaki, #b9a76f); outline: none; }
#acGallery .ag-choices button.right { background: rgba(159,194,107,.3); border-color: #9fc26b; }
#acGallery .ag-choices button.wrong { background: rgba(217,87,63,.3); border-color: #d9573f; }
#acGallery .ag-choices button:disabled { cursor: default; }
#acGallery .ag-choices button kbd { font: 11px "IBM Plex Mono", monospace; opacity: .55; margin-inline-end: 6px; }
#acGallery .ag-qrow { display: flex; justify-content: center; gap: 8px; margin-top: 10px; min-height: 40px; }
#acGallery .ag-qrow button { min-height: 40px; padding: 6px 16px; background: var(--khaki, #b9a76f); color: #1b1a12; border: 0; letter-spacing: 2px; text-transform: uppercase; font-size: 15px; }
#acGallery .ag-qrow button.ghost { background: rgba(255,255,255,.05); color: inherit; border: 1px solid rgba(233,226,207,.25); }
#acGallery .ag-qbest { font: 12px/1.4 "IBM Plex Mono", monospace; color: var(--khaki, #b9a76f); margin-top: 6px; }
#acGallery .ag-qbest:empty { display: none; }
#acGallery.quiz .ag-list, #acGallery.quiz .ag-card, #acGallery.quiz .ag-nav, #acGallery.quiz .ag-hint { display: none; }
#acGallery.quiz .ag-quiz { display: block; }
@media (max-height: 520px), (max-width: 760px) {
  #acGallery .ag-top { left: 8px; right: 8px; top: 6px; padding: 4px 8px; gap: 8px; }
  #acGallery .ag-top .ag-k { display: none; }
  #acGallery .ag-h { font-size: 15px; letter-spacing: 2px; }
  #acGallery .ag-tab, #acGallery .ag-back { font-size: 12px; padding: 5px 9px; min-height: 40px; }
  #acGallery .ag-list { left: 8px; top: 58px; bottom: 8px; width: 148px; padding: 4px; }
  #acGallery .ag-list button { padding: 4px 6px; gap: 6px; }
  #acGallery .ag-list button b { font-size: 14px; }
  #acGallery .ag-list button small { display: none; }
  #acGallery .ag-card { right: 8px; top: 58px; width: 236px; max-height: calc(100% - 66px); padding: 10px 11px; }
  #acGallery .ag-card h3 { font-size: 17px; }
  #acGallery .ag-role { font-size: 11.5px; margin-bottom: 6px; }
  #acGallery .ag-card dl { font-size: 12px; gap: 3px 8px; }
  #acGallery .ag-card dt { font-size: 9.5px; }
  #acGallery .ag-tip { font-size: 11.5px; margin-top: 8px; padding: 6px 8px; }
  #acGallery .ag-kills { margin-top: 7px; font-size: 11.5px; }
  #acGallery .ag-kills b { font-size: 16px; }
  #acGallery .ag-nav { bottom: 8px; }
  #acGallery .ag-nav .ag-name { min-width: 96px; font-size: 13px; }
  #acGallery .ag-hint { display: none; }
  #acGallery .ag-quiz { bottom: 8px; padding: 6px 10px 8px; width: min(720px, calc(100% - 16px)); }
  #acGallery .ag-qhead { font-size: 10.5px; }
  #acGallery .ag-qprompt { font-size: 14px; margin: 2px 0 6px; min-height: 18px; }
  #acGallery .ag-choices { gap: 6px; grid-template-columns: repeat(4, 1fr); }
  #acGallery .ag-choices button { min-height: 40px; font-size: 14px; padding: 0 4px; }
  #acGallery .ag-qrow { margin-top: 6px; }
  #acGallery .ag-qbest { margin-top: 3px; }
}
#acGallery .ag-list button.fresh b::after { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #e8a317; margin-inline-start: 6px; vertical-align: 3px; box-shadow: 0 0 6px #e8a317; }
#acGallery .ag-sec { display: flex; gap: 3px; margin: 2px 0 10px; border-bottom: 1px solid rgba(43,37,24,.25); }
#acGallery .ag-sec button { flex: 1; background: none; border: 0; border-bottom: 3px solid transparent; padding: 5px 2px 4px; min-height: 34px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #6b5a3a; white-space: nowrap; }
#acGallery .ag-sec button.on { color: #2b2518; border-bottom-color: #8c1d15; font-weight: 600; }
#acGallery .ag-sec button:focus-visible { outline: 2px solid #8c1d15; outline-offset: -2px; }
#acGallery .ag-sec button.fresh::after { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #c26a0c; margin-inline-start: 4px; vertical-align: 2px; }
#acGallery .ag-hist { margin: 0; font: 14px/1.55 "Special Elite", monospace; }
#acGallery .ag-crew { margin: 0; padding-inline-start: 22px; font-size: 14.5px; line-height: 1.5; }
#acGallery .ag-crew li::marker { font: 11px "IBM Plex Mono", monospace; color: #6b5a3a; }
#acGallery .ag-crewn { font: 11px/1.4 "IBM Plex Mono", monospace; color: #6b5a3a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
#acGallery .ag-facts { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
#acGallery .ag-facts li { padding: 7px 9px; background: rgba(61,90,31,.08); border-inline-start: 3px solid #3d5a1f; font: 13px/1.45 "Special Elite", monospace; }
#acGallery .ag-facts li.locked { background: none; border: 1px dashed rgba(43,37,24,.35); color: #6b5a3a; font: 11.5px/1.4 "IBM Plex Mono", monospace; }
#acGallery .ag-facts li.locked b { display: block; letter-spacing: 2px; text-transform: uppercase; font-size: 10px; }
#acGallery .ag-fcount { font: 11px/1.4 "IBM Plex Mono", monospace; color: #6b5a3a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
#acGallery .ag-card.more::after { content: '▾ ' attr(data-more); position: sticky; bottom: -14px; display: block; box-sizing: border-box; height: 32px; margin: -32px -16px 0; padding: 19px 0 0;
  text-align: center; pointer-events: none; font: 600 9.5px/1 "IBM Plex Mono", monospace; letter-spacing: 1px; text-transform: uppercase; color: #6b5a3a;
  background: linear-gradient(rgba(222,211,180,0), rgba(222,211,180,.97) 55%); }
@media (max-height: 520px), (max-width: 760px) {
  #acGallery .ag-card.more::after { bottom: -10px; margin: -32px -11px 0; }
  #acGallery .ag-sec { margin-bottom: 6px; }
  #acGallery .ag-sec button { font-size: 10.5px; letter-spacing: 0; min-height: 30px; padding: 3px 1px; }
  #acGallery .ag-hist, #acGallery .ag-facts li { font-size: 11.5px; line-height: 1.4; }
  #acGallery .ag-crew { font-size: 12px; line-height: 1.4; }
  #acGallery .ag-facts li { padding: 5px 7px; }
}
html[lang=ar] #acGallery .ag-sec button, html[lang=ar] #acGallery .ag-card.more::after { letter-spacing: 0; }
html[lang=ar] #acGallery .ag-card.more::after { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; }
html[lang=ar] #acGallery .ag-hist, html[lang=ar] #acGallery .ag-facts li { font-family: "Special Elite", "Noto Naskh Arabic", serif; line-height: 1.7; }
html[lang=ar] #acGallery .ag-crewn, html[lang=ar] #acGallery .ag-fcount, html[lang=ar] #acGallery .ag-facts li.locked { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 0; }
html[lang=ar] #acGallery { font-family: Oswald, "Noto Kufi Arabic", "Arial Narrow", sans-serif; }
html[lang=ar] #acGallery .ag-h, html[lang=ar] #acGallery .ag-tab, html[lang=ar] #acGallery .ag-back, html[lang=ar] #acGallery .ag-qprompt, html[lang=ar] #acGallery .ag-nav .ag-name { letter-spacing: 0; }
html[lang=ar] #acGallery .ag-k, html[lang=ar] #acGallery .ag-card dt, html[lang=ar] #acGallery .ag-kills, html[lang=ar] #acGallery .ag-note, html[lang=ar] #acGallery .ag-hint,
html[lang=ar] #acGallery .ag-qhead, html[lang=ar] #acGallery .ag-qbest, html[lang=ar] #acGallery .ag-list small, html[lang=ar] #acGallery .ag-load, html[lang=ar] #acGallery .ag-tip b { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 0; }
html[lang=ar] #acGallery .ag-role, html[lang=ar] #acGallery .ag-tip { font-family: "Special Elite", "Noto Naskh Arabic", serif; line-height: 1.6; }
html[dir=rtl] #acGallery .ag-list { left: auto; right: 16px; }
html[dir=rtl] #acGallery .ag-card { right: auto; left: 16px; }
html[dir=rtl] #acGallery .ag-tip { border-left: 0; border-right: 3px solid #8c1d15; }
html[dir=rtl] #acGallery .ag-nav { direction: ltr; }
html[dir=rtl] #acGallery .ag-nav .ag-name { direction: rtl; }
@media (max-height: 520px), (max-width: 760px) {
  html[dir=rtl] #acGallery .ag-list { right: 8px; }
  html[dir=rtl] #acGallery .ag-card { left: 8px; }
}
`;

let cssDone = false;
function injectCss() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS + CODEX_CSS;
  document.head.appendChild(s);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class GalleryScreen {
  root: HTMLElement | null = null;
  private c: GalleryControl | null = null;
  private specs: AircraftSpec[] = [];
  private section: CardSection = 'specs';
  private codex: CodexPanel | null = null;
  private last: { s: AircraftSpec; kills: number | null; m: MuseumView | null } | null = null;

  show(specs: AircraftSpec[], c: GalleryControl) {
    injectCss();
    this.specs = specs;
    this.c = c;
    let r = document.getElementById('acGallery');
    if (!r) {
      r = document.createElement('div');
      r.id = 'acGallery';
      r.className = 'layer';
      document.body.appendChild(r);
    }
    this.root = r;
    r.className = 'layer';
    r.innerHTML = `
      <div class="ag-p ag-top">
        <div><div class="ag-k">${tx('Museum and codex')}</div><div class="ag-h">${tx('Hangar 2 · Deenethorpe')}</div></div>
        <div class="ag-sp"></div>
        <button class="ag-tab on" data-tab="gallery">${tx('Aircraft')}</button><button class="ag-tab" data-tab="codex">${tx('Codex')}</button><button class="ag-tab" data-tab="quiz">${tx('Recognition quiz')}</button>
        <button class="ag-back" data-back>${tx('Back')}</button>
      </div>
      <div class="ag-p ag-list" role="listbox" aria-label="${esc(tx('Aircraft'))}">${specs.map((s) => `<button data-id="${s.id}" class="${s.side}${s.fictional ? ' fict' : ''}" role="option"><i></i><span><b>${esc(tx(s.nick))}</b><small>${esc(tx(s.role))}</small></span></button>`).join('')}</div>
      <div class="ag-p ag-card" aria-live="polite"></div>
      <div class="ag-hint">${tx('Drag to orbit · wheel or pinch to zoom · ← → change aircraft · gamepad: right stick, LT / RT, LB / RB')}</div>
      <div class="ag-p ag-nav"><button data-step="-1" aria-label="${esc(tx('Previous aircraft'))}">‹</button><div class="ag-name"></div><button data-step="1" aria-label="${esc(tx('Next aircraft'))}">›</button></div>
      <div class="ag-load">${tx('Wheeling her out…')}</div>
      <div class="ag-p ag-codex"></div>
      <div class="ag-p ag-quiz">
        <div class="ag-qhead"><span class="ag-qround"></span><span class="ag-qscore"></span></div>
        <div class="ag-qprompt"></div>
        <div class="ag-choices"></div>
        <div class="ag-qrow"></div>
        <div class="ag-qbest"></div>
      </div>`;
    r.querySelectorAll<HTMLButtonElement>('.ag-list [data-id]').forEach((b) => b.addEventListener('click', () => c.select(b.dataset.id as AircraftId)));
    r.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => c.step(+b.dataset.step!)));
    r.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => (b.dataset.tab === 'quiz' ? c.startQuiz() : b.dataset.tab === 'codex' ? c.openCodex() : c.stopQuiz())));
    r.querySelector('[data-back]')!.addEventListener('click', () => c.back());
    const card = r.querySelector<HTMLElement>('.ag-card')!;
    card.addEventListener('scroll', this.updateMore, { passive: true });
    card.dataset.more = tx('Scroll for more');
    addEventListener('resize', this.updateMore);
    document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === r));
    onBackKey(r, () => c.back());
  }

  close() {
    removeEventListener('resize', this.updateMore);
    this.root?.classList.remove('show');
    if (this.root) this.root.innerHTML = '';
    this.root = null;
    this.c = null;
    this.codex = null;
    this.last = null;
  }

  get open() { return !!this.root && this.root.classList.contains('show'); }

  setLoading(on: boolean) { this.root?.classList.toggle('loading', on); }

  /** The spec card and list selection for one aircraft; kills null = not an enemy. */
  setCurrent(s: AircraftSpec, kills: number | null, m: MuseumView | null = null) {
    const r = this.root;
    if (!r) return;
    this.last = { s, kills, m };
    r.querySelectorAll<HTMLElement>('.ag-list [data-id]').forEach((b) => {
      const on = b.dataset.id === s.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
    r.querySelector('.ag-name')!.textContent = tx(s.nick);
    const sec = m ? this.section : 'specs';
    if (m && sec === 'facts') this.c?.factsSeen(s.id);   // read now: clears the marks before they are drawn
    const fresh = r.querySelector(`.ag-list [data-id="${s.id}"]`)?.classList.contains('fresh');
    const tabs = m ? `<div class="ag-sec" role="tablist">${SECTIONS.map(([id, label]) => `<button role="tab" data-sec="${id}" class="${id === sec ? 'on' : ''}${id === 'facts' && fresh ? ' fresh' : ''}" aria-selected="${id === sec}">${tx(label)}</button>`).join('')}</div>` : '';
    const card = r.querySelector('.ag-card')!;
    card.innerHTML = `
      <div class="ag-k${s.side === 'allied' ? ' allied' : ''}">${tx(serviceLabel(s))}</div>
      <h3>${esc(tx(s.name))}</h3>
      <div class="ag-role">${esc(tx(s.role))}</div>
      ${tabs}
      <div class="ag-body">${m && sec !== 'specs' ? this.museumBody(sec, m) : this.specsBody(s, kills)}</div>`;
    card.querySelectorAll<HTMLButtonElement>('[data-sec]').forEach((b) => b.addEventListener('click', () => this.setSection(b.dataset.sec as CardSection, true)));
    card.scrollTop = 0;
    this.updateMore();
  }

  /** Card taller than the screen (phones): fade the bottom edge and show "more" until scrolled down. */
  private updateMore = () => {
    const card = this.root?.querySelector<HTMLElement>('.ag-card');
    if (card) card.classList.toggle('more', card.scrollHeight - card.scrollTop - card.clientHeight > 4);
  }

  /** Switch the card section (kept while the aircraft changes). */
  setSection(sec: CardSection, focus = false) {
    this.section = sec;
    const l = this.last;
    if (!l) return;
    this.setCurrent(l.s, l.kills, l.m);
    if (focus) this.root?.querySelector<HTMLButtonElement>('.ag-sec .on')?.focus({ preventScroll: true });
  }

  get cardSection() { return this.section; }

  /** The list's "new facts" marks. */
  setFresh(ids: AircraftId[]) {
    this.root?.querySelectorAll<HTMLElement>('.ag-list [data-id]').forEach((b) => b.classList.toggle('fresh', ids.includes(b.dataset.id as AircraftId)));
  }

  private specsBody(s: AircraftSpec, kills: number | null) {
    const row = (k: string, v: string) => `<dt>${tx(k)}</dt><dd>${esc(tx(v))}</dd>`;
    const killLine = kills === null ? `<div class="ag-kills">${tx('On our side: hold your fire')}</div>`
      : `<div class="ag-kills">${tx(s.fictional ? 'Warships downed by you:' : 'Shot down by you:')}<b>${num(kills)}</b></div>`;
    return `
      <dl>${row('Crew', s.crew)}${row('Armament', s.armament)}${row('Top speed', s.speed)}${row('Type first flight', s.first)}${row('Span × length', s.size)}</dl>
      <div class="ag-tip"><b>${tx('Gunner\'s note')}</b>${esc(tx(s.tip))}</div>
      ${killLine}
      ${s.note ? `<div class="ag-note${s.fictional ? ' fict' : ''}">${esc(tx(s.note))}</div>` : ''}`;
  }

  private museumBody(sec: CardSection, m: MuseumView) {
    const e = m.entry;
    if (sec === 'history') return `<p class="ag-hist">${esc(tx(e.history))}</p>`;
    if (sec === 'crew') {
      return `<div class="ag-crewn">${tx('Positions on board: {n}', { n: e.crew.length })}</div>
        <ol class="ag-crew">${e.crew.map((c) => `<li>${esc(tx(c))}</li>`).join('')}</ol>`;
    }
    const n = m.open.filter(Boolean).length;
    return `<div class="ag-fcount">${tx('Facts found: {n} / {total}', { n, total: e.facts.length })}</div>
      <ul class="ag-facts">${e.facts.map((f, i) => {
        if (m.open[i]) return `<li>${esc(tx(f.text))}</li>`;
        const [rule, p] = ruleText(f.rule);
        return `<li class="locked"><b>${tx('Locked')}</b>${esc(tx(rule, p))}</li>`;
      }).join('')}</ul>`;
  }

  // ---------------- codex ----------------
  setCodex(on: boolean, entries?: CodexEntry[], ctx?: CodexCtx) {
    const r = this.root;
    if (!r) return;
    r.classList.toggle('codex', on);
    if (on) r.classList.remove('quiz');
    r.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === (on ? 'codex' : r.classList.contains('quiz') ? 'quiz' : 'gallery')));
    if (on && entries && ctx) {
      this.codex = new CodexPanel(r.querySelector<HTMLElement>('.ag-codex')!, entries, ctx);
      this.codex.render(true);
    }
  }

  get codexPanel() { return this.codex; }

  /** What the panels cover at each edge (px), for centring the view in the space left over. */
  insets(): { left: number; right: number; top: number; bottom: number } {
    const r = this.root;
    const out = { left: 0, right: 0, top: 0, bottom: 0 };
    if (!r) return out;
    const W = innerWidth, H = innerHeight;
    const rect = (sel: string) => { const b = r.querySelector(sel)?.getBoundingClientRect(); return b && b.width > 0 ? b : null; };
    const top = rect('.ag-top');
    if (top) out.top = top.bottom;
    if (r.classList.contains('quiz')) {
      const q = rect('.ag-quiz');
      if (q) out.bottom = H - q.top;
      return out;
    }
    for (const b of [rect('.ag-list'), rect('.ag-card')]) {
      if (!b) continue;
      if (b.left + b.width / 2 < W / 2) out.left = Math.max(out.left, b.right); else out.right = Math.max(out.right, W - b.left);
    }
    const nav = rect('.ag-nav');
    if (nav) out.bottom = H - nav.top;
    return out;
  }

  // ---------------- quiz ----------------
  setQuiz(on: boolean) {
    const r = this.root;
    if (!r) return;
    r.classList.toggle('quiz', on);
    if (on) r.classList.remove('codex');
    r.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === (on ? 'quiz' : 'gallery')));
  }

  quizRound(i: number, n: number, score: number, choices: AircraftId[]) {
    const r = this.root;
    if (!r) return;
    r.querySelector('.ag-qround')!.textContent = tx('Round {i} / {n}', { i: i + 1, n });
    r.querySelector('.ag-qscore')!.textContent = tx('Score {n}', { n: score });
    const p = r.querySelector<HTMLElement>('.ag-qprompt')!;
    p.className = 'ag-qprompt';
    p.textContent = tx('Identify the aircraft');
    const box = r.querySelector('.ag-choices')!;
    box.innerHTML = choices.map((id, k) => `<button data-q="${id}"><kbd>${k + 1}</kbd>${esc(tx(this.specs.find((s) => s.id === id)!.nick))}</button>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => this.c?.answer(b.dataset.q as AircraftId)));
    r.querySelector('.ag-qrow')!.innerHTML = '';
    r.querySelector('.ag-qbest')!.textContent = '';
    box.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  quizAnswered(picked: AircraftId, answer: AircraftId, score: number, last: boolean) {
    const r = this.root;
    if (!r) return;
    const ok = picked === answer;
    const name = tx(this.specs.find((s) => s.id === answer)!.name);
    const p = r.querySelector<HTMLElement>('.ag-qprompt')!;
    p.className = `ag-qprompt ${ok ? 'ok' : 'bad'}`;
    p.textContent = ok ? tx('Correct: {name}', { name }) : tx('No: that was the {name}', { name });
    r.querySelector('.ag-qscore')!.textContent = tx('Score {n}', { n: score });
    r.querySelectorAll<HTMLButtonElement>('.ag-choices [data-q]').forEach((b) => {
      b.disabled = true;
      if (b.dataset.q === answer) b.classList.add('right');
      else if (b.dataset.q === picked) b.classList.add('wrong');
    });
    const row = r.querySelector('.ag-qrow')!;
    row.innerHTML = `<button data-next>${tx(last ? 'Results' : 'Next')}</button>`;
    const nb = row.querySelector<HTMLButtonElement>('[data-next]')!;
    nb.addEventListener('click', () => this.c?.nextRound());
    nb.focus({ preventScroll: true });
  }

  quizDone(score: number, n: number, best: number, newBest: boolean) {
    const r = this.root;
    if (!r) return;
    const p = r.querySelector<HTMLElement>('.ag-qprompt')!;
    p.className = 'ag-qprompt ok';
    p.textContent = tx('{n} of {total} identified', { n: score, total: n });
    r.querySelector('.ag-qround')!.textContent = tx('Recognition quiz');
    r.querySelector('.ag-choices')!.innerHTML = '';
    r.querySelector('.ag-qbest')!.textContent = newBest ? tx('New best score!') : tx('Best score: {n} / {total}', { n: best, total: n });
    const row = r.querySelector('.ag-qrow')!;
    row.innerHTML = `<button data-again>${tx('Again')}</button><button class="ghost" data-gal>${tx('Gallery')}</button>`;
    row.querySelector('[data-again]')!.addEventListener('click', () => this.c?.startQuiz());
    row.querySelector('[data-gal]')!.addEventListener('click', () => this.c?.stopQuiz());
    row.querySelector<HTMLButtonElement>('[data-again]')!.focus({ preventScroll: true });
  }
}

// ---------------- debrief ----------------

const NOTE_CSS = `#debrief .museum-note { margin: 10px 0 0; padding: 7px 10px; border: 1px solid rgba(232,163,23,.45); background: rgba(232,163,23,.08); font: 13px/1.4 "IBM Plex Mono", monospace; color: var(--ink, #e9e2cf); }
#debrief .museum-note b { color: #e8a317; letter-spacing: 1px; text-transform: uppercase; margin-inline-end: 6px; }
#debrief .museum-note small { display: block; opacity: .7; font-size: 11px; }
html[lang=ar] #debrief .museum-note { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; }
html[lang=ar] #debrief .museum-note b { letter-spacing: 0; }`;

/** Debrief: one line naming the aircraft whose museum files gained facts this mission. */
export function mountMuseumNote(host: HTMLElement | null, ids: AircraftId[], nick: (id: AircraftId) => string = (id) => id) {
  if (!host || !ids.length) return;
  if (!document.getElementById('museumNoteCss')) {
    const st = document.createElement('style');
    st.id = 'museumNoteCss';
    st.textContent = NOTE_CSS;
    document.head.appendChild(st);
  }
  host.querySelector('.museum-note')?.remove();
  const d = document.createElement('div');
  d.className = 'museum-note';
  d.innerHTML = `<b>${tx('Museum')}</b>${esc(tx('New facts: {list}', { list: ids.map((id) => tx(nick(id))).join(tx(', ')) }))}<small>${tx('Hangar → Aircraft & Armory → Museum')}</small>`;
  host.appendChild(d);
}
