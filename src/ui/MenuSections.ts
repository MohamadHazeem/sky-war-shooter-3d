import { tx } from '../i18n';

/** Move existing controls, retaining listeners and saved values, into small disclosures. */
export function groupSettings(box: HTMLElement) {
  const row = box.querySelector<HTMLElement>('[data-back]')!.closest<HTMLElement>('.row')!;
  const groups = new Map<string, HTMLDetailsElement>();
  const group = (label: string) => {
    let el = groups.get(label);
    if (!el) {
      el = document.createElement('details'); el.className = 'settings-group';
      const head = document.createElement('summary'); head.textContent = tx(label); el.appendChild(head);
      box.insertBefore(el, row); groups.set(label, el);
    }
    return el;
  };
  for (const control of Array.from(box.querySelectorAll<HTMLElement>(':scope > .setting'))) {
    if (control.querySelector('[data-lang], [data-k="difficulty"]')) continue;
    const key = control.querySelector<HTMLElement>('[data-k]')?.dataset.k ?? '';
    const label = ['volume', 'musicVolume', 'sfxVolume', 'ambVolume', 'music', 'audioDetail', 'breathing', 'radio'].includes(key)
      ? 'Sound' : ['quality', 'weatherEffects', 'fpsCounter', 'fov', 'killCam', 'bookends', 'crewRoom'].includes(key) || control.querySelector('[data-detect]') ? 'Graphics' : 'Controls';
    group(label).appendChild(control);
  }
  const access = box.querySelector<HTMLElement>('.a11y-panel');
  if (access) group('Controls').appendChild(access);
  // Extensions (cloud save/privacy/help) can mount into this fourth group afterwards.
  const extras = group('Profile & Help'); extras.dataset.settingsExtras = '1';
  row.classList.add('menu-back'); box.prepend(row);
}

/** Advanced battle controls stay available in three short setup groups. */
export function groupBattleSetup(grid: HTMLElement) {
  const fields = Array.from(grid.children);
  const groups = [
    { label: 'Aircraft & Crew', fields: fields.slice(0, 2) },
    { label: 'Enemy forces', fields: fields.slice(2, 7) },
    { label: 'Weather & Events', fields: fields.slice(7) },
  ];
  for (const g of groups) {
    const details = document.createElement('details'); details.className = 'settings-group wide';
    const summary = document.createElement('summary'); summary.textContent = tx(g.label); details.appendChild(summary);
    const body = document.createElement('div'); body.className = 'cb-grid'; body.append(...g.fields); details.appendChild(body);
    grid.appendChild(details);
  }
}

export function configureMenuLoadout(el: HTMLElement, section: 'armory' | 'customize' | undefined, title: string) {
  if (section) {
    el.classList.add('menu-loadout');
    const wrap = el.querySelector<HTMLElement>('.hwrap')!;
    wrap.querySelector('h2')!.textContent = tx(title);
    wrap.querySelector('.sk-hangar')?.remove();
    if (section === 'customize') {
      wrap.querySelectorAll(':scope > .hsec, :scope > .hgrid, :scope > .ugrid').forEach(e => e.remove());
      const hx = wrap.querySelector('.hx')!;
      while (hx.firstElementChild && !hx.firstElementChild.classList.contains('bcust')) {
        if (hx.firstElementChild.nextElementSibling?.classList.contains('bcust')) break;
        hx.firstElementChild.remove();
      }
    } else {
      const hx = wrap.querySelector('.hx')!;
      const costume = hx.querySelector('.bcust');
      if (costume) { let e: Element | null = costume.previousElementSibling; while (e) { const next: Element | null = e.nextElementSibling; e.remove(); e = next; } }
    }
    const row = wrap.querySelector<HTMLElement>('[data-go]')!.parentElement!;
    row.classList.add('menu-back'); wrap.prepend(row);
  } else el.classList.remove('menu-loadout');
}
