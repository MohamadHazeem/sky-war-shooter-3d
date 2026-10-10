// Crew UI: the portrait rows in the gunner HUD crew panel and the crew roster section of the
// hangar (assign gunners to stations, see levels, skills, seat bonuses and wounds).
// Data lives in game/CrewRoster.ts; this file only draws it.
import './crew.css';
import { CREW, CrewId } from '../world/Crew';
import { STATIONS, StationId } from '../world/B17Layout';
import { portraitUrl } from '../render/Portraits';
import {
  crewRoster, GUNNERS, HEAL_COST, levelOf, manDef, ManId, MAX_CREW_LEVEL, MEN, Post, POST_CREW, POST_LABEL, POSTS,
  ROOKIES, Stat, STAT_LABEL, xpFor,
} from '../game/CrewRoster';
import { tx } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// HUD position labels (the trade label would be wrong once gunners swap seats)
const HUD_LABEL: Record<CrewId, string> = {
  pilot: 'Pilot', copilot: 'Co-Pilot', nav: 'Nav', bombardier: 'Bomb', engineer: 'Top',
  radio: 'Radio', ball: 'Ball', waistL: 'Waist L', waistR: 'Waist R', tail: 'Tail',
};

// ---------------- gunner HUD ----------------

let flashT: number | null = null;

// Rebuild the HUD crew list (#hCrewList, made by UI.hud) as portrait rows. Each row keeps
// data-c and a trailing <b> status, so UI.updateGunnerHud's wound toggle still applies.
function mountHud(): HTMLElement | null {
  const list = document.getElementById('hCrewList');
  if (!list) return null;
  if (list.dataset.cp !== '1') {
    list.dataset.cp = '1';
    list.classList.add('cp');
    list.innerHTML = CREW.map((m) => `<span data-c="${m.id}"><img alt=""><i></i><em></em><b>${tx('OK')}</b></span>`).join('');
  }
  return list;
}

function refreshHud(levelUp?: ManId) {
  const list = mountHud();
  if (!list) return;
  for (let i = 0; i < list.children.length; i++) {
    const row = list.children[i] as HTMLElement;
    const c = row.dataset.c as CrewId;
    const id = crewRoster.occupant(c);
    const img = row.querySelector('img')!;
    const src = portraitUrl(id ? manDef(id).look : ROOKIES[c].look, 40);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    const name = id ? manDef(id).last : ROOKIES[c].last;
    setText(row.querySelector('i')!, `${tx(HUD_LABEL[c])} · ${tx(name)}`);
    setText(row.querySelector('em')!, id ? tx('L{n}', { n: crewRoster.level(id) }) : tx('NEW'));
    const w = crewRoster.posWounded(c);
    row.classList.toggle('wnd', w);
    row.classList.toggle('rk', !id && !w);
    setText(row.querySelector('b')!, tx(w ? 'WOUNDED' : id ? 'OK' : 'ROOKIE'));
    row.title = id ? tx('{who} "{nick}" — level {n}', { who: tx(manDef(id).call), nick: tx(manDef(id).nick), n: crewRoster.level(id) }) : tx('{who} — replacement rookie', { who: tx(ROOKIES[c].call) });
    if (levelUp && id === levelUp) {
      row.classList.remove('lvup'); void row.offsetWidth; row.classList.add('lvup');
      if (flashT) clearTimeout(flashT);
      flashT = window.setTimeout(() => row.classList.remove('lvup'), 2500);
    }
  }
}

function setText(e: Element, t: string) { if (e.textContent !== t) e.textContent = t; }

crewRoster.on((e, who) => {
  if (e === 'mission' || e === 'change' || e === 'levelup') refreshHud(e === 'levelup' ? who : undefined);
  if (rosterHost?.isConnected && rosterHost.closest('.show')) renderRoster(); // only while the hangar is open
});

// ---------------- hangar roster ----------------

