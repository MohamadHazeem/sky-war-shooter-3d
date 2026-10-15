import { onBackKey, showLayer, esc } from './serviceCommon';
import { STATIONS } from '../world/B17Layout';
import {
  LESSONS, lessonStatus, lessonMetrics, nextLesson, pct, skipLesson, loadLessonProgress, saveLessonProgress,
  type LessonId, type LessonProgress, type LessonStatus,
} from '../game/StationLessons';
import { tx } from '../i18n';

// Hangar → Training: the Gunnery School and the four station lessons, one row each, in the
// order they unlock. A row shows its state, the accuracy before → after of the last finished
// flight, and Start / Skip. Simple Phase 8 sheet (menu-sheet + menu-choice styles).

export interface TrainingRow {
  id: 'school' | LessonId;
  title: string;                 // English, translated when drawn
  station: string;
  summary: string;
  status: LessonStatus;
  result: [string, string] | null; // accuracy before / after of the last finished flight
  next: boolean;                 // the one to fly next
  canSkip: boolean;
}

export function trainingRows(p: LessonProgress, schoolDone: boolean): TrainingRow[] {
  const nxt = nextLesson(p);
  const rows: TrainingRow[] = [{
    id: 'school', title: 'Gunnery School', station: 'Left Waist', summary: 'A calm two-minute course: aim, fire, lead, seats and radar',
    status: schoolDone ? 'done' : 'new', result: null, next: !schoolDone, canSkip: false,
  }];
  for (const l of LESSONS) {
    const status = lessonStatus(p, l.id);
    const e = p.lessons[l.id];
    rows.push({
      id: l.id, title: l.title, station: STATIONS[l.station].label, summary: l.summary, status,
      result: status === 'done' && (e?.before !== undefined || e?.after !== undefined) ? [pct(e?.before), pct(e?.after)] : null,
      next: schoolDone && nxt === l.id, canSkip: status === 'new',
    });
  }
  return rows;
}

const STATUS: Record<LessonStatus, string> = { locked: 'Locked', new: 'New', skipped: 'Skipped', done: 'Done' };

export interface TrainingActions {
  school(): void;
  lesson(id: LessonId): void;
  back(): void;
}

export function showTrainingScreen(schoolDone: boolean, a: TrainingActions) {
  const root = showLayer('trainingMenu');
  const draw = () => {
    const p = loadLessonProgress();
    const rows = trainingRows(p, schoolDone);
    const m = lessonMetrics(p);
    const gain = m.avgGain === undefined ? '' : ` · ${tx('Average accuracy change: {n} points', { n: (m.avgGain > 0 ? '+' : '') + m.avgGain })}`;
    root.innerHTML = `<div class="screen-center"><div class="box panel menu-sheet training-sheet">
      <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
      <h2>${tx('Training')}</h2>
      <p>${tx('Short lessons for each gun position. Each one unlocks the next; skip any you already know.')}</p>
      <p class="tr-meta">${tx('Lessons complete: {n} / {m}', { n: m.completed, m: m.total })}${gain}</p>
      <div class="tr-list">${rows.map((r) => `
        <div class="menu-choice tr-row${r.next ? ' primary' : ''}${r.status === 'locked' ? ' locked' : ''}" data-row="${r.id}">
          <div class="tr-head"><span>${esc(tx(r.title))}</span><em class="tr-status ${r.status}">${tx(STATUS[r.status])}</em></div>
          <small>${esc(tx(r.station))} · ${esc(tx(r.summary))}</small>
          ${r.result ? `<small class="tr-acc">${tx('Accuracy {a} → {b}', { a: r.result[0], b: r.result[1] })}</small>` : ''}
          <div class="tr-actions">
            ${r.status === 'locked' ? `<small>${tx('Finish or skip the lesson above to unlock')}</small>` : `<button class="btn${r.next ? '' : ' ghost'}" data-start="${r.id}">${tx(r.status === 'done' ? 'Fly again' : 'Start')}</button>`}
            ${r.canSkip ? `<button class="btn ghost" data-skip="${r.id}">${tx('Skip')}</button>` : ''}
          </div>
        </div>`).join('')}
      </div></div></div>`;
    root.querySelector<HTMLElement>('[data-back]')!.onclick = a.back;
    root.querySelectorAll<HTMLElement>('[data-start]').forEach((b) => {
      b.onclick = () => { const id = b.dataset.start!; if (id === 'school') a.school(); else a.lesson(id as LessonId); };
    });
    root.querySelectorAll<HTMLElement>('[data-skip]').forEach((b) => {
      b.onclick = () => { const p2 = loadLessonProgress(); if (skipLesson(p2, b.dataset.skip as LessonId)) saveLessonProgress(p2); draw(); };
    });
    root.querySelector<HTMLElement>('.tr-row.primary [data-start]')?.focus();
  };
  draw();
  onBackKey(root, a.back);
  return root;
}
