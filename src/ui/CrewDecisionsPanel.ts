// Between-mission decisions in the hangar (Phase 11 goal 13): ground-crew shifts, a volunteer
// mission, passes for tired men, replacements for empty seats, and the ship's name and nose art.
// Each choice shows its gain (+) and its cost (−) in one line. Data: game/CrewDecisions.ts.
import './crewDecisions.css';
import {
  crewDecisions, fatigueLabel, fatigueMult, MAX_LEAVE, PER_SHIFT, RESTED_BONUS, ROOKIE_SKILL_FREE, VETERAN_COST,
  VETERAN_SKILL, VOLUNTEER, WORK_GAIN, WORK_LABEL, WORKS, type Work,
} from '../game/CrewDecisions';
import { crewRoster, manDef, MEN, POST_CREW, POSTS, ROOKIES, type ManId } from '../game/CrewRoster';
import { bomberName, cleanName, DEFAULT_NAME, NAME_MAX, owns, refreshPlayerBomber } from '../game/Customize';
import { NOSE_ARTS } from '../render/NoseArt';
import type { Progression } from '../game/Upgrades';
import type { CrewId } from '../world/Crew';
import { tx } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const pct = (x: number) => Math.round(x * 100);

let host: HTMLElement | null = null;
let prog: Progression | null = null;

const live = () => !!host?.isConnected && !!host.closest('.show');
crewRoster.on(() => { if (live()) render(); });
crewDecisions.on(() => { if (live()) render(); });

/** Hangar hook (UI.hangar, gunner): the decisions section, placed before the launch row. */
export function mountCrewDecisions(panel: HTMLElement, p: Progression) {
  prog = p;
  const sec = document.createElement('div');
  sec.className = 'crewdec';
  const before = panel.querySelector('[data-go]')?.closest('.row');
  if (before && before.parentElement === panel) panel.insertBefore(sec, before);
  else panel.appendChild(sec);
  host = sec;
  render();
}

const tradeoff = (gain: string, cost: string) =>
  `<div class="cd-trade"><span class="cd-plus">+ ${esc(gain)}</span><span class="cd-minus">− ${esc(cost)}</span></div>`;

function gainText(w: Work, n: number): string {
  const v = w === 'armour' ? PER_SHIFT.armour : w === 'guns' ? PER_SHIFT.heat : PER_SHIFT.engines;
  return tx(WORK_GAIN[w], { n: pct(v * Math.max(1, n)) });
}

// who is out of the next mission at each crew position (null: his own man flies)
function emptySeats(): { c: CrewId; who: ManId }[] {
  const out: { c: CrewId; who: ManId }[] = [];
  for (const p of POSTS) { const id = crewRoster.seats[p]; if (crewRoster.isOut(id)) out.push({ c: POST_CREW[p], who: id }); }
  for (const m of MEN) if (!m.gunner && crewRoster.isOut(m.id)) out.push({ c: m.home, who: m.id });
  return out;
}

