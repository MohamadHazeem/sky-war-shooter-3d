// Career screen: the player's service record as a WWII flight record form. Typewriter fields,
// rank ladder with stamped grades, lifetime stats, victories by type and the ribbon rack.
import { ENEMY_KINDS, MEDALS, PROMOTION_REWARDS, RANKS, type CareerData, lifetimeAccuracy, rankFor, rewardLabel, totalMedals } from '../game/Career';
import { achievements, ACHIEVEMENTS } from '../game/Achievements';
import { ENEMY_VARIANTS, type EnemyType } from '../world/EnemyTypes';
import { STATION_ORDER, STATIONS } from '../world/B17Layout';
import { savedName } from '../net/Leaderboard';
import { esc, fmtHours, insigniaSvg, onBackKey, showLayer } from './serviceCommon';

export function showCareerScreen(c: CareerData, h: { back(): void; trophies(): void }) {
  const el = showLayer('svc-career');
  const r = rankFor(c.xp);
  const name = savedName() || 'Unnamed airman';
  const acc = lifetimeAccuracy(c);
  const row = (k: string, v: string | number) => `<tr><td>${esc(k)}</td><td>${typeof v === 'number' ? v.toLocaleString() : esc(v)}</td></tr>`;
  const maxType = Math.max(1, ...ENEMY_KINDS.map((t) => c.killsByType[t] ?? 0));
  const ladder = RANKS.map((rk, i) => {
    const got = i <= r.index, cur = i === r.index;
    const reward = rewardLabel(PROMOTION_REWARDS[i] ?? null);
    return `<li class="${got ? 'got' : ''} ${cur ? 'cur' : ''}">
      <div class="svc-lins">${insigniaSvg(i, 40)}</div>
      <div class="svc-lname">${esc(rk.name)}</div>
      <div class="svc-lxp">${rk.xp.toLocaleString()} XP</div>
      ${reward ? `<div class="svc-lrew">${esc(reward)}</div>` : ''}
      ${got && i > 0 ? '<div class="svc-lstamp">APPROVED</div>' : ''}
    </li>`;
  }).join('');
  const types = ENEMY_KINDS.map((t) => {
    const n = c.killsByType[t] ?? 0;
    return `<tr><td>${esc(ENEMY_VARIANTS[t as EnemyType]?.label ?? t)}</td><td class="svc-tally"><i style="width:${Math.round((n / maxType) * 100)}%"></i></td><td>${n}</td></tr>`;
  }).join('');
  const guns = STATION_ORDER.map((s) => row(`${STATIONS[s].label}`, c.killsByStation[s] ?? 0)).join('');
  const rack = MEDALS.map((m) => {
    const n = c.medals[m.name] ?? 0;
    const first = m.first.kind === 'merit' ? `+${m.first.amount} merit` : m.first.label;
    return `<div class="svc-medal ${n ? 'got' : ''}" title="${esc(m.desc)}">
      <span class="svc-rib" style="background:${m.ribbon}"></span>
      <div class="svc-mt"><b>${esc(m.name)}</b>${n ? `<span class="svc-mcount">×${n}</span>` : ''}</div>
      <div class="svc-md">${esc(m.desc)}</div>
      <div class="svc-mr">${n ? `Repeat award: +${m.repeat} merit` : `First award: ${esc(first)}`}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="screen-center"><div class="svc-sheet svc-career">
    <div class="svc-stamp svc-stamp-tr">RESTRICTED</div>
    <div class="svc-hdr"><span>WAR DEPARTMENT · ARMY AIR FORCES</span><span>A.A.F. FORM 5 · INDIVIDUAL FLIGHT RECORD</span></div>
    <div class="svc-id">
      <div class="svc-ins svc-ins-big">${insigniaSvg(r.index, 76)}</div>
      <div class="svc-fields">
        <div><label>NAME</label><span class="svc-typed">${esc(name.toUpperCase())}</span></div>
        <div><label>SERIAL NO.</label><span class="svc-typed">${esc(c.serial)}</span></div>
        <div><label>GRADE</label><span class="svc-typed">${esc(r.rank.name.toUpperCase())} (${esc(r.rank.abbr)})</span></div>
        <div><label>ORGANIZATION</label><span class="svc-typed">401ST BOMB SQ · 8TH AIR FORCE</span></div>
        <div><label>ON STRENGTH SINCE</label><span class="svc-typed">${new Date(c.enlisted).toLocaleDateString()}</span></div>
        <div><label>CAREER XP</label><span class="svc-typed">${c.xp.toLocaleString()}</span></div>
      </div>
    </div>
    <div class="svc-sec">I. GRADE AND PROMOTION</div>
    <div class="svc-xpline">${r.next ? `${(r.next.xp - c.xp).toLocaleString()} XP to <b>${esc(r.next.name)}</b>${PROMOTION_REWARDS[r.index + 1] ? ` · reward: ${esc(rewardLabel(PROMOTION_REWARDS[r.index + 1]))}` : ''}` : 'Highest grade attained.'}</div>
    <div class="svc-bar svc-bar-paper"><i style="width:${Math.round(r.progress * 100)}%"></i></div>
    <ol class="svc-ladder">${ladder}</ol>
    <div class="svc-cols">
      <div>
        <div class="svc-sec">II. SERVICE</div>
        <table class="svc-tbl">
          ${row('Missions flown', c.missions)}
          ${row('Missions completed', c.wins)}
          ${row('Shot down / out of action', c.deaths)}
          ${row('Time in the air', fmtHours(c.seconds))}
          ${row('Rounds fired', c.shots)}
          ${row('Accuracy', c.shots ? `${(acc * 100).toFixed(1)}%` : '—')}
          ${row('Best kill streak', c.bestStreak)}
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
        <div class="svc-sec">III. CONFIRMED VICTORIES · ${c.kills.toLocaleString()}</div>
        <table class="svc-tbl svc-types">${types}</table>
        <table class="svc-tbl" style="margin-top:10px">
          ${row('As B-17 gunner', c.killsByRole.gunner)}
          ${row('As P-51 pilot', c.killsByRole.pilot)}
        </table>
        <div class="svc-sub">BY GUN POSITION</div>
        <table class="svc-tbl">${guns}</table>
      </div>
    </div>
    <div class="svc-sec">IV. DECORATIONS · ${totalMedals(c)} AWARDED</div>
    <div class="svc-rack">${rack}</div>
    <div class="svc-foot">
      <span>Achievements: ${achievements.count()}/${ACHIEVEMENTS.length}</span>
      <div class="svc-stamp svc-stamp-foot">CERTIFIED CORRECT</div>
    </div>
    <div class="row svc-actions"><button class="btn ghost" data-back>Back</button><button class="btn" data-tro>Trophies</button></div>
  </div></div>`;
  el.querySelector('[data-back]')!.addEventListener('click', h.back);
  el.querySelector('[data-tro]')!.addEventListener('click', h.trophies);
  onBackKey(el, h.back);
}
