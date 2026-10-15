// Crew stories in the hangar (Phase 11 goal 11): a folding section under the crew roster with
// mail call (help one man write home per break), each man's morale, fatigue, traits and ritual,
// the crew's friendships and friction, and the journal. Data: game/CrewStories.ts.
// Hook: CrewPanel.renderRoster appends storiesHtml() and calls bindStories().
import './crewStories.css';
import {
  crewStories, PERSONA, STORY_MEN, SURNAME, TRAIT_HELP, BOND_WHY, bondLabel, fatigueLabel, moraleLabel, pairKey,
  FRIENDS, MORALE_HIGH, MORALE_LOW, FATIGUE_EFFECT, type Entry,
} from '../game/CrewStories';
import { crewRoster, manDef, type ManId } from '../game/CrewRoster';
import { tx, isAr } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Translate a template and its English string values (names, senders). */
export const say = (text: string, vars?: Record<string, string | number>) =>
  tx(text, vars && isAr() ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' ? tx(v) : v])) : vars);

let open = false;   // the section's open state, kept while the hangar re-renders
const gone = (id: ManId) => crewRoster.men[id].dead || crewStories.dead.has(id);
const pct = (k: number) => Math.round((k - 1) * 100);

function meter(v: number, cls: string) { return `<span class="cs-bar ${cls}"><span style="width:${Math.round(v)}%"></span></span>`; }

/** One line for a man's card in the roster: morale, fatigue and what they do to his work. */
export function moodLine(id: ManId): string {
  if (gone(id)) return '';
  const m = crewStories.morale(id), f = crewStories.fatigue(id), k = pct(crewStories.mult(id));
  const cls = m < MORALE_LOW || f >= FATIGUE_EFFECT ? 'bad' : m >= MORALE_HIGH ? 'good' : '';
  const perf = k ? ` · ${esc(tx('Performance {n}%', { n: (k > 0 ? '+' : '') + k }))}` : '';
  return `<div class="cs-mood ${cls}">${esc(tx('Morale: {m}', { m: tx(moraleLabel(m)) }))} · ${esc(tx('Fatigue: {f}', { f: tx(fatigueLabel(f)) }))}${perf}</div>`;
}

function entryHtml(e: Entry): string {
  const who = e.kind === 'letter' && e.vars?.who ? `<b>${esc(tx(String(e.vars.who)))}</b> · ` : '';
  return `<li class="k-${e.kind}"><span>${esc(tx('Mission {n}', { n: e.n }))}</span> ${who}${esc(say(e.text, e.vars))}</li>`;
}

export function storiesHtml(): string {
  const s = crewStories;
  const inbox = s.inbox().filter((l) => !gone(l.man));
  const mail = inbox.length
    ? inbox.map((l) => `<div class="cs-letter ${l.bad ? 'bad' : ''}"><b>${esc(tx(manDef(l.man).call))}</b> ${esc(say(l.text, { from: l.from }))}
        <button class="btn ghost" data-reply="${l.id}" ${s.canReply ? '' : 'disabled'}>${esc(tx('Help him write back'))}</button></div>`).join('')
      + (s.canReply ? '' : `<div class="cs-note">${esc(tx('You have helped with one reply this break. More after the next mission.'))}</div>`)
    : `<div class="cs-note">${esc(tx('No letters waiting. Mail comes after missions.'))}</div>`;
  const men = STORY_MEN.filter((id) => !gone(id)).map((id) => {
    const d = manDef(id), p = PERSONA[id];
    const m = s.morale(id), f = s.fatigue(id), k = pct(s.mult(id));
    const traits = p.traits.map((t) => `<i title="${esc(tx(TRAIT_HELP[t]))}">${esc(tx(t))}</i>`).join(' ');
    return `<div class="cs-man">
      <div class="cs-name"><b>${esc(tx(d.last))}</b> “${esc(tx(d.nick))}” ${traits}</div>
      <div class="cs-meters"><span>${esc(tx('Morale'))}</span>${meter(m, m < MORALE_LOW ? 'low' : m >= MORALE_HIGH ? 'high' : '')}<em>${esc(tx(moraleLabel(m)))}</em>
        <span>${esc(tx('Fatigue'))}</span>${meter(f, f >= FATIGUE_EFFECT ? 'low' : '')}<em>${esc(tx(fatigueLabel(f)))}</em>
        ${k ? `<em class="${k > 0 ? 'up' : 'down'}">${esc(tx('Performance {n}%', { n: (k > 0 ? '+' : '') + k }))}</em>` : ''}</div>
      <div class="cs-ritual">${esc(tx('Ritual'))}: ${esc(tx(p.ritual))}</div>
    </div>`;
  }).join('');
  const bonds = s.notableBonds().filter((b) => !gone(b.a) && !gone(b.b)).slice(0, 8).map((b) => {
    const why = BOND_WHY[pairKey(b.a, b.b)];
    return `<li class="${b.v >= FRIENDS ? 'friend' : 'rival'}" ${why ? `title="${esc(tx(why))}"` : ''}><b>${esc(tx('{a} & {b}', { a: tx(SURNAME[b.a]), b: tx(SURNAME[b.b]) }))}</b> · ${esc(tx(bondLabel(b.v)))}${why ? ` <span>${esc(tx(why))}</span>` : ''}</li>`;
  }).join('');
  const journal = s.journal.length ? `<ul class="cs-journal">${s.journal.slice(0, 8).map(entryHtml).join('')}</ul>` : `<div class="cs-note">${esc(tx('Fly a mission with the crew and their stories start here.'))}</div>`;
  return `<details class="crs" ${open ? 'open' : ''}>
    <summary class="hsec">${esc(tx('CREW STORIES · MORALE AND BONDS'))}</summary>
    <div class="cr-hint">${esc(tx('Morale and fatigue change how well each man does his job. Good missions, letters and rest lift them; losses weigh on them.'))}</div>
    <div class="cs-sub">${esc(tx('Mail call'))}</div>${mail}
    <div class="cs-sub">${esc(tx('The men'))}</div><div class="cs-men">${men}</div>
    <div class="cs-sub">${esc(tx('Friends and friction'))}</div><ul class="cs-bonds">${bonds}</ul>
    <div class="cs-sub">${esc(tx('Crew journal'))}</div>${journal}
  </details>`;
}

/** Wire the section after it was put in the page; `rerender` redraws the whole roster. */
export function bindStories(host: HTMLElement, rerender: () => void) {
  const det = host.querySelector<HTMLDetailsElement>('details.crs');
  det?.addEventListener('toggle', () => { open = det.open; });
  host.querySelectorAll<HTMLButtonElement>('[data-reply]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (crewStories.reply(Number(b.dataset.reply))) rerender();
  }));
}
