// Trophies: the full achievement cabinet. Unlocked trophies shine; locked ones are dark
// silhouettes with a progress bar when they track a lifetime counter. Rarity is a fixed tier.
import { achievements, ACHIEVEMENTS, RARITY_LABEL, type Rarity } from '../game/Achievements';
import type { CareerData } from '../game/Career';
import { esc, onBackKey, showLayer } from './serviceCommon';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
type Filter = 'all' | 'got' | 'locked';

function trophySvg(rarity: Rarity, got: boolean) {
  // cup on a plinth; locked = flat silhouette
  const fill = got ? `url(#tg-${rarity})` : 'rgba(20,20,16,0.85)';
  const stroke = got ? 'rgba(0,0,0,0.45)' : 'rgba(233,226,207,0.14)';
  return `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <path d="M14 6 H34 V16 C34 23 29 27 24 27 C19 27 14 23 14 16 Z" fill="${fill}" stroke="${stroke}"/>
    <path d="M14 9 H8 C8 16 11 19 15 19 M34 9 H40 C40 16 37 19 33 19" fill="none" stroke="${got ? 'currentColor' : stroke}" stroke-width="2.4"/>
    <rect x="21" y="27" width="6" height="7" fill="${fill}" stroke="${stroke}"/>
    <rect x="14" y="34" width="20" height="5" rx="1" fill="${fill}" stroke="${stroke}"/>
    <rect x="11" y="39" width="26" height="4" rx="1" fill="${fill}" stroke="${stroke}"/>
    ${got ? '<path d="M24 10 L25.6 14.2 L30 14.4 L26.6 17 L27.8 21.2 L24 18.8 L20.2 21.2 L21.4 17 L18 14.4 L22.4 14.2 Z" fill="rgba(255,255,255,0.55)"/>' : '<text x="24" y="21" text-anchor="middle" font-size="10" fill="rgba(233,226,207,0.25)" font-family="Oswald, sans-serif">?</text>'}
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
      return `<span class="tro-chip r-${r}">${RARITY_LABEL[r]} ${all.filter((a) => achievements.has(a.id)).length}/${all.length}</span>`;
    }).join('');
    const list = ACHIEVEMENTS.filter((a) => filter === 'all' || (filter === 'got') === achievements.has(a.id));
    const cards = list.map((a) => {
      const has = achievements.has(a.id);
      const p = achievements.progress(a, c);
      const cur = a.stat && a.goal ? Math.min(a.goal, Math.floor(a.stat(c))) : 0;
      const at = achievements.unlockedAt(a.id);
      return `<div class="tro-card r-${a.rarity} ${has ? 'got' : 'locked'}">
        <div class="tro-ico">${trophySvg(a.rarity, has)}</div>
        <div class="tro-body">
          <div class="tro-top"><b>${esc(a.name)}</b><span class="tro-rar">${RARITY_LABEL[a.rarity]}</span></div>
          <div class="tro-desc">${esc(a.desc)}</div>
          ${has ? `<div class="tro-when">Unlocked ${at ? new Date(at).toLocaleDateString() : ''}</div>`
            : a.goal ? `<div class="tro-prog"><div class="tro-bar"><i style="width:${Math.round(p * 100)}%"></i></div><span>${cur.toLocaleString()}/${a.goal.toLocaleString()}</span></div>` : '<div class="tro-when">Locked</div>'}
        </div>
      </div>`;
    }).join('');
    el.innerHTML = `${GRADIENTS}<div class="screen-center"><div class="box panel tro-box">
      <div class="kicker">TROPHY ROOM · 401ST BOMB SQUADRON</div>
      <div class="tro-head"><h2 class="h2">Trophies</h2><div class="tro-total"><b>${got}</b>/${total} · ${Math.round((got / total) * 100)}%</div></div>
      <div class="tro-bar tro-bar-big"><i style="width:${(got / total) * 100}%"></i></div>
      <div class="tro-chips">${byR}</div>
      <div class="tro-filter" role="tablist">
        ${(['all', 'got', 'locked'] as Filter[]).map((f) => `<button role="tab" aria-selected="${f === filter}" class="${f === filter ? 'on' : ''}" data-f="${f}">${f === 'all' ? 'All' : f === 'got' ? 'Unlocked' : 'Locked'}</button>`).join('')}
      </div>
      <div class="tro-grid">${cards || '<div class="tro-when">Nothing here yet.</div>'}</div>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>Back</button><button class="btn ghost" data-car>Career</button></div>
    </div></div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f as Filter; render(); }));
    el.querySelector('[data-back]')!.addEventListener('click', h.back);
    el.querySelector('[data-car]')!.addEventListener('click', h.career);
  };
  render();
  onBackKey(el, h.back);
}
