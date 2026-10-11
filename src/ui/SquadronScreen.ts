import { isAr, tx } from '../i18n';
import { MODES } from '../game/Modes';
import { CAMPAIGN } from '../game/Missions';
import { weeklyMode } from '../game/Weekly';
import { cachedSquadron, SQUADRON_ADJECTIVES, SQUADRON_NOUNS } from '../net/SquadronProfile';
import { createSquadron, joinSquadron, leaveSquadron, registerCallsign, squadronInfo, squadronProfile, squadronScores, SquadronError } from '../net/Squadrons';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { leaderboardTable } from './LeaderboardPanel';
import './squadron.css';

export function showSquadronScreen(back: () => void) {
  const el = showLayer('squadron');
  let revision = 0;
  let selectedMode = 'survival-gunner';
  const close = () => { revision++; el.classList.remove('show'); back(); };
  const shell = (body: string) => {
    el.innerHTML = `<div class="screen-center"><section class="box panel squadron-sheet"><div class="hud-label">${tx('PRIVATE FLIGHT ROSTER')}</div><h2>${tx('Squadron')}</h2>${body}<p class="sq-status" role="status" aria-live="polite"></p><div class="row"><button class="btn ghost" data-back>${tx('Back')}</button><button class="btn ghost" data-refresh>${tx('Refresh')}</button></div></section></div>`;
    el.querySelector('[data-back]')!.addEventListener('click', close);
    el.querySelector('[data-refresh]')!.addEventListener('click', () => void render());
    onBackKey(el, close);
  };
  const status = (message: string) => { el.querySelector('.sq-status')!.textContent = tx(message); };
  const act = async (action: () => Promise<unknown>) => {
    el.querySelectorAll<HTMLButtonElement>('button:not([data-back])').forEach(b => b.disabled = true);
    status('Sending…');
    const ticket = revision;
    try { await action(); if (ticket === revision && el.classList.contains('show')) await render(); }
    catch (e) {
      if (ticket !== revision) return;
      status(e instanceof SquadronError ? e.message : 'Squadron unavailable. Check your connection and try Refresh.');
      el.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false);
    }
  };
  const render = async () => {
    const ticket = ++revision;
    shell(`<p>${tx('Loading…')}</p>`);
    try {
      const profile = await squadronProfile();
      if (ticket !== revision || !el.classList.contains('show')) return;
      if (!profile) {
        shell(`<p>${tx('Choose your callsign once. It stays with your online identity.')}</p><form data-register><label>${tx('Callsign')}<input name="callsign" maxlength="16" minlength="2" required autocomplete="off" value="${esc(cachedSquadron()?.callsign ?? '')}"></label><button class="btn">${tx('Set callsign')}</button></form>`);
        el.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); void act(() => registerCallsign(el.querySelector<HTMLInputElement>('input')!.value.trim())); });
      } else if (!profile.code) {
        shell(`<p>${tx('Callsign')}: <b dir="auto">${esc(profile.callsign)}</b></p><p>${tx('Create a squadron or join friends with their six-character code.')}</p>
          <form data-create><h3>${tx('Create squadron')}</h3><p>${tx('Choose approved words for a safe squadron name.')}</p><div class="row"><select aria-label="${tx('Squadron adjective')}" name="adjective">${SQUADRON_ADJECTIVES.map(w => `<option value="${w}">${tx(w)}</option>`).join('')}</select><select aria-label="${tx('Squadron symbol')}" name="noun">${SQUADRON_NOUNS.map(w => `<option value="${w}">${tx(w)}</option>`).join('')}</select><button class="btn">${tx('Create squadron')}</button></div></form>
          <form data-join><h3>${tx('Join squadron')}</h3><label>${tx('Squadron code')}<input name="code" dir="ltr" maxlength="12" required autocomplete="off" placeholder="ABC234"></label><button class="btn">${tx('Join squadron')}</button></form>`);
        el.querySelector('[data-create]')!.addEventListener('submit', e => { e.preventDefault(); void act(() => createSquadron(`${el.querySelector<HTMLSelectElement>('[name=adjective]')!.value} ${el.querySelector<HTMLSelectElement>('[name=noun]')!.value}`)); });
        el.querySelector('[data-join]')!.addEventListener('submit', e => { e.preventDefault(); void act(() => joinSquadron(el.querySelector<HTMLInputElement>('[name=code]')!.value)); });
      } else {
        const info = await squadronInfo(profile.code);
        if (ticket !== revision || !el.classList.contains('show')) return;
        const modes = MODES.filter(m => m.id !== 'custom' && m.id !== 'weekly').flatMap(m => (m.roles ?? ['gunner', 'pilot'] as const).map(r => ({ id: m.board(r), label: `${tx(m.title)} · ${tx(r === 'gunner' ? 'B-17 Gunner' : 'P-51 Escort')}` }))).filter(m => m.id);
        modes.push(...CAMPAIGN.map(m => ({ id: `campaign-${m.id}`, label: tx(m.title) })));
        modes.push(...(['gunner', 'pilot'] as const).map(r => ({ id: weeklyMode(r), label: `${tx('Weekly rivalry')} · ${tx(r === 'gunner' ? 'B-17 Gunner' : 'P-51 Escort')}` })));
        shell(`<div class="sq-heading"><h3>${esc((isAr() ? info.squadron.name.split(' ').reverse() : info.squadron.name.split(' ')).map(word => tx(word)).join(' '))}</h3><div>${tx('Squadron code')}: <strong class="sq-code" dir="ltr">${profile.code}</strong></div><p>${tx('Share this code with friends. Your roster and activity are private; submitted scores also appear globally.')}</p></div>
          <h3>${tx('Members')} · ${info.members.length}/64</h3><div class="sq-members">${info.members.map(m => `<span dir="auto">${esc(m.callsign)}</span>`).join('')}</div>
          <h3>${tx('Personal bests by mode')}</h3><select data-mode aria-label="${tx('Leaderboard mode')}">${modes.map(m => `<option value="${esc(m.id)}" ${m.id === selectedMode ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select><div data-bests></div>
          <h3>${tx('Weekly rivalry')}</h3><p>${tx('This week’s best score per member. A new rivalry starts each Monday (UTC).')}</p><div class="sq-week"><section><h4>${tx('B-17 Gunner')}</h4><div data-week-gunner></div></section><section><h4>${tx('P-51 Escort')}</h4><div data-week-pilot></div></section></div>
          <h3>${tx('Latest activity')}</h3><ul class="sq-activity">${info.activity.map(a => `<li>${esc(tx(a.kind === 'experte' ? '{name} shot down an Experte.' : '{name} joined the squadron.', { name: a.name }))}</li>`).join('') || `<li>${tx('No activity yet.')}</li>`}</ul><button class="btn ghost" data-leave>${tx('Leave squadron')}</button>`);
        let boardRevision = 0;
        const loadBoard = async (selector: string, mode: string, version?: number) => {
          const host = el.querySelector<HTMLElement>(selector)!;
          host.textContent = tx('Loading…');
          try {
            const rows = await squadronScores(profile.code, mode);
            if (ticket === revision && (version === undefined || version === boardRevision)) host.innerHTML = leaderboardTable(rows);
          } catch { if (ticket === revision && (version === undefined || version === boardRevision)) host.textContent = tx('Could not load squadron scores. Try Refresh.'); }
        };
        el.querySelector('[data-mode]')!.addEventListener('change', e => { selectedMode = (e.target as HTMLSelectElement).value; void loadBoard('[data-bests]', selectedMode, ++boardRevision); });
        el.querySelector('[data-leave]')!.addEventListener('click', () => void act(leaveSquadron));
        await Promise.all([loadBoard('[data-bests]', selectedMode, ++boardRevision), loadBoard('[data-week-gunner]', weeklyMode('gunner')), loadBoard('[data-week-pilot]', weeklyMode('pilot'))]);
      }
    } catch { if (ticket === revision) { shell(''); status('Squadron unavailable. Check your connection and try Refresh.'); } }
  };
  void render();
}
