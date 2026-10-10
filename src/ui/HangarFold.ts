// Hangar on a phone: every section (aircraft, weapon, upgrades, crew, weapon mod, bomber
// paint / nose art, skills) folds under its heading, so the panel is a short list of
// headings instead of a ~4000 px scroll. The most used sections (aircraft, weapon, upgrades)
// start open; a heading tap (or the gamepad's A on it) opens / closes its section and the
// choice is kept for the session (the hangar re-renders on every purchase).
// Desktop is untouched: nothing is wrapped unless the touch / small-screen layout is on.
// UI.hangar() calls foldHangar() after the panel and its extras have been mounted.

type FoldKey = 'aircraft' | 'weapon' | 'upgrades' | 'crew' | 'mod' | 'cosmetics' | 'skills';

const OPEN_BY_DEFAULT: Record<FoldKey, boolean> = {
  aircraft: true, weapon: true, upgrades: true, crew: false, mod: false, cosmetics: false, skills: false,
};
const chosen = new Map<FoldKey, boolean>();   // the player's own open / closed choice this session

/** Touch, or a phone-height screen (landscape phones are <= 520 px tall): the replay theatre's compact test. */
export function hangarFolds(): boolean {
  return document.body.classList.contains('touch') || innerHeight <= 520;
}

const isOpen = (k: FoldKey) => chosen.get(k) ?? OPEN_BY_DEFAULT[k];

function mark(el: Element | null, key: FoldKey) {
  if (!el) return;
  el.classList.add('hfold');
  (el as HTMLElement).dataset.fold = key;
  const open = isOpen(key);
  el.classList.toggle('closed', !open);
  const head = el.firstElementChild;
  if (head?.classList.contains('hsec')) {
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', String(open));
  }
}

// a section that is its own block (crew roster, skill tree, the extras box, the launch row)
const STOP = ['row', 'hx', 'crewroster', 'sk-hangar', 'hint-hangar', 'hcoll'];
const stops = (el: Element) => el.tagName === 'DETAILS' || STOP.some((c) => el.classList.contains(c));

// wraps each .hsec heading and the blocks after it (up to the next heading) in a fold
function group(container: Element | null, keys: FoldKey[]) {
  if (!container) return;
  const kids = Array.from(container.children);
  let k = 0;
  for (let i = 0; i < kids.length && k < keys.length;) {
    const el = kids[i];
    if (!el.classList.contains('hsec')) { i++; continue; }
    const fold = document.createElement('div');
    container.insertBefore(fold, el);
    fold.appendChild(el);
    i++;
    while (i < kids.length && !kids[i].classList.contains('hsec') && !stops(kids[i])) fold.appendChild(kids[i++]);
    mark(fold, keys[k++]);
  }
}

function onClick(e: Event) {
  const head = (e.target as Element | null)?.closest?.('.hfold > .hsec');
  const fold = head?.parentElement;
  if (!head || !fold || fold.firstElementChild !== head || !fold.closest('#hangar.hfolding')) return;
  const key = fold.dataset.fold as FoldKey;
  const open = fold.classList.contains('closed');
  fold.classList.toggle('closed', !open);
  head.setAttribute('aria-expanded', String(open));
  chosen.set(key, open);
}

export function foldHangar(host: HTMLElement) {
  const on = hangarFolds();
  host.classList.toggle('hfolding', on);
  const wrap = host.querySelector('.hwrap');
  if (!on || !wrap) return;
  group(wrap, ['aircraft', 'weapon', 'upgrades']);
  group(wrap.querySelector(':scope > .hx'), wrap.querySelector('.bcust') ? ['mod', 'cosmetics'] : ['mod']);
  // the crew roster and the skill tree redraw their own insides: the fold is the block itself
  mark(wrap.querySelector(':scope > .crewroster'), 'crew');
  mark(wrap.querySelector(':scope > .sk-hangar'), 'skills');
  if (!host.dataset.foldWired) {
    host.dataset.foldWired = '1';
    host.addEventListener('click', onClick);
  }
}
