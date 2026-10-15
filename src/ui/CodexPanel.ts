// Codex panel (DOM) of the museum (ui/GalleryScreen.ts, Codex tab): three shelves (crew roles,
// medals, operations), the entries of the chosen shelf on one side and the open entry on a
// paper card on the other. Data and unlock rules: game/Codex.ts. Locked operations show their
// title only. Phones: a narrower list and a smaller card. Arabic: the columns swap sides (the
// grid follows the page direction).
import { tx, num } from '../i18n';
import { CODEX_SHELVES, entryOpen, type CodexCtx, type CodexEntry, type CodexShelf } from '../game/Codex';

export const CODEX_CSS = `
#acGallery .ag-codex { left: 50%; transform: translateX(-50%); top: 72px; bottom: 16px; width: min(980px, calc(100% - 32px)); display: none; flex-direction: column; padding: 10px; gap: 10px; background: rgba(16,15,11,.88); }
#acGallery.codex .ag-codex { display: flex; }
#acGallery.codex .ag-list, #acGallery.codex .ag-card, #acGallery.codex .ag-nav, #acGallery.codex .ag-hint { display: none; }
#acGallery .cx-shelves { display: flex; gap: 6px; flex-wrap: wrap; }
#acGallery .cx-shelves button { background: rgba(255,255,255,.04); border: 1px solid rgba(233,226,207,.22); padding: 6px 14px; min-height: 40px; letter-spacing: 1.5px; text-transform: uppercase; font-size: 15px; }
#acGallery .cx-shelves button.on { background: var(--khaki, #b9a76f); color: #1b1a12; border-color: var(--khaki, #b9a76f); }
#acGallery .cx-shelves button:focus-visible, #acGallery .cx-list button:focus-visible { outline: 2px solid var(--khaki, #b9a76f); outline-offset: -2px; }
#acGallery .cx-shelves small { font: 11px "IBM Plex Mono", monospace; opacity: .7; margin-inline-start: 6px; letter-spacing: 0; }
#acGallery .cx-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 270px 1fr; gap: 10px; }
#acGallery .cx-list { overflow: auto; display: flex; flex-direction: column; gap: 2px; }
#acGallery .cx-list button { display: flex; align-items: center; gap: 9px; text-align: start; background: none; border: 1px solid transparent; padding: 6px 8px; min-height: 44px; }
#acGallery .cx-list button:hover { border-color: rgba(233,226,207,.25); }
#acGallery .cx-list button.on { background: rgba(185,167,111,.18); border-color: var(--khaki, #b9a76f); }
#acGallery .cx-list button.locked, #acGallery .cx-list button.unheld .cx-rib { opacity: .55; }
#acGallery .cx-list button span { display: flex; flex-direction: column; min-width: 0; flex: 1; }
#acGallery .cx-list button b { font-weight: 500; font-size: 15px; letter-spacing: .5px; line-height: 1.15; }
#acGallery .cx-list button small { font: 10.5px/1.3 "IBM Plex Mono", monospace; color: var(--ink-dim, #b9b19b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#acGallery .cx-list .cx-rib { width: 26px; height: 9px; flex: none; border: 1px solid rgba(0,0,0,.5); }
#acGallery .cx-list em { font: normal 12px "IBM Plex Mono", monospace; color: var(--khaki, #b9a76f); }
#acGallery .cx-card { overflow: auto; padding: 16px 20px; background: linear-gradient(178deg, rgba(236,227,201,.97), rgba(222,211,180,.97)); color: #2b2518; border: 1px solid rgba(0,0,0,.4); }
#acGallery .cx-card .ag-k { color: #8c1d15; }
#acGallery .cx-card h3 { margin: 4px 0 10px; font-size: 26px; line-height: 1.1; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
#acGallery .cx-card .cx-big { height: 16px; width: 120px; margin: 2px 0 10px; border: 1px solid rgba(0,0,0,.45); box-shadow: 0 1px 2px rgba(0,0,0,.3); }
#acGallery .cx-card p { margin: 0 0 12px; font: 15px/1.55 "Special Elite", monospace; max-width: 62ch; }
#acGallery .cx-game { padding: 8px 10px; border-inline-start: 3px solid #3d5a1f; background: rgba(61,90,31,.08); font: 14px/1.45 "Special Elite", monospace; max-width: 62ch; }
#acGallery .cx-game b { display: block; font: 700 10px/1.4 "IBM Plex Mono", monospace; letter-spacing: 2px; color: #3d5a1f; text-transform: uppercase; }
#acGallery .cx-own { margin-top: 12px; font: 13px/1.3 "IBM Plex Mono", monospace; }
#acGallery .cx-own b { font: 700 20px/1 Oswald, sans-serif; color: #8c1d15; margin-inline-start: 4px; }
#acGallery .cx-lock { font: 14px/1.5 "Special Elite", monospace; color: #6b5a3a; padding: 18px 0; }
@media (max-height: 520px), (max-width: 760px) {
  #acGallery .ag-codex { top: 58px; bottom: 8px; width: calc(100% - 16px); padding: 6px; gap: 6px; }
  #acGallery .cx-shelves button { font-size: 12px; padding: 4px 10px; }
  #acGallery .cx-main { grid-template-columns: 190px 1fr; gap: 6px; }
  #acGallery .cx-list button { min-height: 40px; padding: 4px 6px; }
  #acGallery .cx-list button b { font-size: 13px; }
  #acGallery .cx-list button small { display: none; }
  #acGallery .cx-card { padding: 10px 12px; }
  #acGallery .cx-card h3 { font-size: 18px; margin-bottom: 6px; }
  #acGallery .cx-card p { font-size: 12.5px; line-height: 1.45; margin-bottom: 8px; }
  #acGallery .cx-game { font-size: 12px; }
}
html[lang=ar] #acGallery .cx-shelves button, html[lang=ar] #acGallery .cx-card h3 { letter-spacing: 0; }
html[lang=ar] #acGallery .cx-card p, html[lang=ar] #acGallery .cx-game, html[lang=ar] #acGallery .cx-lock { font-family: "Special Elite", "Noto Naskh Arabic", serif; line-height: 1.75; }
html[lang=ar] #acGallery .cx-list small, html[lang=ar] #acGallery .cx-own, html[lang=ar] #acGallery .cx-game b, html[lang=ar] #acGallery .cx-shelves small { font-family: "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 0; }
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class CodexPanel {
  private shelf: CodexShelf = 'crew';
  private current: Record<CodexShelf, string> = { crew: '', medals: '', ops: '' };

  constructor(private root: HTMLElement, private entries: CodexEntry[], private ctx: CodexCtx) {}

  /** Draw the shelf row, the list and the open entry. */
  render(focus = false) {
    const r = this.root;
    const count = (s: CodexShelf) => {
      const all = this.entries.filter((e) => e.shelf === s);
      if (s === 'crew') return `${all.length}`;
      // medals: how many kinds you hold; operations: how many files are open
      const n = s === 'medals' ? all.filter((e) => this.ctx.medals(e.title) > 0).length : all.filter((e) => entryOpen(e, this.ctx)).length;
      return `${n} / ${all.length}`;
    };
    const items = this.entries.filter((e) => e.shelf === this.shelf);
    if (!items.some((e) => e.id === this.current[this.shelf])) this.current[this.shelf] = (items.find((e) => entryOpen(e, this.ctx)) ?? items[0])?.id ?? '';
    r.innerHTML = `
      <div class="cx-shelves" role="tablist">${CODEX_SHELVES.map((s) => `<button role="tab" data-shelf="${s.id}" class="${s.id === this.shelf ? 'on' : ''}" aria-selected="${s.id === this.shelf}">${tx(s.label)}<small>${count(s.id)}</small></button>`).join('')}</div>
      <div class="cx-main">
        <div class="cx-list" role="listbox">${items.map((e) => this.item(e)).join('')}</div>
        <div class="cx-card" aria-live="polite"></div>
      </div>`;
    r.querySelectorAll<HTMLButtonElement>('[data-shelf]').forEach((b) => b.addEventListener('click', () => { this.shelf = b.dataset.shelf as CodexShelf; this.render(true); }));
    r.querySelectorAll<HTMLButtonElement>('[data-entry]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.entry!)));
    this.open(this.current[this.shelf]);
    if (focus) r.querySelector<HTMLButtonElement>('[data-shelf].on')?.focus({ preventScroll: true });
  }

  private item(e: CodexEntry) {
    const open = entryOpen(e, this.ctx);
    const held = e.shelf === 'medals' ? this.ctx.medals(e.title) : 0;
    const rib = e.ribbon ? `<i class="cx-rib" style="background:${e.ribbon}"></i>` : '';
    const sub = open ? tx(e.sub) : tx('Fly it to open the file');
    return `<button role="option" data-entry="${esc(e.id)}" class="${open ? '' : 'locked'}${e.shelf === 'medals' && !held ? ' unheld' : ''}">${rib}<span><b>${esc(tx(e.title))}</b><small>${esc(sub)}</small></span>${held ? `<em>×${num(held)}</em>` : ''}</button>`;
  }

  open(id: string) {
    const e = this.entries.find((x) => x.id === id);
    const card = this.root.querySelector('.cx-card');
    if (!e || !card) return;
    this.current[e.shelf] = id;
    this.root.querySelectorAll<HTMLElement>('[data-entry]').forEach((b) => { const on = b.dataset.entry === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    if (!entryOpen(e, this.ctx)) {
      card.innerHTML = `<div class="ag-k">${esc(tx(e.sub))}</div><h3>${esc(tx(e.title))}</h3><div class="cx-lock">${tx('Classified. Fly this operation to open its file.')}</div>`;
      return;
    }
    let extra = '';
    if (e.shelf === 'medals') {
      const n = this.ctx.medals(e.title);
      extra = `<div class="cx-game"><b>${tx('How to earn it')}</b>${esc(tx(e.game))}</div>
        <div class="cx-own">${n ? `${tx('Awarded to you:')}<b>${num(n)}</b>` : tx('Not yet awarded')}</div>`;
    } else if (e.shelf === 'ops') {
      extra = `<div class="cx-game"><b>${tx('Date of the raid')}</b>${esc(tx(e.game))}</div>`;
    } else {
      extra = `<div class="cx-game"><b>${tx('In the game')}</b>${esc(tx(e.game))}</div>`;
    }
    card.innerHTML = `
      <div class="ag-k">${esc(tx(e.sub))}</div>
      <h3>${esc(tx(e.title))}</h3>
      ${e.ribbon ? `<div class="cx-big" style="background:${e.ribbon}"></div>` : ''}
      <p>${esc(tx(e.body))}</p>
      ${extra}`;
  }

  /** Dev / tests */
  get state() { return { shelf: this.shelf, current: this.current[this.shelf] }; }
  setShelf(s: CodexShelf) { this.shelf = s; this.render(); }
}
