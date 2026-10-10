import { Progression, WEAPONS } from '../game/Upgrades';
import { modDef, RARITY_LABEL, Rarity, RARITIES, WEAPON_MODS } from '../game/WeaponMods';
import { CRATE_NAME, CrateResult, LootItem, takePendingCrate } from '../game/Loot';
import {
  bomberName, cleanName, COLLECTABLES, COSMETIC_COST, KIND_LABEL, NAME_MAX, NAME_PRESETS, owns, refreshPlayerBomber, Collectable,
} from '../game/Customize';
import { NOSE_ARTS, noseArtThumb } from '../render/NoseArt';
import { PAINTS } from '../render/Paint';
import { sound } from '../audio/Sound';
import { crateBurst, crateReveal, crateShake } from '../audio/CrateSound';
import './crate.css';

// Hangar extras (weapon mod slot, bomber customisation, collection) and the loot crate
// that opens over the hangar at the end of a round. UI.hangar() calls mountHangarExtras()
// after each render; the crate rolled by Game.endRound (Loot.queueCrate) is shown then.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const click = () => sound.play('click', null, { gain: 0.6 });

let collectionOpen = false;
let scrollY = 0, keepScroll = false;   // a click in these sections re-renders the hangar: keep its scroll

export function mountHangarExtras(root: HTMLElement, prog: Progression, role: 'gunner' | 'pilot', rerender: () => void) {
  const wrap = root.querySelector<HTMLElement>('.hwrap');
  if (!wrap) return;
  const anchor = wrap.querySelector<HTMLElement>(':scope > .row:last-of-type');
  const box = document.createElement('div');
  box.className = 'hx';
  box.innerHTML = modSection(prog, role) + (role === 'gunner' ? bomberSection(prog) : '') + collectionSection(prog);
  wrap.insertBefore(box, anchor);
  if (keepScroll) wrap.scrollTop = scrollY; else scrollY = 0;
  keepScroll = false;
  wrap.addEventListener('scroll', () => { scrollY = wrap.scrollTop; }, { passive: true });
  wire(box, prog, role, () => { keepScroll = true; rerender(); });
  const crate = takePendingCrate();
  if (crate) showCrate(crate);
}

// ---------- sections ----------
function modSection(prog: Progression, role: 'gunner' | 'pilot') {
  const w = WEAPONS.find((x) => x.id === prog.weapon[role])!;
  const fitted = prog.mods[w.id];
  const owned = WEAPON_MODS.filter((m) => prog.unlocked.has('mod:' + m.id));
  const card = (id: string, name: string, desc: string, rarity: Rarity | null) =>
    `<button class="hcard xcard ${rarity ? 'r-' + rarity : ''} ${(fitted ?? '') === id ? 'sel' : ''}" data-mod="${id}">
      <div class="t">${esc(name)}</div><div class="d">${esc(desc)}</div>
      <div class="s">${(fitted ?? '') === id ? 'FITTED' : 'FIT'}${rarity ? ` · <i>${RARITY_LABEL[rarity]}</i>` : ''}</div></button>`;
  return `<div class="hsec">WEAPON MOD · ${esc(w.name.toUpperCase())}</div>
    ${owned.length ? `<div class="hgrid">${card('', 'No mod', 'Standard issue', null)}${owned.map((m) => card(m.id, m.name, m.desc, m.rarity)).join('')}</div>`
      : '<div class="hnote">No weapon mods yet: they come out of the loot crate at the end of every round.</div>'}`;
}

function tile(c: Collectable, prog: Progression, selected: boolean, inner: string) {
  const own = owns(prog, c.key), cost = COSMETIC_COST[c.rarity], off = !own && prog.points < cost;
  return `<button class="ctile r-${c.rarity} ${selected ? 'sel' : ''} ${own ? '' : 'locked'}" data-cos="${esc(c.key)}" ${off ? 'disabled' : ''} title="${esc(c.name)} · ${RARITY_LABEL[c.rarity]}">
    ${inner}<div class="cn">${esc(c.name)}</div>
    <div class="cs">${selected ? 'SELECTED' : own ? 'SELECT' : `UNLOCK · ${cost}`}</div></button>`;
}

