import { BoardRow, cleanName, saveName, savedName, ScoreEntry, submitScoreDetailed, topScores } from '../net/Leaderboard';
import { fmtCountdown, loadSeasons, msUntilSeasonEnd, nextTier, recordSortie, seasonalBoard, seasonKey, seasonNumber, shiftSeason, FIRST_SEASON, TIERS, type SeasonRecord, type Tier } from '../game/Seasons';
import { Progression } from '../game/Upgrades';
import { cachedSquadron } from '../net/SquadronProfile';
import { squadronProfile, squadronScores } from '../net/Squadrons';
import { tx } from '../i18n';
import './squadron.css';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function leaderboardTable(rows: BoardRow[]) {
  if (!rows.length) return `<div class="lb-empty">${tx('No scores yet — be the first.')}</div>`;
  return `<table class="leader lb"><tbody>${rows.map((r, i) => `<tr class="${r.mine ? 'me' : ''}"><td>${i + 1}</td><td dir="auto">${esc(r.name)}</td><td>${tx('{n} kills', { n: r.kills })}</td><td style="text-align:end">${r.score}</td></tr>`).join('')}</tbody></table>`;
}

const tierLabel = (t: Tier | null) => tx(t ? TIERS.find(d => d.id === t)!.label : 'No tier yet');

// Season header: which season is shown, the countdown or "final standings", and the player's tier
export function seasonInfo(season: number, rec: SeasonRecord, archive: SeasonRecord[], now = new Date()) {
  const live = season === seasonKey(now);
  const next = nextTier(rec.sorties);
  const head = `<div class="lb-season"><button class="btn ghost" data-season="-1" aria-label="${tx('Previous season')}" ${season <= FIRST_SEASON ? 'disabled' : ''}>‹</button>
    <b>${tx('Season {n}', { n: seasonNumber(season) })}</b> <span>${live ? `${tx('ends in')} ${tx(fmtCountdown(msUntilSeasonEnd(now)))}` : tx('final standings')}</span>
    <button class="btn ghost" data-season="1" aria-label="${tx('Next season')}" ${live ? 'disabled' : ''}>›</button></div>`;
  if (!live) return head;
  const own = `<div class="lb-tier">${tx('Your season: {tier} · {n} scores posted', { tier: tierLabel(rec.tier), n: rec.sorties })} · ${next ? tx('{n} more for {tier}', { n: next.sorties - rec.sorties, tier: tx(next.label) }) : tx('Top tier reached')}</div>`;
  const past = `<details class="lb-archive"><summary>${tx('Your past seasons')}</summary>${archive.length ? `<ul>${archive.map(r => `<li>${tx('Season {n}', { n: seasonNumber(r.key) })} · ${tierLabel(r.tier)} · ${tx('{n} scores posted', { n: r.sorties })} · ${tx('best {n}', { n: r.best })}</li>`).join('')}</ul>` : tx('No past seasons yet.')}<p>${tx('Season boards reset on the 1st of each month (UTC). Post 3, 10 and 25 scores in a season for season-only nose art.')}</p></details>`;
  return head + own + past;
}

// All callers (mode menus, campaign and weekly debriefs) get every scope automatically.
export function mountLeaderboard(host: HTMLElement, mode: string, title: string, entry?: ScoreEntry) {
  if (!mode) return;
  const box = document.createElement('div');
  box.className = 'lb-panel';
  host.appendChild(box);
  const seasonal = seasonalBoard(mode);
  let scope: 'season' | 'global' | 'squadron' = seasonal ? 'season' : 'global', revision = 0, sending = false, season = seasonKey(), note = '';
  let name = cachedSquadron()?.callsign ?? savedName();
  const crew = mode === 'coop-gunner' || mode === 'coop-pilot';          // co-op crew entries carry all callsigns, fixed
  if (crew && entry) name = entry.name;
  const render = () => {
    box.innerHTML = `<div class="hud-label">${esc(tx(title))}</div><div class="lb-tabs">${(seasonal ? ['season', 'global', 'squadron'] as const : ['global', 'squadron'] as const).map(s => `<button class="btn ghost" data-scope="${s}" aria-pressed="${s === scope}">${tx(s === 'season' ? 'Season' : s === 'global' ? (seasonal ? 'All time' : 'Global') : 'Squadron')}</button>`).join('')}<button class="btn ghost" data-refresh>${tx('Refresh')}</button></div>
      ${entry && entry.score > 0 ? `<form class="lb-submit"><input aria-label="${tx('Your name')}" maxlength="${mode === 'coop-gunner' ? 89 : crew ? 43 : 20}" placeholder="${tx('Your name')}" value="${esc(name)}" ${cachedSquadron() || crew ? 'readonly' : ''}/><button class="btn" data-lb ${sending ? 'disabled' : ''}>${tx('Submit score')}</button></form>` : ''}<span class="lb-status" role="status">${esc(note)}</span>${scope === 'season' ? (() => { const st = loadSeasons(); return seasonInfo(season, st.current, st.archive); })() : ''}<div data-rows>${tx('Loading…')}</div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope as typeof scope; render(); void load(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(b => b.addEventListener('click', () => {
      season = Math.min(seasonKey(), Math.max(FIRST_SEASON, shiftSeason(season, Number(b.dataset.season)))); render(); void load();
    }));
    box.querySelector('[data-refresh]')!.addEventListener('click', () => { render(); void load(); });
    box.querySelector('input')?.addEventListener('input', e => { name = (e.target as HTMLInputElement).value; });
    box.querySelector('form')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (sending || !entry) return;
      sending = true;
      if (!crew) { name = cleanName(name); saveName(name); }
      render(); void load();
      box.querySelector('.lb-status')!.textContent = tx('Sending…');
      const sent = await submitScoreDetailed({ ...entry, name }), ok = sent.ok;
      sending = false;
      note = '';
      if (ok) {
        // season rewards: a posted score is a sortie; a new tier unlocks its nose art
        const r = recordSortie(entry.score, sent.shadow, Progression.current);
        if (r.reached) note = r.nose ? tx('{tier} tier reached: {nose} nose art unlocked', { tier: tierLabel(r.reached), nose: tx(r.nose) }) : tx('{tier} tier reached', { tier: tierLabel(r.reached) });
        entry = undefined;
      }
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
      } else rows = await topScores(mode, 10, scope === 'season' ? season : undefined);
      if (ticket === revision) rowsHost.innerHTML = leaderboardTable(rows);
    } catch { if (ticket === revision) rowsHost.textContent = tx('Could not load squadron scores. Try Refresh.'); }
  };
  render(); void load();
}
