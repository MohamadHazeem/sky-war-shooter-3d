// Trophies: the full achievement cabinet. Unlocked trophies shine; locked ones are dark
// silhouettes with a progress bar when they track a lifetime counter. Rarity is a fixed tier.
import { achievements, ACHIEVEMENTS, RARITY_LABEL, type Rarity } from '../game/Achievements';
import type { CareerData } from '../game/Career';
import { esc, fmtDate, onBackKey, showLayer } from './serviceCommon';
import { num, tx } from '../i18n';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
type Filter = 'all' | 'got' | 'locked';

// Emblems struck on the cup's bowl (achievement `icon`): paths in a 16x16 box, drawn over the
// bowl in the same pale highlight as the default star. A '|s' suffix draws the path as a stroke.
const ICONS: Record<string, string> = {
  map: 'M1 3 L5 1 L11 3 L15 1 L15 13 L11 15 L5 13 L1 15 Z M5 1 L5 13 M11 3 L11 15|s',
  compass: 'M8 1 L10 8 L8 15 L6 8 Z M1 8 L8 6.5 L15 8 L8 9.5 Z',
  field: 'M1 12 L15 12 L15 14 L1 14 Z M3 9 L7 9 L7 10.5 L3 10.5 Z M9 9 L13 9 L13 10.5 L9 10.5 Z M8 1 L9.5 5 L14 5.5 L9.5 6.5 L8 8 L6.5 6.5 L2 5.5 L6.5 5 Z',
  moon: 'M10 1 C5 1.5 2.5 5 2.5 8.5 C2.5 12.5 6 15 9.5 15 C12 15 14 13.6 15 12 C9.5 13 5.5 8 10 1 Z',
  beam: 'M2 15 L4 15 L12 2 L9 1 Z M10 2 L14 1 L15 4 L12 5 Z',
  train: 'M1 5 L9 5 L9 3 L12 3 L12 5 L15 5 L15 11 L1 11 Z M1.5 13.5 A1.5 1.5 0 1 0 4.5 13.5 A1.5 1.5 0 1 0 1.5 13.5 Z M6.5 13.5 A1.5 1.5 0 1 0 9.5 13.5 A1.5 1.5 0 1 0 6.5 13.5 Z M11.5 13.5 A1.5 1.5 0 1 0 14.5 13.5 A1.5 1.5 0 1 0 11.5 13.5 Z',
  rails: 'M4 1 L5.5 1 L4 15 L2.5 15 Z M10.5 1 L12 1 L13.5 15 L12 15 Z M2 3 L14 3 L14 4.2 L2 4.2 Z M2 7 L14 7 L14 8.2 L2 8.2 Z M1.5 11 L14.5 11 L14.5 12.2 L1.5 12.2 Z',
  wing: 'M1 7 L15 7 L15 9 L1 9 Z M7 3 L9 3 L9 13 L7 13 Z M5.5 13 L10.5 13 L10.5 14.5 L5.5 14.5 Z M2 4 L4.5 4 L4.5 5.5 L2 5.5 Z',
  storm: 'M4 8 C1 8 1 4 4 4 C4.5 1.5 9 1 10 3.5 C13 2.5 15.5 5 14 7.5 C13.5 8 13 8 12 8 Z M8 8 L5.5 12 L8 12 L6.5 15.5 L11 10.5 L8.5 10.5 L10 8 Z',
  cross: 'M7 1 L9 1 L9 6.5 L15 6.5 L15 9.5 L9 9.5 L9 15 L7 15 L7 9.5 L1 9.5 L1 6.5 L7 6.5 Z',
  wheel: 'M1.5 8 A6.5 6.5 0 1 0 14.5 8 A6.5 6.5 0 1 0 1.5 8 Z M5 8 A3 3 0 1 1 11 8 A3 3 0 1 1 5 8 Z',
  shell: 'M6 15 L6 6 C6 3 7 1.5 8 1 C9 1.5 10 3 10 6 L10 15 Z',
  bomber: 'M7 1 L9 1 L9.5 6 L15 8 L15 9.5 L9.5 9 L9 13 L11 14.5 L5 14.5 L7 13 L6.5 9 L1 9.5 L1 8 L6.5 6 Z',
  arrow: 'M8 1 L13 7 L9.5 7 L9.5 15 L6.5 15 L6.5 7 L3 7 Z',
  tree: 'M7 9 L9 9 L9 15 L7 15 Z M8 1 L13.5 8 L10 8 L13 11.5 L3 11.5 L6 8 L2.5 8 Z',
  flag: 'M2 1 L3.5 1 L3.5 15 L2 15 Z M3.5 2 C7 0.5 9 4 14 2 L14 9 C9 11 7 7.5 3.5 9 Z',
  calendar: 'M1 3 L15 3 L15 15 L1 15 Z M3 6 L13 6 L13 13 L3 13 Z M4 1 L5.5 1 L5.5 4 L4 4 Z M10.5 1 L12 1 L12 4 L10.5 4 Z M7 8 L9.5 8 L9.5 10.5 L7 10.5 Z',
  film: 'M1 3 L15 3 L15 13 L1 13 Z M4 5.5 L12 5.5 L12 10.5 L4 10.5 Z M2 4 L3 4 L3 5 L2 5 Z M2 11 L3 11 L3 12 L2 12 Z M13 4 L14 4 L14 5 L13 5 Z M13 11 L14 11 L14 12 L13 12 Z',
  crew: 'M2.6 3.5 A2.4 2.4 0 1 0 7.4 3.5 A2.4 2.4 0 1 0 2.6 3.5 Z M8.6 3.5 A2.4 2.4 0 1 0 13.4 3.5 A2.4 2.4 0 1 0 8.6 3.5 Z M1 14 C1 9 2.5 8 5 8 C7.5 8 9 9 9 14 Z M7.5 14 C7.5 9 8.5 8 11 8 C13.5 8 15 9 15 14 Z',
  eye: 'M1 8 C4 3 12 3 15 8 C12 13 4 13 1 8 Z M5.5 8 A2.5 2.5 0 1 0 10.5 8 A2.5 2.5 0 1 0 5.5 8 Z',
  question: 'M5 5 C5 1 11 1 11 5 C11 7.5 8.8 7.6 8.8 10 L7.2 10 C7.2 6.8 9.4 6.8 9.4 5 C9.4 3 6.6 3 6.6 5 Z M7.1 12 L8.9 12 L8.9 14 L7.1 14 Z',
  look: 'M2 8 C3.5 4 6 3 8 3 C10 3 12.5 4 14 8 C12.5 12 10 13 8 13 C6 13 3.5 12 2 8 Z M6 8 A2 2 0 1 0 10 8 A2 2 0 1 0 6 8 Z M1 1 L4 1 L4 2 L2 2 L2 4 L1 4 Z M12 1 L15 1 L15 4 L14 4 L14 2 L12 2 Z M1 12 L2 12 L2 14 L4 14 L4 15 L1 15 Z M14 12 L15 12 L15 15 L12 15 L12 14 L14 14 Z',
};
export const TROPHY_ICONS = Object.keys(ICONS);
const STAR = '<path d="M24 10 L25.6 14.2 L30 14.4 L26.6 17 L27.8 21.2 L24 18.8 L20.2 21.2 L21.4 17 L18 14.4 L22.4 14.2 Z" fill="rgba(255,255,255,0.55)"/>';
function emblem(icon?: string) {
  const def = icon ? ICONS[icon] : undefined;
  if (!def) return STAR;
  const [d, mode] = def.split('|');
  // over the bowl: x 17.5-30.5, y 8-21
  return `<g transform="translate(17.5 8) scale(0.8125)">${mode === 's'
    ? `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.6" stroke-linejoin="round"/>`
    : `<path d="${d}" fill="rgba(255,255,255,0.55)" fill-rule="evenodd"/>`}</g>`;
}

function trophySvg(rarity: Rarity, got: boolean, icon?: string) {
  // cup on a plinth; locked = flat silhouette
  const fill = got ? `url(#tg-${rarity})` : 'rgba(20,20,16,0.85)';
  const stroke = got ? 'rgba(0,0,0,0.45)' : 'rgba(233,226,207,0.14)';
  return `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <path d="M14 6 H34 V16 C34 23 29 27 24 27 C19 27 14 23 14 16 Z" fill="${fill}" stroke="${stroke}"/>
    <path d="M14 9 H8 C8 16 11 19 15 19 M34 9 H40 C40 16 37 19 33 19" fill="none" stroke="${got ? 'currentColor' : stroke}" stroke-width="2.4"/>
    <rect x="21" y="27" width="6" height="7" fill="${fill}" stroke="${stroke}"/>
    <rect x="14" y="34" width="20" height="5" rx="1" fill="${fill}" stroke="${stroke}"/>
    <rect x="11" y="39" width="26" height="4" rx="1" fill="${fill}" stroke="${stroke}"/>
    ${got ? emblem(icon) : '<text x="24" y="21" text-anchor="middle" font-size="10" fill="rgba(233,226,207,0.25)" font-family="Oswald, sans-serif">?</text>'}
  </svg>`;
}