function bomberSection(prog: Progression) {
  const name = bomberName(), b = prog.bomber;
  const paint = PAINTS.find((p) => p.id === b.paint && owns(prog, 'paint:' + p.id)) ?? PAINTS[0];
  const nose = owns(prog, 'nose:' + b.nose) ? b.nose : 'script';
  const col = (key: string) => COLLECTABLES.find((c) => c.key === key)!;
  return `<div class="hsec">YOUR B-17</div>
    <div class="bcust">
      <div class="bc-prev" style="background:${paint.swatch}"><img alt="" src="${nose === 'none' ? '' : noseArtThumb(nose, name)}" ${nose === 'none' ? 'hidden' : ''}/></div>
      <div class="bc-ctl">
        <label class="bc-lab">NAME<input id="bcName" type="text" maxlength="${NAME_MAX}" spellcheck="false" autocomplete="off" value="${esc(name)}"/></label>
        <div class="chips">${NAME_PRESETS.map((n) => {
          const c = col('name:' + n.name), own = owns(prog, c.key), cost = COSMETIC_COST[n.rarity];
          return `<button class="chip r-${n.rarity} ${name === n.name ? 'sel' : ''} ${own ? '' : 'locked'}" data-cos="${esc(c.key)}" ${!own && prog.points < cost ? 'disabled' : ''}>${esc(n.name)}${own ? '' : ` · ${cost}`}</button>`;
        }).join('')}</div>
        <div class="hnote">The name is painted on the nose and used on the radio.</div>
      </div>
    </div>
    <div class="hsub">NOSE ART</div>
    <div class="cgrid">${tile({ key: 'nose:none', kind: 'nose', id: 'none', name: 'Bare nose', desc: '', rarity: 'common', free: true }, prog, nose === 'none', '<div class="cimg bare"></div>')}
      ${NOSE_ARTS.filter((n) => n.id !== 'none').map((n) => tile(col('nose:' + n.id), prog, nose === n.id, `<img class="cimg" alt="" src="${noseArtThumb(n.id, name)}"/>`)).join('')}</div>
    <div class="hsub">PAINT</div>
    <div class="cgrid">${PAINTS.map((p) => tile(col('paint:' + p.id), prog, paint.id === p.id, `<div class="cimg" style="background:${p.swatch}"></div>`)).join('')}</div>`;
}

function collectionSection(prog: Progression) {
  const total = COLLECTABLES.length, have = COLLECTABLES.filter((c) => owns(prog, c.key)).length;
  const groups: Collectable['kind'][] = ['mod', 'nose', 'paint', 'name'];
  return `<details class="hcoll" ${collectionOpen ? 'open' : ''}><summary class="hsec">COLLECTION · ${have}/${total} FOUND</summary>
    ${groups.map((k) => `<div class="hsub">${KIND_LABEL[k].toUpperCase()}S</div><div class="colgrid">${COLLECTABLES.filter((c) => c.kind === k)
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))
      .map((c) => { const own = owns(prog, c.key); return `<div class="citem r-${c.rarity} ${own ? '' : 'locked'}"><b>${esc(own ? c.name : '???')}</b><span>${RARITY_LABEL[c.rarity]}${own && c.kind === 'mod' ? ' · ' + esc(c.desc) : ''}</span></div>`; }).join('')}</div>`).join('')}
  </details>`;
}

function wire(box: HTMLElement, prog: Progression, role: 'gunner' | 'pilot', rerender: () => void) {
  box.querySelectorAll<HTMLButtonElement>('[data-mod]').forEach((b) => b.addEventListener('click', () => {
    const w = prog.weapon[role], id = b.dataset.mod!;
    if (id && modDef(id)) prog.mods[w] = id; else delete prog.mods[w];
    prog.save(); click(); rerender();
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-cos]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.cos!, c = COLLECTABLES.find((x) => x.key === key);
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (c && !owns(prog, key) && !prog.unlock(key, COSMETIC_COST[c.rarity])) return;
    if (kind === 'nose') prog.bomber.nose = id;
    else if (kind === 'paint') prog.bomber.paint = id;
    else if (kind === 'name') prog.bomber.name = id;
    prog.save(); click(); refreshPlayerBomber(); rerender();
    const hud = document.querySelector('#hBR .hud-label');
    if (hud && kind === 'name') hud.textContent = bomberName();
  }));
  const input = box.querySelector<HTMLInputElement>('#bcName');
  if (input) {
    const prev = box.querySelector<HTMLImageElement>('.bc-prev img');
    input.addEventListener('input', () => {
      const n = cleanName(input.value) || 'Sky Queen';
      if (prev && !prev.hidden) prev.src = noseArtThumb(prog.bomber.nose, n);
    });
    input.addEventListener('change', () => {
      prog.bomber.name = cleanName(input.value) || 'Sky Queen';
      prog.save(); refreshPlayerBomber(); rerender();
      const hud = document.querySelector('#hBR .hud-label');   // between rounds: the HUD is already built
      if (hud) hud.textContent = bomberName();
    });
  }
  box.querySelector<HTMLDetailsElement>('.hcoll')?.addEventListener('toggle', (e) => { collectionOpen = (e.currentTarget as HTMLDetailsElement).open; });
}

// ---------- the crate ----------
interface CrateState { el: HTMLElement; timers: number[]; revealed: boolean; result: CrateResult; obs: MutationObserver }
let crate: CrateState | null = null;

