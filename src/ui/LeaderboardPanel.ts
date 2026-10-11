import { BoardRow, cleanName, saveName, savedName, ScoreEntry, submitScore, topScores } from '../net/Leaderboard';
import { tx } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function table(rows: BoardRow[], highlight?: number) {
  if (!rows.length) return `<div class="lb-empty">${tx('No scores yet — be the first.')}</div>`;
  return `<table class="leader lb">${rows.map((r, i) => `<tr class="${r.mine && r.score === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${tx('{n} kills', { n: r.kills })}</td><td style="text-align:right">${r.score}</td></tr>`).join('')}</table>`;
}

// Online leaderboard block appended to a screen (debrief or survival menu). With an entry it
// offers to submit it under the player's name; it always shows the current top 10.
// An empty mode is a mission that never posts (custom battles): nothing is shown.
export function mountLeaderboard(host: HTMLElement, mode: string, title: string, entry?: ScoreEntry) {
  if (!mode) return;
  const box = document.createElement('div');
  box.className = 'lb-panel';
  host.appendChild(box);
  let sending = false;
  const crew = mode === 'coop-gunner';
  const render = (rows: BoardRow[] | null, status = '', highlight?: number) => {
    box.innerHTML = `<div class="hud-label">${esc(tx(title))}</div>
      ${entry && entry.score > 0 ? `<div class="lb-submit">${crew ? `<span>${esc(entry.name)}</span>` : `<input maxlength="20" placeholder="${tx('Your name')}" value="${esc(savedName())}"/>`}<button class="btn" data-lb ${sending ? 'disabled' : ''}>${tx('Submit score')}</button><span class="lb-status">${esc(tx(status))}</span></div>` : ''}
      ${rows === null ? `<div class="lb-empty">${tx('Loading…')}</div>` : table(rows, highlight)}`;
    const btn = box.querySelector<HTMLButtonElement>('[data-lb]');
    btn?.addEventListener('click', async () => {
      if (sending || !entry) return;
      sending = true;
      const name = crew ? entry.name : cleanName(box.querySelector('input')!.value);
      if (!crew) saveName(name);
      btn.disabled = true;
      render(rows, 'Sending…');
      const ok = await submitScore({ ...entry!, name });
      sending = false;
      if (ok) { entry = undefined; render(await topScores(mode), '', undefined); }
      else render(rows, 'Could not submit (offline, or wait 20 s between scores)');
    });
  };
  render(null);
  topScores(mode).then((rows) => render(rows));
}
