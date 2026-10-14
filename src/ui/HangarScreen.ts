import { HANGAR_TABS, type HangarTab, type HangarRoute } from '../game/MenuModel';
import { t, tx } from '../i18n';
import { esc, onBackKey, showLayer } from './serviceCommon';
import './simpleMenu.css';

export function showHangarScreen(tab: HangarTab, pick: (route: HangarRoute) => void, back: () => void) {
  const root = showLayer('hangarHub');
  const selected = HANGAR_TABS.find(t => t.id === tab)!;
  root.innerHTML = `<div class="screen-center"><div class="box panel menu-sheet">
    <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
    <button class="btn ghost hangar-settings" data-route="settings">${t('common.settings')}</button>
    <div class="kicker">${tx('Between missions')}</div><h2>${tx('Hangar')}</h2>
    <div class="hangar-tabs" role="tablist" aria-label="${tx('Hangar')}">${HANGAR_TABS.map(t => `<button role="tab" id="hangar-tab-${t.id}" aria-controls="hangar-content" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}" data-tab="${t.id}">${tx(t.label)}</button>`).join('')}</div>
    <div class="hangar-entries" id="hangar-content" role="tabpanel" aria-labelledby="hangar-tab-${tab}">${selected.entries.map(([id, label, sub], i) => `<button class="menu-choice${i === 0 ? ' primary' : ''}" data-route="${id}"><span>${esc(tx(label))}</span><small>${esc(tx(sub))}</small></button>`).join('')}</div>
  </div></div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => {
    const open = (id: HangarTab) => { showHangarScreen(id, pick, back); root.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus(); };
    b.onclick = () => open(b.dataset.tab as HangarTab);
    b.onkeydown = e => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const rtl = document.documentElement.dir === 'rtl';
      const i = HANGAR_TABS.findIndex(t => t.id === tab);
      const delta = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      open(HANGAR_TABS[e.key === 'Home' ? 0 : e.key === 'End' ? 3 : (i + delta + 4) % 4].id);
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(b => b.onclick = () => pick(b.dataset.route as HangarRoute));
  root.querySelector<HTMLElement>('[data-back]')!.onclick = back;
  onBackKey(root, back);
}