const GRADIENTS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  ${RARITIES.map((r) => {
    const [a, b] = { common: ['#d9d2bd', '#8f8770'], uncommon: ['#cfe6a0', '#6f8f3d'], rare: ['#a9d0f5', '#3c6fa8'], epic: ['#e2b9f5', '#8445a8'], legendary: ['#ffe08a', '#b07a1e'] }[r];
    return `<linearGradient id="tg-${r}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  }).join('')}
</defs></svg>`;

export function showTrophyScreen(c: CareerData, h: { back(): void; career(): void }) {
  const el = showLayer('svc-trophies');
  let filter: Filter = 'all';
  const render = () => {
    const total = ACHIEVEMENTS.length, got = achievements.count();
    const byR = RARITIES.map((r) => {
      const all = ACHIEVEMENTS.filter((a) => a.rarity === r);
      return `<span class="tro-chip r-${r}">${tx(RARITY_LABEL[r])} ${all.filter((a) => achievements.has(a.id)).length}/${all.length}</span>`;
    }).join('');
    const list = ACHIEVEMENTS.filter((a) => filter === 'all' || (filter === 'got') === achievements.has(a.id));
    const cards = list.map((a) => {
      const has = achievements.has(a.id);
      const p = achievements.progress(a, c);
      const cur = a.stat && a.goal ? Math.min(a.goal, Math.floor(a.stat(c))) : 0;
      const at = achievements.unlockedAt(a.id);
      const hidden = a.secret && !has;   // secret trophies keep their name and task to themselves
      return `<div class="tro-card r-${a.rarity} ${has ? 'got' : 'locked'}${hidden ? ' secret' : ''}">
        <div class="tro-ico">${trophySvg(a.rarity, has, a.icon)}</div>
        <div class="tro-body">
          <div class="tro-top"><b>${esc(tx(hidden ? 'Secret achievement' : a.name))}</b><span class="tro-rar">${tx(RARITY_LABEL[a.rarity])}</span></div>
          <div class="tro-desc">${esc(tx(hidden ? 'Keep flying: this one reveals itself when you earn it.' : a.desc))}</div>
          ${has ? `<div class="tro-when">${tx('Unlocked {date}', { date: at ? fmtDate(at) : '' })}</div>`
            : a.goal ? `<div class="tro-prog"><div class="tro-bar"><i style="width:${Math.round(p * 100)}%"></i></div><span>${num(cur)}/${num(a.goal)}</span></div>` : `<div class="tro-when">${tx('Locked')}</div>`}
        </div>
      </div>`;
    }).join('');
    el.innerHTML = `${GRADIENTS}<div class="screen-center"><div class="box panel tro-box">
      <div class="kicker">${tx('TROPHY ROOM · 401ST BOMB SQUADRON')}</div>
      <div class="tro-head"><h2 class="h2">${tx('Trophies')}</h2><div class="tro-total"><b>${got}</b>/${total} · ${Math.round((got / total) * 100)}%</div></div>
      <div class="tro-bar tro-bar-big"><i style="width:${(got / total) * 100}%"></i></div>
      <div class="tro-chips">${byR}</div>
      <div class="tro-filter" role="tablist">
        ${(['all', 'got', 'locked'] as Filter[]).map((f) => `<button role="tab" aria-selected="${f === filter}" class="${f === filter ? 'on' : ''}" data-f="${f}">${tx(f === 'all' ? 'All' : f === 'got' ? 'Unlocked' : 'Locked')}</button>`).join('')}
      </div>
      <div class="tro-grid">${cards || `<div class="tro-when">${tx('Nothing here yet.')}</div>`}</div>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>${tx('Back')}</button><button class="btn ghost" data-car>${tx('Career')}</button></div>
    </div></div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f as Filter; render(); }));
    el.querySelector('[data-back]')!.addEventListener('click', h.back);
    el.querySelector('[data-car]')!.addEventListener('click', h.career);
    onBackKey(el, h.back);
  };
  render();
}
