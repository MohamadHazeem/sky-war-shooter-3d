// Career screen: the player's service record as a WWII flight record form. Typewriter fields,
// rank ladder with stamped grades, lifetime stats, victories by type and the ribbon rack.
import { ENEMY_KINDS, MEDALS, PROMOTION_REWARDS, RANKS, type CareerData, lifetimeAccuracy, rankFor, rewardLabel, totalMedals } from '../game/Career';
import { achievements, ACHIEVEMENTS } from '../game/Achievements';
import { ENEMY_VARIANTS, type EnemyType } from '../world/EnemyTypes';
import { STATION_ORDER, STATIONS } from '../world/B17Layout';
import { savedName } from '../net/Leaderboard';
import { esc, fmtDate, fmtHours, insigniaSvg, onBackKey, showLayer } from './serviceCommon';
import { num, tx } from '../i18n';
import { showNemesisScreen } from './NemesisScreen';

export function showCareerScreen(c: CareerData, h: { back(): void; trophies(): void }) {
  const el = showLayer('svc-career');
  const r = rankFor(c.xp);
  const name = savedName() || tx('Unnamed airman');
  const acc = lifetimeAccuracy(c);
  const row = (k: string, v: string | number) => `<tr><td>${esc(tx(k))}</td><td>${typeof v === 'number' ? num(v) : esc(v)}</td></tr>`;
  const maxType = Math.max(1, ...ENEMY_KINDS.map((t) => c.killsByType[t] ?? 0));
  const ladder = RANKS.map((rk, i) => {
    const got = i <= r.index, cur = i === r.index;
    const reward = tx(rewardLabel(PROMOTION_REWARDS[i] ?? null));
    return `<li class="${got ? 'got' : ''} ${cur ? 'cur' : ''}">
      <div class="svc-lins">${insigniaSvg(i, 40)}</div>
      <div class="svc-lname">${esc(tx(rk.name))}</div>
      <div class="svc-lxp">${tx('{n} XP', { n: num(rk.xp) })}</div>
      ${reward ? `<div class="svc-lrew">${esc(reward)}</div>` : ''}
      ${got && i > 0 ? `<div class="svc-lstamp">${tx('APPROVED')}</div>` : ''}
    </li>`;
  }).join('');
  const types = ENEMY_KINDS.map((t) => {
    const n = c.killsByType[t] ?? 0;
    return `<tr><td>${esc(ENEMY_VARIANTS[t as EnemyType]?.label ?? t)}</td><td class="svc-tally"><i style="width:${Math.round((n / maxType) * 100)}%"></i></td><td>${n}</td></tr>`;
  }).join('');
  const guns = STATION_ORDER.map((s) => row(`${STATIONS[s].label}`, c.killsByStation[s] ?? 0)).join('');
  const rack = MEDALS.map((m) => {
    const n = c.medals[m.name] ?? 0;
    const first = m.first.kind === 'merit' ? tx('+{n} merit', { n: m.first.amount }) : tx(m.first.label);
    return `<div class="svc-medal ${n ? 'got' : ''}" title="${esc(tx(m.desc))}">
      <span class="svc-rib" style="background:${m.ribbon}"></span>
      <div class="svc-mt"><b>${esc(tx(m.name))}</b>${n ? `<span class="svc-mcount">×${n}</span>` : ''}</div>
      <div class="svc-md">${esc(tx(m.desc))}</div>
      <div class="svc-mr">${n ? tx('Repeat award: +{n} merit', { n: m.repeat }) : tx('First award: {reward}', { reward: esc(first) })}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="screen-center"><div class="svc-sheet svc-career">
    <div class="svc-stamp svc-stamp-tr">${tx('RESTRICTED')}</div>
    <div class="svc-hdr"><span>${tx('WAR DEPARTMENT · ARMY AIR FORCES')}</span><span>${tx('A.A.F. FORM 5 · INDIVIDUAL FLIGHT RECORD')}</span></div>
    <div class="svc-id">
      <div class="svc-ins svc-ins-big">${insigniaSvg(r.index, 76)}</div>
      <div class="svc-fields">
        <div><label>${tx('NAME')}</label><span class="svc-typed">${esc(name.toUpperCase())}</span></div>
        <div><label>${tx('SERIAL NO.')}</label><span class="svc-typed">${esc(c.serial)}</span></div>
        <div><label>${tx('GRADE')}</label><span class="svc-typed">${esc(tx(r.rank.name).toUpperCase())} (${esc(tx(r.rank.abbr))})</span></div>
        <div><label>${tx('ORGANIZATION')}</label><span class="svc-typed">${tx('401ST BOMB SQ · 8TH AIR FORCE')}</span></div>
        <div><label>${tx('ON STRENGTH SINCE')}</label><span class="svc-typed">${fmtDate(c.enlisted)}</span></div>
        <div><label>${tx('CAREER XP')}</label><span class="svc-typed">${num(c.xp)}</span></div>
      </div>
    </div>
    <div class="svc-sec">${tx('I. GRADE AND PROMOTION')}</div>
    <div class="svc-xpline">${r.next ? `${tx('{n} XP to <b>{rank}</b>', { n: num(r.next.xp - c.xp), rank: esc(tx(r.next.name)) })}${PROMOTION_REWARDS[r.index + 1] ? ` · ${tx('reward: {reward}', { reward: esc(tx(rewardLabel(PROMOTION_REWARDS[r.index + 1]))) })}` : ''}` : tx('Highest grade attained.')}</div>
    <div class="svc-bar svc-bar-paper"><i style="width:${Math.round(r.progress * 100)}%"></i></div>
    <ol class="svc-ladder">${ladder}</ol>
    <div class="svc-cols">
      <div>
        <div class="svc-sec">${tx('II. SERVICE')}</div>
        <table class="svc-tbl">
          ${row('Missions flown', c.missions)}
          ${row('Missions completed', c.wins)}
          ${row('Shot down / out of action', c.deaths)}
          ${row('Time in the air', fmtHours(c.seconds))}
          ${row('Rounds fired', c.shots)}
          ${row('Accuracy', c.shots ? `${(acc * 100).toFixed(1)}%` : '—')}
          ${row('Best kill streak', c.bestStreak)}
          ${row('Best bombing', `${c.bestBombing}%`)}
          ${row('Bosses downed', c.bosses)}
          ${row('Bombers brought home', c.bombersSaved)}
          ${row('Bombers lost', c.bombersLost)}
          ${row('Best survival round', c.bestSurvivalRound || '—')}
          ${row('Overdrive used', c.overdrives)}
          ${row('Daily orders carried out', c.dailyDone)}
          ${row('Daily Runs flown', c.dailyRuns)}
        </table>
      </div>
      <div>
        <div class="svc-sec">${tx('III. CONFIRMED VICTORIES · {n}', { n: num(c.kills) })}</div>
        <table class="svc-tbl svc-types">${types}</table>
        <table class="svc-tbl" style="margin-top:10px">
          ${row('As B-17 gunner', c.killsByRole.gunner)}
          ${row('As P-51 pilot', c.killsByRole.pilot)}
        </table>
        <div class="svc-sub">${tx('BY GUN POSITION')}</div>
        <table class="svc-tbl">${guns}</table>
      </div>
    </div>
    <div class="svc-sec">${tx('IV. DECORATIONS · {n} AWARDED', { n: totalMedals(c) })}</div>
    <div class="svc-rack">${rack}</div>
    <div class="svc-foot">
      <span>${tx('Achievements: {n}/{m}', { n: achievements.count(), m: ACHIEVEMENTS.length })}</span>
      <div class="svc-stamp svc-stamp-foot">${tx('CERTIFIED CORRECT')}</div>
    </div>
    <div class="row svc-actions"><button class="btn ghost" data-back>${tx('Back')}</button><button class="btn" data-tro>${tx('Trophies')}</button><button class="btn" data-nem>${tx('Luftwaffe Experten')}</button></div>
  </div></div>`;
  el.querySelector('[data-back]')!.addEventListener('click', h.back);
  el.querySelector('[data-tro]')!.addEventListener('click', h.trophies);
  el.querySelector('[data-nem]')!.addEventListener('click', () => showNemesisScreen({ back: () => showCareerScreen(c, h) }));
  onBackKey(el, h.back);
}
