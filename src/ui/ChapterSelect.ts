import { DEEP_PENETRATION, chapterCanFly, chapterCompleted, chapterUnlocked } from '../game/DeepPenetration';
import type { Mission } from '../game/Missions';
import type { CampaignData } from '../game/CampaignState';
import { tx } from '../i18n';

interface Progress { medals: Record<string, string[]> }
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Attached to both the map and summary, including an already-running second tour. */
export function mountChapterAccess(root: HTMLElement, progress: Progress, tour: CampaignData,
  onPick: (m: Mission) => void, onBack: () => void) {
  const foot = root.querySelector('.cm-foot');
  if (!foot) return;
  const button = document.createElement('button');
  button.className = 'btn'; button.dataset.chapter = '';
  button.textContent = tx('Deep Penetration');
  button.disabled = !chapterUnlocked(progress, tour);
  if (button.disabled) {
    const note = document.createElement('p'); note.className = 'cm-note';
    note.textContent = tx('Complete the first tour to unlock this chapter.');
    foot.after(note);
  }
  button.addEventListener('click', () => showChapter(root, progress, tour, onPick, onBack));
  foot.appendChild(button);
}

function showChapter(root: HTMLElement, progress: Progress, tour: CampaignData,
  onPick: (m: Mission) => void, onBack: () => void) {
  const done = chapterCompleted(progress);
  root.innerHTML = `<div class="cm"><div class="cm-head"><div>
    <div class="kicker">${tx('Historical chapter · 5 B-17 missions')}</div><h2>${tx('Deep Penetration')}</h2>
    <p class="cm-note">${tx('A historical retrospective, separate from your current tour.')}</p></div>
    <div class="cm-date">${tx('{done}/{total} operations', { done, total: 5 })}${done === 5 ? `<b>${tx('Chapter complete')}</b>` : ''}</div></div>
    <div class="cm-raids">${DEEP_PENETRATION.map(m => `<button class="cm-op-card ${m.number === done + 1 ? 'sel' : ''}" data-dp="${m.id}" ${chapterCanFly(m.id, progress, tour) ? '' : 'disabled'}>
      <div class="num">${tx('MISSION')} ${m.number} ${progress.medals[m.id]?.includes('Air Medal') ? '✓' : ''}</div>
      <h3 class="t">${esc(tx(m.title))}</h3><div class="tg">${esc(tx(m.target))}</div>
      <p>${esc(tx(m.date))}</p></button>`).join('')}</div>
    <div class="cm-foot"><button class="btn ghost" data-back>${tx('Campaign map')}</button></div></div>`;
  root.querySelector('[data-back]')!.addEventListener('click', onBack);
  root.querySelectorAll<HTMLButtonElement>('[data-dp]').forEach(button => button.addEventListener('click', () => {
    const m = DEEP_PENETRATION.find(m => m.id === button.dataset.dp);
    if (m && chapterCanFly(m.id, progress, tour)) onPick(m);
  }));
}