interface Points { points: number; save(): void }
let rosterHost: HTMLElement | null = null;
let rosterProg: Points | null = null;
let picked: Post | null = null;
let fresh = new Set<ManId>();   // levelled up since the roster was last opened

// Hangar hook: add the CREW section to the hangar panel (before the launch row).
// Call after the hangar's innerHTML is (re)built; prog pays for the flight surgeon.
export function mountCrewRoster(panel: HTMLElement, prog?: Points) {
  rosterProg = prog ?? null;
  picked = null;
  const sec = document.createElement('div');
  sec.className = 'crewroster';
  const before = panel.querySelector('[data-go]')?.closest('.row');
  if (before && before.parentElement === panel) panel.insertBefore(sec, before);
  else panel.appendChild(sec);
  rosterHost = sec;
  // level-ups are flagged once, the first time the roster is shown after them
  fresh = new Set(MEN.filter((m) => levelOf(crewRoster.men[m.id].xp) > crewRoster.men[m.id].seen).map((m) => m.id));
  for (const m of MEN) crewRoster.men[m.id].seen = levelOf(crewRoster.men[m.id].xp);
  if (fresh.size) crewRoster.save();
  renderRoster();
}

function bar(v: number) { return `<span class="cr-bar"><span style="width:${Math.round(v)}%"></span></span>`; }

function statusOf(id: ManId): { cls: string; text: string } {
  const st = crewRoster.men[id];
  if (crewRoster.active) {
    if (crewRoster.isWounded(id)) return { cls: 'bad', text: 'Wounded — sits out the next round' };
    if (crewRoster.benched.has(id)) return { cls: 'bad', text: 'Wounded — back next round' };
    if (crewRoster.resting.has(id)) return { cls: 'bad', text: 'Resting this mission' };
    return { cls: 'ok', text: 'Fit' };
  }
  if (st.rest > 0) return { cls: 'bad', text: 'Wounded — misses the next mission' };
  return { cls: 'ok', text: 'Fit' };
}

function manCard(id: ManId, post: Post | null): string {
  const d = manDef(id), st = crewRoster.men[id], lv = levelOf(st.xp);
  const next = lv >= MAX_CREW_LEVEL ? 1 : (st.xp - xpFor(lv)) / (xpFor(lv + 1) - xpFor(lv));
  const station = post && post !== 'radio' ? post as StationId : null;
  const spec = d.specialty ? tx('{station} specialist', { station: tx(STATIONS[d.specialty].label) }) : d.gunner ? tx('All-rounder') : manDef(id).home === 'pilot' ? tx('Pilot') : tx(CREW.find((c) => c.id === d.home)!.label);
  const star = station && d.specialty === station ? `<span class="cr-star" title="${tx('Specialist in his own seat')}">★</span>` : '';
  const stats = d.gunner ? `<div class="cr-stats">${(['acc', 'trav', 'disc'] as Stat[]).map((s) => {
    const v = crewRoster.stat(id, s);
    return `<div><span>${tx(STAT_LABEL[s])}</span>${bar(v)}<b>${v}</b></div>`;
  }).join('')}</div>` : '';
  let bonus = '';
  if (d.bonus) {
    const at = station ?? d.specialty;
    const pct = Math.round(crewRoster.bonusAt(at ?? 'waistL', id) * 100);
    const sign = d.bonus.kind === 'spread' || d.bonus.kind === 'heat' ? '−' : '+';
    const where = station ? tx('when you man the {station}', { station: tx(STATIONS[station].label).toLowerCase() }) : at ? tx('on the {station}, his seat', { station: tx(STATIONS[at].label).toLowerCase() }) : tx('at any gun');
    bonus = `<div class="cr-bonus">${tx('{sign}{pct}% {what} {where}', { sign, pct, what: tx(d.bonus.what), where })}</div>`;
  }
  const s = statusOf(id);
  const heal = s.cls === 'bad' && !crewRoster.benched.has(id) && rosterProg
    ? `<button class="btn ghost cr-heal" data-heal="${id}" ${rosterProg.points < HEAL_COST ? 'disabled' : ''}>${tx('Flight surgeon · {n}', { n: HEAL_COST })}</button>` : '';
  const isNew = fresh.has(id) ? `<span class="cr-new">${tx('LEVEL UP')}</span>` : '';
  return `<div class="cr-man ${s.cls === 'bad' ? 'out' : ''}">
    <img class="cr-face" src="${portraitUrl(d.look, 96)}" alt="">
    <div class="cr-body">
      <div class="cr-name">${esc(tx(d.rank))} ${esc(tx(d.first))} “${esc(tx(d.nick))}” ${esc(tx(d.last))} ${star}</div>
      <div class="cr-spec">${esc(spec)} · <b>${tx('Level {n}', { n: lv })}</b>${isNew}</div>
      <div class="cr-xp" title="${st.xp} XP">${bar(next * 100)}</div>
      <div class="cr-bio">${esc(tx(d.bio))}</div>
      ${stats}${bonus}
      <div class="cr-status ${s.cls}">${esc(tx(s.text))} · ${tx('{n} kills', { n: st.kills })} · ${tx('{n} missions', { n: st.missions })} ${heal}</div>
    </div></div>`;
}

