// Gunner Mastery screen (Hangar → Crew & Skills → Gunner Mastery) and the debrief's mastery
// report. Five tabs on one calm sheet: Stations (rank per gun), Challenges (three tiers each),
// Ace Hunt (this week's points, quarry and board), Locker (sights, patches, nose art, names)
// and Stats (kills and accuracy per station). Rules and record: game/Mastery.ts.
import {
  type ChallengeDef, type MasteryBook, type MissionReport, type Reward, CHALLENGES, HUNT, HUNT_GOAL, HUNT_MERIT, HUNT_PATCH, MAX_RANK,
  NOSE_NAMES, STATION_GEAR, huntMode, quarryFor, rewardParts, sourcesOf, stationReward, MASTER_NOSE, HUNTER_NOSE,
} from '../game/Mastery';
import type { Progression } from '../game/Upgrades';
import { SIGHTS, sightThumb } from '../game/GunSights';
import { PATCHES, patchSvg } from '../game/CrewPatches';
import { STATION_ORDER, STATIONS, type StationId } from '../world/B17Layout';
import { noseArtThumb } from '../render/NoseArt';
import { bomberName } from '../game/Customize';
import { fmtWeekCountdown, msUntilNextWeek, weekKey } from '../game/Weekly';
import { mountLeaderboard } from './LeaderboardPanel';
import { esc, fmtHours, onBackKey, showLayer } from './serviceCommon';
import { num, tx } from '../i18n';
import './mastery.css';

type Tab = 'stations' | 'challenges' | 'hunt' | 'locker' | 'stats';
export const MASTERY_TABS: [Tab, string][] = [['stations', 'Stations'], ['challenges', 'Challenges'], ['hunt', 'Ace Hunt'], ['locker', 'Locker'], ['stats', 'Stats']];
let lastTab: Tab = 'stations';

export interface MasteryHooks { back(): void; changed(): void }

const stName = (s: StationId) => tx(STATIONS[s].label);
const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
const bar = (x: number) => `<div class="ms-bar"><i style="width:${pct(x)}"></i></div>`;

// "Gun sight: Gyro K-14", translated piecewise
export function rewardText(r: Reward): string {
  if (r.kind === 'merit') return tx('+{n} merit', { n: num(r.amount) });
  const p = rewardParts(r);
  return `${tx(p.kind)}: ${r.kind === 'name' ? p.name : tx(p.name)}`;
}
export const rewardLabel = (r: Reward) => esc(rewardText(r));

// What earned it: "Ball Turret · Rank 5", "Deflection Shooting · Tier 2", "Weekly Ace Hunt goal"
export function sourceLabel(src: string): string {
  if (src === 'hunt') return tx('Weekly Ace Hunt goal');
  const [a, b] = src.split('|');
  if (a in STATIONS) return `${stName(a as StationId)} · ${tx('Rank {n}', { n: b })}`;
  const c = CHALLENGES.find((x) => x.id === a);
  return c ? `${tx(c.name)} · ${tx('Tier {n}', { n: b })}` : '';
}

// Aircraft designations never break across lines ("Me 410", not "Me / 410")
const keepTypes = (s: string) => s.replace(/\b(Bf|Ju|Me|Fw|He|Do) (\d)/g, '$1\u00a0$2');
// "1,234 / 1,500" before the goal, "Goal reached ✓ 4,753" after it
const huntScore = (points: number, done: boolean) => (done ? tx('Goal reached ✓ {p}', { p: num(points) }) : `${num(points)} / ${num(HUNT_GOAL)}`);

const howTo = (r: Reward) => sourcesOf(r).slice(0, 2).map(sourceLabel).join(' / ');

// Rank badge: the number in a roundel, ringed with one pip per rank
export function rankBadge(rank: number, size = 46): string {
  const pips = Array.from({ length: MAX_RANK }, (_, i) => {
    const a = -Math.PI / 2 + (i / MAX_RANK) * Math.PI * 2;
    return `<circle cx="${(24 + Math.cos(a) * 20).toFixed(1)}" cy="${(24 + Math.sin(a) * 20).toFixed(1)}" r="2.2" class="${i < rank ? 'on' : ''}"/>`;
  }).join('');
  return `<svg class="ms-badge${rank >= 9 ? ' gold' : ''}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><circle cx="24" cy="24" r="15"/>${pips}<text x="24" y="29.5" text-anchor="middle">${rank}</text></svg>`;
}