function itemIcon(it: LootItem) {
  switch (it.kind) {
    case 'points': return `<div class="ci-pts">★<b>${it.points}</b></div>`;
    case 'nose': return `<img class="ci-img" alt="" src="${noseArtThumb(it.id!, bomberName())}"/>`;
    case 'paint': return `<div class="ci-swatch" style="background:${PAINTS.find((p) => p.id === it.id)?.swatch ?? '#555'}"></div>`;
    case 'name': return `<div class="ci-name">${esc(it.id ?? '')}</div>`;
    case 'mod': return `<svg class="ci-svg" viewBox="0 0 120 60"><rect x="8" y="20" width="62" height="20" rx="3" fill="#b88a3a" stroke="#1b1a12" stroke-width="3"/><rect x="66" y="22" width="10" height="16" fill="#8d6a2c" stroke="#1b1a12" stroke-width="3"/><path d="M76 22 L104 25 Q114 30 104 35 L76 38 Z" fill="#c8c2b0" stroke="#1b1a12" stroke-width="3"/><rect x="14" y="24" width="50" height="4" fill="rgba(255,255,255,0.35)"/></svg>`;
    case 'perk': return `<svg class="ci-svg" viewBox="0 0 120 70"><path d="M20 30 L60 8 L100 30 L100 44 L60 22 L20 44 Z M20 52 L60 30 L100 52 L100 66 L60 44 L20 66 Z" fill="currentColor" stroke="#1b1a12" stroke-width="3"/></svg>`;
  }
}

function showCrate(r: CrateResult) {
  closeCrate();
  const el = document.createElement('div');
  el.id = 'crate';
  el.className = `r-${r.item.rarity} g-${r.grade}`;
  const sparks = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * 360 + Math.random() * 10, d = 140 + Math.random() * 190;
    return `<i style="--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}"></i>`;
  }).join('');
  el.innerHTML = `
    <div class="cr-head"><div class="kicker">ROUND ${r.round} CLEARED</div><div class="cr-grade g-${r.grade}">${esc(CRATE_NAME[r.grade])}</div></div>
    <div class="cr-stage">
      <div class="cr-rays"></div>
      <div class="cr-box g-${r.grade}"><div class="cr-lid"></div><div class="cr-body"><span>U.S. ARMY</span><small>FIELD SUPPLY · 401ST BS</small></div><div class="cr-glow"></div></div>
      <div class="cr-flash"></div>
      <div class="cr-sparks">${sparks}</div>
      <div class="cr-card">
        <div class="cr-rar">${RARITY_LABEL[r.item.rarity].toUpperCase()} · ${esc(r.item.label.toUpperCase())}</div>
        <div class="cr-icon">${itemIcon(r.item)}</div>
        <div class="cr-t">${esc(r.item.title)}</div>
        <div class="cr-d">${esc(r.item.desc)}</div>
      </div>
    </div>
    <div class="cr-hint">Click or press Space to continue</div>`;
  document.body.appendChild(el);
  const st: CrateState = { el, timers: [], revealed: false, result: r, obs: new MutationObserver(() => { if (!document.querySelector('#hangar.show')) closeCrate(); }) };
  crate = st;
  st.obs.observe(document.getElementById('hangar')!, { attributes: true, attributeFilter: ['class'] });
  el.addEventListener('click', advance);
  const at = (ms: number, f: () => void) => st.timers.push(window.setTimeout(() => { if (crate === st) f(); }, ms));
  el.classList.add('in');
  at(350, () => { el.classList.add('shake'); crateShake(sound, 1.1); });
  at(1500, () => { el.classList.add('burst'); crateBurst(sound); });
  at(1750, reveal);
}

function reveal() {
  const st = crate;
  if (!st || st.revealed) return;
  st.revealed = true;
  st.el.classList.add('in', 'shake', 'burst', 'reveal');
  crateReveal(sound, st.result.item.rarity);
  st.timers.push(window.setTimeout(() => { if (crate === st) closeCrate(); }, 4200));
}

function advance() { if (!crate) return; if (crate.revealed) closeCrate(); else reveal(); }

function closeCrate() {
  const st = crate;
  if (!st) return;
  crate = null;
  st.timers.forEach(clearTimeout);
  st.obs.disconnect();
  st.el.classList.add('out');
  window.setTimeout(() => st.el.remove(), 320);
}

// Keyboard: keys typed into the bomber-name field stay there (the hangar launches on
// Space/Enter and the game reads keys globally); with a crate open, Space/Enter/Esc skip
// or close it instead of launching. Registered at load, so it runs before the hangar's own
// capture listener.
addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && t.id === 'bcName') {
    e.stopImmediatePropagation();
    if (e.key === 'Enter') t.blur();
    return;
  }
  if (crate && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape')) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) advance();
  }
}, true);