function renderRoster() {
  const host = rosterHost;
  if (!host) return;
  const seat = (p: Post) => {
    const id = crewRoster.seats[p];
    const rookie = crewRoster.isOut(id) ? `<div class="cr-rookie">${esc(tx('{who} (rookie) mans it meanwhile', { who: tx(ROOKIES[POST_CREW[p]].call) }))}</div>` : '';
    return `<div class="cr-seat ${picked === p ? 'picked' : ''} ${p === 'radio' ? 'spare' : ''}" data-post="${p}">
      <div class="cr-post">${tx(POST_LABEL[p])}${p === 'radio' ? tx(' · spare gunner') : ''}</div>${manCard(id, p)}${rookie}</div>`;
  };
  const officers = MEN.filter((m) => !m.gunner);
  host.innerHTML = `
    <div class="hsec">${tx('CREW · {n} GUNNERS', { n: GUNNERS.length })}</div>
    <div class="cr-hint">${picked ? tx('Moving {who} — click another seat to swap, or the same one to cancel.', { who: esc(tx(manDef(crewRoster.seats[picked]).call)) }) : tx('Click a gunner, then another seat, to swap them. ★ specialist in his own seat: better AI shooting and the full seat bonus.')}${crewRoster.active ? tx(' Changes apply from the next round.') : ''}</div>
    ${crewRoster.notes.length ? `<div class="cr-notes">${crewRoster.notes.map((n) => `<div>${esc(n)}</div>`).join('')}</div>` : ''}
    <div class="cr-grid">${POSTS.map(seat).join('')}</div>
    <div class="hsec">${tx('OFFICERS')}</div>
    <div class="cr-grid off">${officers.map((m) => `<div class="cr-seat officer">${manCard(m.id, null)}</div>`).join('')}</div>`;
  host.querySelectorAll<HTMLElement>('[data-post]').forEach((el) => el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-heal]')) return;
    const p = el.dataset.post as Post;
    if (!picked) picked = p;
    else { const a = picked; picked = null; if (a !== p) crewRoster.swap(a, p); }
    renderRoster();
  }));
  host.querySelectorAll<HTMLButtonElement>('[data-heal]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.heal as ManId;
    const prog = rosterProg;
    if (!prog || prog.points < HEAL_COST) return;
    prog.points -= HEAL_COST;
    prog.save();
    const pts = host.closest('.hwrap')?.querySelector('.pts b');
    if (pts) pts.textContent = String(prog.points);
    crewRoster.heal(id);
  }));
}
