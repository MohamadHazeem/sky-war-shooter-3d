import { BoardRow, cleanName, saveName, savedName, ScoreEntry, submitScore, topScores } from '../net/Leaderboard';
import { cachedSquadron } from '../net/SquadronProfile';
import { squadronProfile, squadronScores } from '../net/Squadrons';
import { tx } from '../i18n';
import './squadron.css';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function leaderboardTable(rows: BoardRow[]) {
  if (!rows.length) return `<div class="lb-empty">${tx('No scores yet — be the first.')}</div>`;
  return `<table class="leader lb"><tbody>${rows.map((r, i) => `<tr class="${r.mine ? 'me' : ''}"><td>${i + 1}</td><td dir="auto">${esc(r.name)}</td><td>${tx('{n} kills', { n: r.kills })}</td><td style="text-align:end">${r.score}</td></tr>`).join('')}</tbody></table>`;
}

// All callers (mode menus, campaign and weekly debriefs) get both scopes automatically.
export function mountLeaderboard(host: HTMLElement, mode: string, title: string, entry?: ScoreEntry) {
  if (!mode) return;
  const box = document.createElement('div');
  box.className = 'lb-panel';
  host.appendChild(box);
  let scope: 'global' | 'squadron' = 'global', revision = 0, sending = false;
  let name = cachedSquadron()?.callsign ?? savedName();
  const render = () => {
    box.innerHTML = `<div class="hud-label">${esc(tx(title))}</div><div class="lb-tabs">${(['global', 'squadron'] as const).map(s => `<button class="btn ghost" data-scope="${s}" aria-pressed="${s === scope}">${tx(s === 'global' ? 'Global' : 'Squadron')}</button>`).join('')}<button class="btn ghost" data-refresh>${tx('Refresh')}</button></div>
      ${entry && entry.score > 0 ? `<form class="lb-submit"><input aria-label="${tx('Your name')}" maxlength="20" placeholder="${tx('Your name')}" value="${esc(name)}" ${cachedSquadron() ? 'readonly' : ''}/><button class="btn" data-lb ${sending ? 'disabled' : ''}>${tx('Submit score')}</button></form>` : ''}<span class="lb-status" role="status"></span><div data-rows>${tx('Loading…')}</div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope as typeof scope; render(); void load(); }));
    box.querySelector('[data-refresh]')!.addEventListener('click', () => { render(); void load(); });
    box.querySelector('input')?.addEventListener('input', e => { name = (e.target as HTMLInputElement).value; });
    box.querySelector('form')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (sending || !entry) return;
      sending = true;
      name = cleanName(name); saveName(name);
      render(); void load();
      box.querySelector('.lb-status')!.textContent = tx('Sending…');
      const ok = await submitScore({ ...entry, name });
      sending = false;
      if (ok) entry = undefined;
      render();
      if (!ok) box.querySelector('.lb-status')!.textContent = tx('Could not submit (offline, or wait 20 s between scores)');
      void load();
    });
  };
  const load = async () => {
    const ticket = ++revision;
    const rowsHost = box.querySelector('[data-rows]')!;
    try {
      let rows: BoardRow[];
      if (scope === 'squadron') {
        const p = await squadronProfile();
        if (ticket !== revision) return;
        if (!p?.code) { rowsHost.textContent = tx('Create or join a squadron from the title menu.'); return; }
        rows = await squadronScores(p.code, mode);
      } else rows = await topScores(mode);
      if (ticket === revision) rowsHost.innerHTML = leaderboardTable(rows);
    } catch { if (ticket === revision) rowsHost.textContent = tx('Could not load squadron scores. Try Refresh.'); }
  };
  render(); void load();
}