function render() {
  const el = host;
  if (!el || !prog) return;
  const d = crewDecisions, locked = crewRoster.active;
  const lock = locked ? 'disabled' : '';

  // ground crew
  const shifts = d.shifts(), free = d.free();
  const jobs = WORKS.map((w) => {
    const n = d.work[w];
    const pips = Array.from({ length: shifts }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    return `<div class="cd-job"><b>${tx(WORK_LABEL[w])}</b><span class="cd-pips" aria-label="${tx('{n} shifts', { n })}">${pips}</span>
      <button class="btn ghost cd-step" data-work="${w}" data-d="-1" ${lock} ${n <= 0 ? 'disabled' : ''} aria-label="${esc(tx('Less work on {what}', { what: tx(WORK_LABEL[w]) }))}">−</button>
      <button class="btn ghost cd-step" data-work="${w}" data-d="1" ${lock} ${free <= 0 ? 'disabled' : ''} aria-label="${esc(tx('More work on {what}', { what: tx(WORK_LABEL[w]) }))}">+</button>
      <small>${esc(n ? gainText(w, n) : tx('No work planned'))}</small></div>`;
  }).join('');
  const repairs = d.repairs ? `<p class="cd-note">${esc(tx('She came home badly shot up: one shift goes on patching holes.'))}</p>` : '';

  // volunteer
  const vol = (on: boolean) => `<button class="cd-choice ${d.volunteer === on ? 'sel' : ''}" data-vol="${on ? 1 : 0}" ${lock} aria-pressed="${d.volunteer === on}">
    <b>${tx(on ? 'Volunteer for a dangerous mission' : 'Normal sortie')}</b>
    ${on ? tradeoff(tx('{n}% more merit · counts as two missions for the crew', { n: pct(VOLUNTEER.merit - 1) }), tx('tougher, sharper fighters · the crew tires twice as fast'))
      : `<div class="cd-trade"><span>${esc(tx('The mission as briefed.'))}</span></div>`}</button>`;

  // fatigue and leave
  const tired = MEN.filter((m) => !crewRoster.men[m.id].dead && (d.fatigueOf(m.id) > 0 || d.leave.has(m.id) || d.rested.has(m.id)))
    .sort((a, b) => d.fatigueOf(b.id) - d.fatigueOf(a.id));
  const leaveRow = (id: ManId) => {
    const m = manDef(id), f = d.fatigueOf(id), onLeave = d.leave.has(id), out = crewRoster.isOut(id) && !onLeave;
    const state = onLeave ? tx('On a 48-hour pass') : d.rested.has(id) ? tx('Rested: +{n}% skills next mission', { n: pct(RESTED_BONUS - 1) })
      : f <= 2 ? tx(fatigueLabel(f)) : tx('{state}: −{n}% skills', { state: tx(fatigueLabel(f)), n: pct(1 - fatigueMult(f)) });
    const btn = onLeave ? `<button class="btn ghost" data-leave="${id}" data-on="0" ${lock}>${tx('Cancel the pass')}</button>`
      : !out && !d.rested.has(id) ? `<button class="btn ghost" data-leave="${id}" data-on="1" ${lock} ${d.canLeave(id, out) ? '' : 'disabled'}>${tx('Give a 48-hour pass')}</button>` : '';
    return `<div class="cd-man ${f > 2 ? 'tired' : ''}"><span>${esc(tx(m.call))}</span><small>${esc(state)} · ${tx('{n} missions in a row', { n: f })}</small>${btn}</div>`;
  };
  const leave = tired.length ? tired.map((m) => leaveRow(m.id)).join('') : `<p class="cd-note">${esc(tx('The whole crew is fresh.'))}</p>`;

  // replacements
  const seats = emptySeats();
  const repl = seats.length ? seats.map(({ c, who }) => {
    const vet = d.veterans.has(c);
    const afford = vet || prog!.points >= VETERAN_COST;
    return `<div class="cd-repl"><span>${esc(tx('{who} is out: {rookie} takes his place', { who: tx(manDef(who).call), rookie: tx(ROOKIES[c].call) }))}</span>
      <div class="cd-pair">
        <button class="cd-choice ${vet ? '' : 'sel'}" data-vet="${c}" data-on="0" ${lock} aria-pressed="${!vet}"><b>${tx('Green rookie')}</b>${tradeoff(tx('free'), tx('skills {n}/100', { n: ROOKIE_SKILL_FREE }))}</button>
        <button class="cd-choice ${vet ? 'sel' : ''}" data-vet="${c}" data-on="1" ${lock} ${afford ? '' : 'disabled'} aria-pressed="${vet}"><b>${tx('Depot veteran')}</b>${tradeoff(tx('skills {n}/100', { n: VETERAN_SKILL }), tx('{n} merit, one mission', { n: VETERAN_COST }))}</button>
      </div></div>`;
  }).join('') : `<p class="cd-note">${esc(tx('Every seat has its own man. Swap stations in the crew roster above.'))}</p>`;

  // the ship
  const noses = NOSE_ARTS.filter((n) => owns(prog!, 'nose:' + n.id));
  const ship = `<div class="cd-ship">
    <label>${tx('Ship name')} <input class="cd-name" maxlength="${NAME_MAX}" value="${esc(bomberName())}" ${lock} aria-label="${tx('Ship name')}"></label>
    <button class="btn ghost" data-name ${lock}>${tx('Paint the name')}</button>
    <div class="cd-noses" role="group" aria-label="${tx('Nose art')}">${noses.map((n) => `<button class="cd-chip ${prog!.bomber.nose === n.id ? 'sel' : ''}" data-nose="${n.id}" ${lock} aria-pressed="${prog!.bomber.nose === n.id}">${esc(tx(n.name))}</button>`).join('')}</div>
    <small>${esc(tx('For the crew\'s pride only: no effect in the fight.'))}</small></div>`;

  el.innerHTML = `<div class="hsec">${tx('BEFORE THE NEXT MISSION')}</div>
    ${locked ? `<p class="cd-note">${esc(tx('Locked in for this mission. Decide again after the debrief.'))}</p>` : ''}
    <div class="cd-grid">
      <section class="cd-card"><h3>${tx('Ground crew')}</h3>
        <p class="cd-sub">${esc(tx('{free} of {n} shifts free', { free, n: shifts }))}</p>${repairs}${jobs}
        ${tradeoff(tx('the work helps the next mission only'), tx('one shift cannot be in two places'))}</section>
      <section class="cd-card"><h3>${tx('The next mission')}</h3>${vol(false)}${vol(true)}</section>
      <section class="cd-card"><h3>${tx('Rest and leave')}</h3>
        <p class="cd-sub">${esc(tx('From the third mission in a row a man\'s skills drop. Up to {n} passes at a time.', { n: MAX_LEAVE }))}</p>
        ${tradeoff(tx('back fully rested, {n}% better skills for one mission', { n: pct(RESTED_BONUS - 1) }), tx('he misses the next mission; a replacement flies'))}
        ${leave}</section>
      <section class="cd-card"><h3>${tx('Replacements')}</h3>${repl}</section>
      <section class="cd-card"><h3>${tx('The ship')}</h3>${ship}</section>
    </div>`;

  if (locked) return;
  el.querySelectorAll<HTMLButtonElement>('[data-work]').forEach((b) => b.addEventListener('click', () => crewDecisions.assign(b.dataset.work as Work, b.dataset.d === '1' ? 1 : -1)));
  el.querySelectorAll<HTMLButtonElement>('[data-vol]').forEach((b) => b.addEventListener('click', () => crewDecisions.setVolunteer(b.dataset.vol === '1')));
  el.querySelectorAll<HTMLButtonElement>('[data-leave]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.leave as ManId, on = b.dataset.on === '1';
    // the flag first, so the roster (redrawn by setLeave) already shows the pass
    if (on) { if (crewDecisions.canLeave(id, crewRoster.isOut(id))) { crewDecisions.grantLeave(id); if (!crewRoster.setLeave(id, true)) crewDecisions.cancelLeave(id); } }
    else if (crewRoster.setLeave(id, false) || crewRoster.men[id].rest === 0) crewDecisions.cancelLeave(id);
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-vet]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.vet as CrewId, p = prog!;
    if (b.dataset.on === '1') {
      if (crewDecisions.veterans.has(c) || p.points < VETERAN_COST) return;
      p.points -= VETERAN_COST; p.save(); crewDecisions.hireVeteran(c);
    } else if (crewDecisions.veterans.has(c)) { p.points += VETERAN_COST; p.save(); crewDecisions.releaseVeteran(c); }   // refunded before take-off
    const pts = el.closest('.hwrap')?.querySelector('.pts b');
    if (pts) pts.textContent = String(p.points);
  }));
  const name = el.querySelector<HTMLInputElement>('.cd-name')!;
  name.addEventListener('keydown', (e) => e.stopPropagation());   // typing stays in the field (the hangar launches on keys)
  el.querySelector('[data-name]')!.addEventListener('click', () => {
    prog!.bomber.name = cleanName(name.value) || DEFAULT_NAME;
    prog!.save(); refreshPlayerBomber(); render();
  });
  el.querySelectorAll<HTMLButtonElement>('[data-nose]').forEach((b) => b.addEventListener('click', () => {
    prog!.bomber.nose = b.dataset.nose!;
    prog!.save(); refreshPlayerBomber(); render();
  }));
}
