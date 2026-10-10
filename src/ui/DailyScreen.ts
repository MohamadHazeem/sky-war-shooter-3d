// Daily Orders screen: today's three challenges (the same for everyone, cut at 00:00 UTC),
// the Daily Run launch buttons and today's top-10 boards for both roles.
import type { CareerData } from '../game/Career';
import { type DailyTracker, dailySeed, msUntilReset } from '../game/Dailies';
import { dailyMode } from '../net/Leaderboard';
import { mountLeaderboard } from './LeaderboardPanel';
import { esc, fmtCountdown, onBackKey, showLayer } from './serviceCommon';
import { num, tx } from '../i18n';

export interface DailyScreenOpts {
  tracker: DailyTracker;
  career: CareerData;
  fly(role: 'gunner' | 'pilot'): void;
  back(): void;
}

export function showDailyScreen(o: DailyScreenOpts) {
  const el = showLayer('svc-daily');
  const t = o.tracker, key = t.day;
  const pretty = `${key.slice(6, 8)}.${key.slice(4, 6)}.${key.slice(0, 4)}`;
  const orders = t.list().map((d, i) => {
    const v = Math.min(d.goal, t.value(d.kind)), done = t.isDone(d);
    return `<li class="svc-order ${done ? 'done' : ''}">
      <div class="svc-onum">${i + 1}</div>
      <div class="svc-obody">
        <div class="svc-otext">${esc(tx(d.text))}</div>
        <div class="svc-oprog"><div class="svc-bar svc-bar-paper"><i style="width:${Math.round((v / d.goal) * 100)}%"></i></div><span>${v}/${d.goal}</span></div>
      </div>
      <div class="svc-orew">+${d.merit}<small>${tx('merit')}</small><small>${tx('+{n} XP', { n: d.xp })}</small></div>
      ${done ? `<div class="svc-stamp svc-stamp-done">${tx('CARRIED OUT')}</div>` : ''}
    </li>`;
  }).join('');
  const best = (role: 'gunner' | 'pilot') => o.career.dailyBest[dailyMode(role)] ?? 0;
  el.innerHTML = `<div class="screen-center"><div class="svc-sheet svc-daily">
    <div class="svc-stamp svc-stamp-tr">${tx('PRIORITY')}</div>
    <div class="svc-hdr"><span>${tx('HQ VIII BOMBER COMMAND · TELETYPE')}</span><span>${tx('ORDERS OF THE DAY · {date}', { date: pretty })}</span></div>
    <h2 class="svc-title">${tx('Daily Orders')}</h2>
    <div class="svc-note">${tx('The same three orders for every crew. New orders in <b data-reset>{time}</b> (00:00 UTC).', { time: fmtCountdown(msUntilReset()) })}</div>
    <ol class="svc-orders-big">${orders}</ol>
    <div class="svc-sec">${tx('DAILY RUN · SEED {seed}', { seed: dailySeed(key, 'gunner').toString(16).toUpperCase().slice(0, 6) })}</div>
    <p class="svc-note">${tx('A Survival sortie with today\'s fixed weather and enemy schedule, identical for everyone. Fly it as often as you like; post your best to today\'s board.')}</p>
    <div class="row svc-runs">
      <button class="btn" data-fly="gunner">${tx('Fly as B-17 gunner')}</button>
      <button class="btn" data-fly="pilot">${tx('Fly as P-51 escort')}</button>
      <span class="svc-best">${tx('Your best today: gunner <b>{g}</b> · escort <b>{p}</b>', { g: num(best('gunner')), p: num(best('pilot')) })}</span>
    </div>
    <div class="svc-boards" data-boards></div>
    <div class="row svc-actions"><button class="btn ghost" data-back>${tx('Back')}</button></div>
  </div></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-fly]').forEach((b) => b.addEventListener('click', () => o.fly(b.dataset.fly as 'gunner' | 'pilot')));
  el.querySelector('[data-back]')!.addEventListener('click', o.back);
  const boards = el.querySelector<HTMLElement>('[data-boards]')!;
  mountLeaderboard(boards, dailyMode('gunner'), 'TODAY · B-17 GUNNER · TOP 10');
  mountLeaderboard(boards, dailyMode('pilot'), 'TODAY · P-51 ESCORT · TOP 10');
  // countdown ticks while the screen is open
  const tick = setInterval(() => {
    const r = el.querySelector('[data-reset]');
    if (!r || !el.classList.contains('show')) { clearInterval(tick); return; }
    r.textContent = fmtCountdown(msUntilReset());
  }, 30000);
  onBackKey(el, o.back);
}