// ---------------- tabs ----------------
function stationsTab(book: MasteryBook): string {
  return `<div class="ms-cards">${STATION_ORDER.map((s) => {
    const r = book.rank(s), rec = book.station(s);
    const next = r.rank < MAX_RANK ? stationReward(s, r.rank + 1) : null;
    const acc = rec.shots > 0 ? `${Math.round((rec.hits / rec.shots) * 100)}%` : '—';
    return `<div class="ms-card${r.rank >= 9 ? ' top' : ''}">
      ${rankBadge(r.rank)}
      <div class="ms-cmain">
        <div class="ms-ct"><b>${stName(s)}</b><span>${esc(tx(r.name))}</span></div>
        ${bar(r.progress)}
        <div class="ms-cs">${r.next !== null ? tx('{xp} / {next} XP', { xp: num(Math.floor(r.xp)), next: num(r.next) }) : tx('Highest rank · {xp} XP', { xp: num(Math.floor(r.xp)) })} · ${tx('{n} kills', { n: num(rec.kills) })} · ${tx('accuracy {p}', { p: acc })}</div>
        ${next ? `<div class="ms-next">${tx('Rank {n}', { n: r.rank + 1 })}: ${rewardLabel(next)}</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>
  <p class="ms-note">${tx('Mastery XP: 10 a kill, +10 deflection, +25 ace, +10 at 600 m or more, +5 heavy, +20 an untouched round, +20 for 25% accuracy over 100 rounds.')}</p>`;
}

function challengeRow(book: MasteryBook, c: ChallengeDef): string {
  const p = book.progress(c.id), done = book.tiersDone(c), goal = c.tiers[Math.min(done, 2)];
  const from = done > 0 ? c.tiers[done - 1] : 0;
  return `<div class="ms-ch${done >= 3 ? ' done' : ''}">
    <div class="ms-ct"><b>${esc(tx(c.name))}</b><span class="ms-tiers">${c.tiers.map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span></div>
    <div class="ms-cd">${esc(tx(c.desc))}</div>
    ${bar(done >= 3 ? 1 : (p - from) / Math.max(1, goal - from))}
    <div class="ms-cs">${done >= 3 ? tx('All tiers complete · {n}', { n: num(p) }) : `${num(Math.min(p, goal))} / ${num(goal)} · ${tx('Tier {n}', { n: done + 1 })}: ${rewardLabel(c.rewards[done])}`}</div>
  </div>`;
}

function huntTab(book: MasteryBook): string {
  const h = book.d.hunt, q = quarryFor(h.week);
  const rows: [string, number][] = [['Kill', HUNT.kill], ['Quarry kill (extra)', HUNT.quarry], ['Ace kill', HUNT.ace], ['Deflection kill', HUNT.deflection], ['Kill at 600 m or more', HUNT.long], ['Untouched round', HUNT.clean]];
  return `<div class="ms-hunt">
    <div class="ms-hhead">
      <div><div class="kicker">${tx('Week {n}', { n: +h.week.slice(4) })} · ${tx('B-17 gunners')}</div>
        <div class="ms-quarry">${tx('Quarry')}: <b>${esc(keepTypes(tx(q.name)))}</b></div>
        <div class="ms-cs">${tx('Every gunner sortie this week counts: campaign, Survival and the other modes.')}</div></div>
      <div class="ms-cd2">${tx('Resets in')}<b data-hunt-cd>${esc(tx(fmtWeekCountdown(msUntilNextWeek())))}</b></div>
    </div>
    <div class="ms-hpts">${h.done ? `<span class="ms-ok">${tx('Goal reached ✓ {p}', { p: `<b>${num(h.points)}</b>` })}</span> ${tx('points')}` : `<b>${num(h.points)}</b> / ${num(HUNT_GOAL)} ${tx('points')}`}</div>
    ${bar(h.points / HUNT_GOAL)}
    <div class="ms-cs">${tx('{k} kills · {m} sorties this week', { k: num(h.kills), m: num(h.missions) })} · ${tx('Weeks won: {n}', { n: book.d.huntWins })}</div>
    <div class="ms-reward">${patchSvg(HUNT_PATCH, 40)}<span>${tx('Goal reward: +{m} merit every week, and the Hunt Master patch the first time.', { m: num(HUNT_MERIT) })}</span></div>
    <table class="ms-table ms-points"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(tx(k))}</td><td dir="ltr">+${v}</td></tr>`).join('')}</tbody></table>
    <div data-hunt-board></div>
  </div>`;
}

function lockerTab(book: MasteryBook, prog: Progression): string {
  const sight = book.activeSight(prog), patch = book.activePatch(prog);
  const tile = (kind: string, id: string, own: boolean, sel: boolean, img: string, name: string, how: string) =>
    `<button class="ms-tile${sel ? ' sel' : ''}${own ? '' : ' locked'}" data-equip="${kind}:${esc(id)}" ${own ? '' : 'disabled'} aria-pressed="${sel}">
      <span class="ms-timg">${img}</span><span class="ms-tn">${esc(name)}</span>
      <span class="ms-ts">${sel ? tx('EQUIPPED') : own ? tx('EQUIP') : esc(how)}</span></button>`;
  const sights = SIGHTS.map((s) => {
    const own = book.owns(prog, { kind: 'sight', id: s.id });
    return tile('sight', s.id, own, sight === s.id, `<img alt="" src="${sightThumb(s.id)}"/>`, tx(s.name), howTo({ kind: 'sight', id: s.id }));
  }).join('');
  const patches = PATCHES.map((p) => {
    const own = book.owns(prog, { kind: 'patch', id: p.id });
    return tile('patch', p.id, own, patch === p.id, patchSvg(p.id, 56, !own), tx(p.name), howTo({ kind: 'patch', id: p.id }));
  }).join('');
  const name = bomberName();
  const noses = [MASTER_NOSE, HUNTER_NOSE].map((id) => {
    const own = prog.unlocked.has('nose:' + id);
    return tile('nose', id, own, prog.bomber.nose === id, own ? `<img alt="" src="${noseArtThumb(id, name)}"/>` : '<span class="ms-q">?</span>', tx(NOSE_NAMES[id]), howTo({ kind: 'nose', id }));
  }).join('');
  const names = [...STATION_ORDER.map((s) => STATION_GEAR[s].name), ...CHALLENGES.flatMap((c) => c.rewards.filter((r) => r.kind === 'name').map((r) => (r as { id: string }).id))];
  const nameChips = names.map((n) => {
    const own = prog.unlocked.has('name:' + n), sel = prog.bomber.name === n;
    return `<button class="ms-chip${sel ? ' sel' : ''}${own ? '' : ' locked'}" data-equip="name:${esc(n)}" ${own ? '' : 'disabled'} title="${esc(own ? '' : howTo({ kind: 'name', id: n }))}">${esc(n)}${own ? '' : ` · ${esc(howTo({ kind: 'name', id: n }))}`}</button>`;
  }).join('');
  const count = (n: number, of: number) => `<span class="ms-count">${n}/${of}</span>`;
  const own = (k: Reward['kind'], ids: string[]) => ids.filter((id) => book.owns(prog, { kind: k, id } as Reward)).length;
  return `<div class="ms-lsec"><h3>${tx('Gun sights')}${count(own('sight', SIGHTS.map((s) => s.id)), SIGHTS.length)}</h3>
      <p class="ms-note">${tx('Your reticle on the waist guns, the top turret and the ball turret\'s reflector glass.')}</p><div class="ms-grid">${sights}</div></div>
    <div class="ms-lsec"><h3>${tx('Crew patches')}${count(own('patch', PATCHES.map((p) => p.id)), PATCHES.length)}</h3>
      <p class="ms-note">${tx('Worn on your mastery record and in the debrief.')}</p><div class="ms-grid">${patches}</div></div>
    <div class="ms-lsec"><h3>${tx('Nose art')}${count(own('nose', [MASTER_NOSE, HUNTER_NOSE]), 2)}</h3><div class="ms-grid ms-wide">${noses}</div></div>
    <div class="ms-lsec"><h3>${tx('Bomber names')}${count(names.filter((n) => prog.unlocked.has('name:' + n)).length, names.length)}</h3><div class="ms-chips">${nameChips}</div></div>`;
}

function statsTab(book: MasteryBook): string {
  const row = (label: string, r: ReturnType<MasteryBook['totals']>, cls = '') => `<tr class="${cls}"><th scope="row">${esc(label)}</th><td>${num(r.kills)}</td><td>${num(r.shots)}</td><td>${num(r.hits)}</td><td>${r.shots > 0 ? `${((r.hits / r.shots) * 100).toFixed(1)}%` : '—'}</td><td>${fmtHours(r.time)}</td></tr>`;
  const row2 = (label: string, r: ReturnType<MasteryBook['totals']>, cls = '') => `<tr class="${cls}"><th scope="row">${esc(label)}</th><td>${num(r.deflection)}</td><td>${num(r.aces)}</td><td>${num(r.long)}</td><td>${num(r.heavy)}</td><td>${num(r.clean)}</td><td>${num(r.bestMission)}</td></tr>`;
  const t = book.totals();
  const accs = STATION_ORDER.map((s) => ({ s, a: book.accuracy(s), n: book.station(s).shots })).filter((x) => x.n >= 200).sort((a, b) => b.a - a.a);
  return `<div class="ms-scroll"><table class="ms-table ms-stats"><thead><tr><th></th><th>${tx('Kills')}</th><th>${tx('Rounds fired')}</th><th>${tx('Hits')}</th><th>${tx('Accuracy')}</th><th>${tx('Time at the gun')}</th></tr></thead>
    <tbody>${STATION_ORDER.map((s) => row(stName(s), book.station(s))).join('')}${row(tx('All stations'), t, 'tot')}</tbody></table></div>
    ${accs.length ? `<p class="ms-note">${tx('Your best gun: {s}, {p} accuracy.', { s: stName(accs[0].s), p: `${(accs[0].a * 100).toFixed(1)}%` })}</p>` : ''}
    <div class="ms-scroll"><table class="ms-table ms-stats"><thead><tr><th></th><th>${tx('Deflection')}</th><th>${tx('Aces')}</th><th>${tx('600 m+')}</th><th>${tx('Heavies')}</th><th>${tx('Untouched rounds')}</th><th>${tx('Best sortie')}</th></tr></thead>
    <tbody>${STATION_ORDER.map((s) => row2(stName(s), book.station(s))).join('')}${row2(tx('All stations'), t, 'tot')}</tbody></table></div>
    <p class="ms-note">${tx('Rounds and hits are counted since Gunner Mastery arrived; earlier kills carry over from your service record.')}</p>`;
}

// ---------------- the screen ----------------
export function showMasteryScreen(book: MasteryBook, prog: Progression, h: MasteryHooks, tab: Tab = lastTab) {
  lastTab = tab;
  const root = showLayer('mastery');
  const best = STATION_ORDER.map((s) => ({ s, r: book.rank(s) })).sort((a, b) => b.r.xp - a.r.xp)[0];
  const ranks = STATION_ORDER.reduce((a, s) => a + book.rank(s).rank, 0);
  const body = tab === 'stations' ? stationsTab(book) : tab === 'challenges' ? CHALLENGES.map((c) => challengeRow(book, c)).join('')
    : tab === 'hunt' ? huntTab(book) : tab === 'locker' ? lockerTab(book, prog) : statsTab(book);
  root.innerHTML = `<div class="screen-center"><div class="box panel menu-sheet ms-sheet">
    <div class="ms-topbar"><button class="btn ghost menu-back" data-back>${tx('Back')}</button></div>
    <div class="ms-head">${patchSvg(book.activePatch(prog), 68)}
      <div><div class="kicker">${tx('Crew & Skills')}</div><h2>${tx('Gunner Mastery')}</h2>
      <div class="ms-sub">${tx('Best gun: {s}, rank {n}', { s: stName(best.s), n: best.r.rank })} · ${tx('{n} of {of} ranks', { n: ranks, of: MAX_RANK * STATION_ORDER.length })} · ${tx('Ace Hunt')}: ${huntScore(book.d.hunt.points, book.d.hunt.done)}</div></div></div>
    <div class="hangar-tabs ms-tabs" role="tablist" aria-label="${tx('Gunner Mastery')}">${MASTERY_TABS.map(([id, label]) => `<button role="tab" id="ms-tab-${id}" aria-controls="ms-body" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" data-tab="${id}">${tx(label)}</button>`).join('')}</div>
    <div id="ms-body" class="ms-body ms-${tab}" role="tabpanel" aria-labelledby="ms-tab-${tab}">${body}</div>
  </div></div>`;
  const reopen = (t: Tab) => { showMasteryScreen(book, prog, h, t); root.querySelector<HTMLElement>(`[data-tab="${t}"]`)?.focus(); };
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.onclick = () => reopen(b.dataset.tab as Tab);
    b.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const rtl = document.documentElement.dir === 'rtl';
      const i = MASTERY_TABS.findIndex(([id]) => id === tab), n = MASTERY_TABS.length;
      const d = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      reopen(MASTERY_TABS[e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + d + n) % n][0]);
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) => b.onclick = () => {
    const v = b.dataset.equip!, kind = v.slice(0, v.indexOf(':')), id = v.slice(v.indexOf(':') + 1);
    if (kind === 'sight') book.setSight(prog, id);
    else if (kind === 'patch') book.setPatch(prog, id);
    else if (kind === 'nose' && prog.unlocked.has('nose:' + id)) { prog.bomber.nose = id; prog.save(); }
    else if (kind === 'name' && prog.unlocked.has('name:' + id)) { prog.bomber.name = id; prog.save(); }
    h.changed();
    showMasteryScreen(book, prog, h, tab);
    root.querySelector<HTMLElement>(`[data-equip="${CSS.escape(v)}"]`)?.focus();
  });
  root.querySelector<HTMLElement>('[data-back]')!.onclick = h.back;
  onBackKey(root, h.back);
  const host = root.querySelector<HTMLElement>('[data-hunt-board]');
  if (host) {
    const e = book.huntEntry();
    const fresh = e && book.d.hunt.points > book.d.hunt.posted ? { name: '', ...e } : undefined;
    mountLeaderboard(host, huntMode(book.d.hunt.week), 'WEEKLY ACE HUNT · TOP 10', fresh);
    host.addEventListener('submit', () => book.markPosted(), true);
    const cd = root.querySelector<HTMLElement>('[data-hunt-cd]');
    const tick = setInterval(() => {
      if (!root.classList.contains('show') || !cd?.isConnected) { clearInterval(tick); return; }
      cd.textContent = tx(fmtWeekCountdown(msUntilNextWeek()));
      if (weekKey() !== book.d.hunt.week) { clearInterval(tick); book.rollWeek(); showMasteryScreen(book, prog, h, 'hunt'); }
    }, 30000);
  }
}

// ---------------- debrief ----------------
export function renderMasteryDebrief(rep: MissionReport, book: MasteryBook, prog: Progression) {
  const box = document.querySelector<HTMLElement>('#debrief .box');
  if (!box || (!rep.stations.length && !rep.rewards.length)) return;
  box.querySelector('.ms-debrief')?.remove();
  const sec = document.createElement('div');
  sec.className = 'ms-debrief';
  const st = rep.stations.map((g) => {
    const up = g.after.rank > g.before.rank;
    return `<li>${rankBadge(g.after.rank, 34)}<div class="ms-cmain"><div class="ms-ct"><b>${stName(g.id)}</b><span>${esc(tx(g.after.name))}</span>${up ? `<em class="ms-up">${tx('RANK UP')}</em>` : ''}<span class="ms-xp">${tx('+{n} XP', { n: num(g.gained) })}</span></div>
      ${bar(g.after.progress)}<div class="ms-cs">${tx('{k} kills · {d} deflection · {a} aces', { k: num(g.tally.kills), d: num(g.tally.deflection), a: num(g.tally.aces) })}${g.tally.shots > 0 ? ` · ${tx('accuracy {p}', { p: `${Math.round((g.tally.hits / g.tally.shots) * 100)}%` })}` : ''}</div></div></li>`;
  }).join('');
  const ch = rep.challenges.map((c) => {
    const def = CHALLENGES.find((x) => x.id === c.id)!;
    return `<span class="ms-pill">${esc(tx(def.name))} <b>${num(c.after)}${c.tier < 3 ? `/${num(c.goal)}` : ''}</b></span>`;
  }).join('');
  const rw = rep.rewards.map((r) => `<li><span>${rewardLabel(r.reward)}</span><small>${r.source === 'hunt' ? tx('Weekly Ace Hunt goal') : sourceLabel(r.source)}</small></li>`).join('');
  const hunt = rep.hunt;
  sec.innerHTML = `<div class="ms-dhead">${patchSvg(book.activePatch(prog), 36)}<div class="svc-k">${tx('GUNNER MASTERY')}</div></div>
    ${st ? `<ul class="ms-dst">${st}</ul>` : ''}
    ${ch ? `<div class="ms-pills">${ch}</div>` : ''}
    ${rw ? `<ul class="ms-drw">${rw}</ul>` : ''}
    <div class="ms-dhunt"><div>${tx('Weekly Ace Hunt')}: <b>${tx('+{n} points', { n: num(hunt.gained) })}</b> · ${hunt.reached ? `<span class="ms-ok">${huntScore(hunt.points, true)}</span>` : huntScore(hunt.points, false)}</div>
      <div>${tx('Quarry')}: ${esc(keepTypes(tx(hunt.quarry.name)))}</div></div>`;
  const row = Array.from(box.children).filter((x) => x.classList.contains('row')).pop();
  box.insertBefore(sec, row ?? null);
}
