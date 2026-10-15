// The Tour's screens (game/Tour.ts holds the rules, game/TourRuntime.ts the mission hooks):
// - the tour board: field orders (one to three targets, one primary "Fly this mission"), the
//   stand-down, the ship with her damage and patches, the crew, morale and fatigue, the log;
// - the event card between missions (a choice), the finale "Going Home" after mission 25;
// - the tour report on the debrief, with the pilot on the interphone.
// Simple-menu rules (Phase 8): one primary button, few choices, Back top-leading, Arabic/RTL.
import type { Mission } from '../game/Missions';
import {
  DANGER_LABEL, POS_LABEL, POSITIONS, TOUR_LENGTH, ZONE_LABEL, crewFactor, effectiveDanger, escortFor, eventById, fatigueLabel, finale, loadTour,
  manName, moraleLabel, newTour, numberWord, resolveEvent, roughEngines, saveTour, shipCondition, standDown, stageOf, tourMission,
  type ReportLine, type TourMan, type TourReport, type TourState,
} from '../game/Tour';
import { MEN, ROOKIES } from '../game/CrewRoster';
import { withName } from '../game/Customize';
import { STATIONS } from '../world/B17Layout';
import { portraitUrl, type PortraitLook } from '../render/Portraits';
import { voice } from '../audio/Voice';
import { VOICE_LINES } from '../audio/voiceLines';
import { tx, isAr } from '../i18n';
import { esc, onBackKey, showLayer } from './serviceCommon';

export interface TourHost {
  briefing(m: Mission, back: () => void): void;
  menu(): void;
}

// ---------------- text helpers ----------------

/** "S/Sgt. Mendez" -> rank and name translated apart. */
export const trName = (who: string) => { const i = who.indexOf(' '); return i < 0 ? tx(who) : `${tx(who.slice(0, i))} ${tx(who.slice(i + 1))}`; };
const ship = (name: string) => withName(name);
function trVars(vars?: Record<string, string | number>) {
  if (!vars) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = typeof v !== 'string' ? v : k === 'who' ? v.split(', ').map(trName).join(isAr() ? '، ' : ', ') : k === 'ship' ? ship(v) : tx(v);
  return out;
}
export const lineText = (l: ReportLine) => tx(l.text, trVars(l.vars));
const pct = (v: number) => `${Math.round(v)}%`;

// ---------------- portraits ----------------

const RK_SKIN = ['#e9bf9c', '#d8a47c', '#f1c8a8', '#c99467', '#efc2a0'], RK_HAIR = ['#2a221a', '#7a5a32', '#b89a5a', '#1e1813', '#5c4026'];
function lookOf(m: TourMan): PortraitLook {
  const orig = MEN.find((x) => x.id === m.key);
  if (orig) return orig.look;
  const rookie = ROOKIES[m.pos];
  if (rookie.last === m.last) return rookie.look;
  let h = 0; for (const c of m.key + m.last) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { ...rookie.look, skin: RK_SKIN[h % RK_SKIN.length], hair: RK_HAIR[(h >> 3) % RK_HAIR.length] };
}

// ---------------- styles ----------------

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('tour-css')) return;
  const st = document.createElement('style');
  st.id = 'tour-css';
  st.textContent = `
#tour { background: radial-gradient(ellipse at 50% 30%, rgba(26,27,17,0.6), rgba(6,7,4,0.94)); overflow-y: auto; }
#tour .tour { width: min(1240px, 100%); margin: 0 auto; padding: 20px 22px 28px; box-sizing: border-box; }
.tour-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin: 8px 0 14px; }
.tour-head h2 { font-size: 34px; margin: 2px 0 2px; letter-spacing: 3px; text-transform: uppercase; }
.tour-sub { margin: 0; color: var(--ink-dim); font-family: 'Special Elite', monospace; font-size: 14px; }
.tour-tally { display: grid; grid-template-columns: repeat(13, 14px); gap: 4px; direction: ltr; }
.tour-tally i { width: 14px; height: 18px; display: block; background: rgba(255,255,255,0.07); border: 1px solid var(--line); clip-path: polygon(50% 0, 100% 28%, 100% 100%, 0 100%, 0 28%); }
.tour-tally i.on { background: var(--khaki); border-color: var(--khaki); }
.tour-tally i.next { background: rgba(179,50,31,0.55); }
.tour-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
.tour-card { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; margin-bottom: 14px; }
.tour-card h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 3px; color: var(--khaki); font-weight: 500; font-family: 'Special Elite', monospace; text-transform: uppercase; }
.tour-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
.tour-opt { text-align: start; background: rgba(255,255,255,0.03); border: 1px solid var(--line); color: var(--ink); padding: 12px 14px; font-family: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.tour-opt.sel { border-color: var(--khaki); background: rgba(185,167,111,0.1); box-shadow: inset 0 0 0 1px var(--khaki); }
.tour-opt:focus-visible { outline: 2px solid var(--khaki); outline-offset: 2px; }
.tour-opt .t { font-size: 20px; letter-spacing: 1px; line-height: 1.15; }
.tour-opt .tg { font-family: 'Special Elite', monospace; font-size: 13px; color: var(--ink-dim); }
.tour-pips { display: inline-flex; gap: 3px; direction: ltr; vertical-align: middle; }
.tour-pips b { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.12); display: inline-block; }
.tour-pips b.on { background: #d9573f; }
.tour-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.tour-chips span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border: 1px solid var(--line); color: var(--ink-dim); }
.tour-chips span.good { color: var(--good); border-color: rgba(159,194,107,0.4); }
.tour-chips span.bad { color: var(--bad); border-color: rgba(217,87,63,0.45); }
.tour-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }
.tour-actions .btn.primary-go { font-size: 18px; padding: 12px 26px; }
.tour-note { color: var(--ink-dim); font-family: 'Special Elite', monospace; font-size: 13px; line-height: 1.5; margin: 6px 0 0; }
.tour-lines p { margin: 0 0 6px; font-size: 13px; line-height: 1.45; color: var(--ink-dim); font-family: 'Special Elite', monospace; padding-inline-start: 14px; position: relative; }
.tour-lines p::before { content: '›'; position: absolute; inset-inline-start: 2px; color: var(--khaki); }
.tour-lines p.good { color: var(--good); } .tour-lines p.bad { color: var(--bad); }
.tour-event { border-color: var(--khaki); background: linear-gradient(180deg, rgba(185,167,111,0.12), var(--panel)); }
.tour-event .et { font-size: 26px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 8px; }
.tour-event p { font-family: 'Special Elite', monospace; font-size: 15px; line-height: 1.55; margin: 0 0 12px; }
.tour-ship { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: center; }
.tour-ship svg { width: 150px; height: auto; display: block; direction: ltr; }
.tour-ship .nm { font-size: 22px; letter-spacing: 1px; }
.tour-stat { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--ink-dim); border-bottom: 1px dashed var(--line); padding: 3px 0; }
.tour-stat b { color: var(--ink); font-family: 'IBM Plex Mono', monospace; font-weight: 500; }
.tour-crew { display: flex; flex-direction: column; gap: 4px; }
.tour-man { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.tour-man img { width: 34px; height: 34px; border-radius: 50%; display: block; }
.tour-man .n { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tour-man .p { font-size: 11px; color: var(--ink-dim); letter-spacing: 1px; text-transform: uppercase; }
.tour-man .s { font-size: 11px; letter-spacing: 1px; padding: 2px 6px; border: 1px solid var(--line); white-space: nowrap; }
.tour-man .s.fit { color: var(--good); } .tour-man .s.wounded { color: var(--warn); } .tour-man .s.new { color: var(--khaki); }
.tour-man.out img { filter: grayscale(1) brightness(0.7); }
.tour-ribbons { display: inline-flex; gap: 2px; margin-inline-start: 6px; vertical-align: middle; }
.tour-ribbons i { width: 12px; height: 5px; display: inline-block; }
.tour-gauge { margin: 0 0 10px; }
.tour-gauge .r1 { display: flex; justify-content: space-between; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
.tour-gauge .bar { height: 8px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); margin: 4px 0 2px; position: relative; }
.tour-gauge .bar i { position: absolute; inset-inline-start: 0; top: 0; bottom: 0; }
.tour-foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 4px; }
.tour-log { margin-top: 10px; }
.tour-log summary { cursor: pointer; color: var(--khaki); font-family: 'Special Elite', monospace; }
.tour-log ol { margin: 8px 0 0; padding-inline-start: 22px; font-size: 13px; color: var(--ink-dim); }
.tour-log li .ok { color: var(--good); } .tour-log li .fail { color: var(--bad); }
.tour-intro { max-width: 760px; margin: 6vh auto 0; }
.tour-intro p { font-family: 'Special Elite', monospace; font-size: 16px; line-height: 1.6; color: var(--ink-dim); }
.tour-finale { text-align: center; }
.tour-finale h2 { font-size: 44px; letter-spacing: 6px; margin: 4px 0; }
.tour-cert { margin: 14px auto; max-width: 560px; background: #e8dfc6; color: #2b2518; padding: 18px 22px; border: 6px double #6b5a2a; font-family: 'Special Elite', monospace; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
.tour-cert b { display: block; font-family: 'Oswald', sans-serif; font-size: 24px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; }
.tour-fates { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; text-align: start; margin-top: 12px; }
.tour-radio { margin: 8px 0 0; font-family: 'Special Elite', monospace; font-size: 14px; color: var(--ink); border-inline-start: 3px solid var(--khaki); padding: 4px 10px; background: rgba(185,167,111,0.08); }
.tour-radio small { display: block; color: var(--khaki); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
.tour-report { margin-top: 12px; text-align: start; }
@media (max-width: 860px) {
  .tour-grid { grid-template-columns: 1fr; }
  #tour .tour { padding: 14px 16px 24px; }
  .tour-head h2 { font-size: 26px; }
  .tour-tally { grid-template-columns: repeat(13, 11px); gap: 3px; }
  .tour-tally i { width: 11px; height: 14px; }
  .tour-ship { grid-template-columns: 110px minmax(0, 1fr); }
  .tour-ship svg { width: 110px; }
}
html[lang=ar] .tour-head h2, html[lang=ar] .tour-event .et, html[lang=ar] .tour-finale h2 { letter-spacing: 0; }
`;
  document.head.appendChild(st);
}

// ---------------- pieces ----------------

const RIBBON: Record<string, string> = {
  'Air Medal': 'linear-gradient(90deg,#e8a317 0 20%,#1d3f8f 20% 80%,#e8a317 80%)',
  'Oak Leaf Cluster': 'linear-gradient(90deg,#6b5a2a,#b9a76f,#6b5a2a)',
  'Distinguished Flying Cross': 'linear-gradient(90deg,#b3321f 0 15%,#f2efe6 15% 25%,#1d3f8f 25% 75%,#f2efe6 75% 85%,#b3321f 85%)',
  'Purple Heart': 'linear-gradient(90deg,#f2efe6 0 12%,#5b2a86 12% 88%,#f2efe6 88%)',
};
function ribbons(medals: Record<string, number>) {
  const out = Object.entries(medals).filter(([k]) => RIBBON[k]).map(([k, n]) => `<i title="${esc(tx(k))}${n > 1 ? ` ×${n}` : ''}" style="background:${RIBBON[k]}"></i>`).join('');
  return out ? `<span class="tour-ribbons">${out}</span>` : '';
}

const pips = (n: number) => `<span class="tour-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= n ? 'on' : ''}"></b>`).join('')}</span>`;

function wearColor(w: number) {
  if (w <= 0.01) return '#6f7c52';
  const k = Math.min(1, w / 0.45);
  const r = Math.round(111 + (217 - 111) * k), g = Math.round(124 + (87 - 124) * k), b = Math.round(82 + (63 - 82) * k);
  return `rgb(${r},${g},${b})`;
}

/** Top view of the Fortress: each part coloured by its carried damage, the patches dotted on. */
export function shipPlanSvg(s: TourState): string {
  const w = (z: string) => wearColor(s.ship.wear[z] ?? 0);
  const part = (z: string, d: string) => `<path d="${d}" fill="${w(z)}" stroke="#1c1d14" stroke-width="1"><title>${esc(tx(ZONE_LABEL[z] ?? z))}</title></path>`;
  let patches = '';
  let h = 2166136261 >>> 0;
  const r = () => { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  for (const c of s.ship.serial) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  for (let i = 0; i < Math.min(60, s.ship.patches); i++) {
    const onWing = r() < 0.45;
    const x = onWing ? 18 + r() * 164 : 94 + r() * 12;
    const y = onWing ? 60 + r() * 14 : 30 + r() * 108;
    patches += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3.4" height="2.6" fill="#d8dcd4" stroke="#55584f" stroke-width="0.5"/>`;
  }
  return `<svg viewBox="0 0 200 170" role="img" aria-label="${esc(tx('Damage carried by the ship'))}">
    ${part('wingLtip', 'M12 62 L46 58 L46 74 L14 72 Z')}${part('wingL', 'M46 58 L92 54 L92 80 L46 74 Z')}
    ${part('wingR', 'M108 54 L154 58 L154 74 L108 80 Z')}${part('wingRtip', 'M154 58 L188 62 L186 72 L154 74 Z')}
    ${part('engine1', 'M26 46 h10 v20 h-10 Z')}${part('engine2', 'M62 44 h10 v22 h-10 Z')}${part('engine3', 'M128 44 h10 v22 h-10 Z')}${part('engine4', 'M164 46 h10 v20 h-10 Z')}
    ${part('tail', 'M62 140 L97 134 L97 126 L103 126 L103 134 L138 140 L138 150 L62 150 Z')}
    ${part('fuselageAft', 'M94 106 L106 106 L104 140 L96 140 Z')}${part('fuselageMid', 'M93 72 L107 72 L106 106 L94 106 Z')}
    ${part('fuselageFwd', 'M92 42 L108 42 L107 72 L93 72 Z')}${part('cockpit', 'M92 26 L108 26 L108 42 L92 42 Z')}${part('nose', 'M93 26 Q100 4 107 26 Z')}
    ${patches}</svg>`;
}

function gauge(label: string, v: number, word: string, color: string) {
  return `<div class="tour-gauge"><div class="r1"><span>${esc(tx(label))}</span><b>${pct(v)} · ${esc(tx(word))}</b></div><div class="bar"><i style="width:${Math.round(v)}%;background:${color}"></i></div></div>`;
}

function statusChip(m: TourMan) {
  if (m.status === 'wounded') return `<span class="s wounded">${esc(tx('Wounded · out {n}', { n: m.out }))}</span>`;
  if (m.joined > 0 && m.missions < 3) return `<span class="s new">${esc(tx('New man'))}</span>`;
  return `<span class="s fit">${esc(tx('{n} missions', { n: m.missions }))}</span>`;
}

function crewList(s: TourState) {
  return `<div class="tour-crew">${POSITIONS.map((p) => {
    const m = s.crew.find((c) => c.pos === p)!;
    return `<div class="tour-man ${m.status !== 'fit' ? 'out' : ''}"><img alt="" src="${portraitUrl(lookOf(m), 68)}"><div><div class="n">${esc(trName(manName(m)))}${ribbons(m.medals)}</div><div class="p">${esc(tx(POS_LABEL[p]))}</div></div>${statusChip(m)}</div>`;
  }).join('')}</div>`;
}

function shipCard(s: TourState) {
  const rough = roughEngines(s.ship);
  return `<section class="tour-card"><h3>${esc(tx('The ship'))}</h3><div class="tour-ship">${shipPlanSvg(s)}<div>
    <div class="nm"><bdi>${esc(ship(s.ship.name))}</bdi></div><div class="tour-note">B-17G · ${esc(s.ship.serial)}</div>
    <div class="tour-stat"><span>${esc(tx('Missions flown'))}</span><b>${s.ship.missions}</b></div>
    <div class="tour-stat"><span>${esc(tx('Repair patches'))}</span><b>${s.ship.patches}</b></div>
    <div class="tour-stat"><span>${esc(tx('Condition'))}</span><b>${shipCondition(s.ship)}%</b></div>
    ${rough.length ? `<div class="tour-chips">${rough.map((e) => `<span class="bad">${esc(tx('Engine {e} rough', { e }))}</span>`).join('')}</div>` : ''}
    ${s.lostShips.length ? `<p class="tour-note">${esc(tx('Ships lost: {names}', { names: s.lostShips.map(ship).join(', ') }))}</p>` : ''}
  </div></div></section>`;
}

function stateCard(s: TourState) {
  const f = crewFactor(s);
  return `<section class="tour-card"><h3>${esc(tx('The crew'))}</h3>
    ${gauge('Morale', s.morale, moraleLabel(s.morale), s.morale >= 50 ? 'var(--good)' : s.morale >= 30 ? 'var(--warn)' : 'var(--bad)')}
    ${gauge('Fatigue', s.fatigue, fatigueLabel(s.fatigue), s.fatigue < 55 ? 'var(--khaki)' : s.fatigue < 80 ? 'var(--warn)' : 'var(--bad)')}
    <p class="tour-note">${esc(tx('Crew gunnery {n}% of a veteran crew.', { n: Math.round(f * 100) }))}</p>
    ${crewList(s)}</section>`;
}

function reportBlock(r: TourReport | null) {
  if (!r || !r.lines.length) return '';
  return `<div class="tour-lines">${r.lines.map((l) => `<p class="${l.tone ?? ''}">${esc(lineText(l))}</p>`).join('')}</div>`;
}

/** The subtitle of a recorded tour line (the counted ones, tour_count_<n>, are not in the named table). */
export function voiceText(id: string | undefined): string | null {
  if (!id) return null;
  const count = /^tour_count_(\d+)$/.exec(id);
  if (count) return `Pilot to crew: that's number ${numberWord(+count[1])} in the books.`;
  return (VOICE_LINES as Record<string, { text: string } | undefined>)[id]?.text ?? null;
}
function radio(id: string | undefined) {
  const text = voiceText(id);
  if (!text) return '';
  return `<p class="tour-radio"><small>${esc(tx('Interphone'))}</small>${esc(tx(text))}</p>`;
}
function say(id: string | undefined) { if (id) try { voice.say(id, { priority: 2 }); } catch { /* audio unavailable */ } }

function logBlock(s: TourState) {
  if (!s.log.length) return '';
  return `<details class="tour-log"><summary>${esc(tx('Tour log ({n} sorties)', { n: s.sorties }))}</summary><ol>${s.log.map((l) => `<li><span class="${l.result === 'credited' ? 'ok' : 'fail'}">${l.result === 'credited' ? '✓' : '✗'}</span> ${esc(tx('Mission {n}', { n: l.n }))} · ${esc(tx(l.title))} · ${esc(tx(l.result === 'credited' ? 'Credited' : l.result === 'lost' ? 'Ship lost' : 'Not credited'))} · ${esc(tx('{n} kills', { n: l.kills }))}</li>`).join('')}</ol></details>`;
}

// ---------------- the screen ----------------

let selected = 0;

export function showTour(host: TourHost) {
  ensureStyle();
  const root = showLayer('tour');
  const s = loadTour();
  const back = () => host.menu();
  if (!s) { intro(root, host); onBackKey(root, back); return; }
  if (s.complete) { finaleView(root, s, host); onBackKey(root, back); return; }
  const stage = s.done;
  const st = stageOf(s);
  selected = Math.min(selected, st.options.length - 1);
  const tally = Array.from({ length: TOUR_LENGTH }, (_, i) => `<i class="${i < s.done ? 'on' : i === s.done ? 'next' : ''}"></i>`).join('');
  const ev = eventById(s.event);
  const escort = escortFor(st.date);
  const orders = ev ? `<section class="tour-card tour-event" data-event="${ev.id}"><h3>${esc(tx('Between missions'))}</h3><div class="et">${esc(tx(ev.title))}</div><p>${esc(tx(ev.text, { ship: ship(s.ship.name) }))}</p>
      ${radio(ev.voice)}
      <div class="tour-actions">${ev.choices.map((c, i) => `<button class="btn ${i ? 'ghost' : ''}" data-choice="${i}">${esc(tx(c.label, { ship: ship(s.ship.name) }))}</button>`).join('')}</div></section>`
    : `<section class="tour-card"><h3>${esc(tx('Field orders · {date}', { date: tx(st.date) }))}</h3>
      <div class="tour-opts" role="radiogroup" aria-label="${esc(tx('Choose the target'))}">${st.options.map((o, i) => {
        const d = effectiveDanger(stage, o, s.maxEffort);
        return `<button class="tour-opt ${i === selected ? 'sel' : ''}" role="radio" aria-checked="${i === selected}" data-opt="${i}">
          <span class="t">${esc(tx(o.title))}</span><span class="tg">${esc(tx(`${o.what}, ${o.city}`))}</span>
          <span>${pips(d)} <small>${esc(tx(DANGER_LABEL[d]))}</small></span>
          <span class="tour-chips"><span>${esc(tx(STATIONS[o.station].label))}</span><span class="${escort === 'none' ? 'bad' : 'good'}">${esc(tx(escort === 'full' ? 'Mustang escort' : escort === 'partial' ? 'Escort to the border' : 'No escort'))}</span>${o.finale ? `<span class="good">${esc(tx('Last mission'))}</span>` : ''}</span>
        </button>`;
      }).join('')}</div>
      ${s.maxEffort ? `<p class="tour-note">${esc(tx('Maximum effort: danger +1, merit ×1.5.'))}</p>` : ''}
      <div class="tour-actions"><button class="btn primary-go" data-fly>${esc(tx('Fly this mission'))}</button>
        <button class="btn ghost" data-rest ${s.rested ? 'disabled' : ''}>${esc(tx('Stand down a day'))}</button></div>
      <p class="tour-note">${esc(tx(s.rested ? 'The crew has had its rest. The next sortie is waiting.' : 'A stand-down lowers fatigue and lets the wounded heal, once between missions.'))}</p>
      ${s.report ? `<div class="tour-report"><h3>${esc(tx('Latest'))}</h3>${reportBlock(s.report)}</div>` : ''}
      ${logBlock(s)}</section>`;
  root.innerHTML = `<div class="tour">
    <button class="btn ghost menu-back" data-back>${esc(tx('Back'))}</button>
    <div class="tour-head"><div><div class="kicker">${esc(tx('THE TOUR · 25 MISSIONS'))}</div>
      <h2>${esc(tx('Mission {n} of 25', { n: stage + 1 }))}</h2><p class="tour-sub">${esc(tx(st.date))} · ${esc(tx('{n} sorties flown', { n: s.sorties }))}</p></div>
      <div class="tour-tally" aria-label="${esc(tx('{n} of 25 missions credited', { n: s.done }))}">${tally}</div></div>
    <div class="tour-grid"><div>${orders}</div><div>${shipCard(s)}${stateCard(s)}</div></div>
    <div class="tour-foot"><button class="btn ghost" data-abandon>${esc(tx('Abandon the tour'))}</button></div>
  </div>`;
  root.querySelector<HTMLElement>('[data-back]')!.onclick = back;
  root.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => b.onclick = () => { selected = +b.dataset.opt!; showTour(host); root.querySelector<HTMLElement>(`[data-opt="${selected}"]`)?.focus(); });
  root.querySelector<HTMLElement>('[data-fly]')?.addEventListener('click', () => {
    const cur = loadTour();
    if (!cur || cur.event || cur.complete) { showTour(host); return; }
    host.briefing(tourMission(cur, cur.done, selected), () => showTour(host));
  });
  root.querySelector<HTMLElement>('[data-rest]')?.addEventListener('click', () => { const cur = loadTour(); if (cur) { saveTour(standDown(cur)); showTour(host); } });
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => b.onclick = () => {
    const cur = loadTour(); if (!cur) return;
    saveTour(resolveEvent(cur, +b.dataset.choice!)); showTour(host);
  });
  const abandon = root.querySelector<HTMLButtonElement>('[data-abandon]')!;
  abandon.onclick = () => {
    if (abandon.dataset.armed) { saveTour(null); selected = 0; showTour(host); return; }
    abandon.dataset.armed = '1'; abandon.textContent = tx('Press again to abandon the tour');
  };
  if (ev?.voice && root.dataset.voiced !== ev.id) { root.dataset.voiced = ev.id; say(ev.voice); }
  onBackKey(root, back);
}

function intro(root: HTMLElement, host: TourHost) {
  root.innerHTML = `<div class="tour"><button class="btn ghost menu-back" data-back>${esc(tx('Back'))}</button><div class="tour-intro tour-card">
    <div class="kicker">${esc(tx('THE TOUR · 25 MISSIONS'))}</div><h2>${esc(tx('A tour of duty'))}</h2>
    <p>${esc(tx('Twenty-five missions, one Fortress, one crew. Damage stays with the ship until the ground crew patches it, wounded men miss missions, and the men you lose are replaced by rookies.'))}</p>
    <p>${esc(tx('Pick each target from the field orders as the air war moves from Emden to Berlin. Watch morale and fatigue, and bring them home after mission twenty-five.'))}</p>
    <div class="tour-actions"><button class="btn primary-go" data-begin>${esc(tx('Begin the tour'))}</button></div></div></div>`;
  root.querySelector<HTMLElement>('[data-back]')!.onclick = () => host.menu();
  root.querySelector<HTMLElement>('[data-begin]')!.onclick = () => { selected = 0; saveTour(newTour()); showTour(host); };
}

function fateList(title: string, men: TourMan[]) {
  if (!men.length) return '';
  return `<section class="tour-card"><h3>${esc(tx(title))}</h3>${men.map((m) => `<div class="tour-man"><img alt="" src="${portraitUrl(lookOf(m), 68)}"><div><div class="n">${esc(trName(manName(m)))}${ribbons(m.medals)}</div><div class="p">${esc(tx(POS_LABEL[m.pos]))} · ${esc(tx('{n} missions', { n: m.missions }))}</div></div><span></span></div>`).join('')}</section>`;
}

function finaleView(root: HTMLElement, s: TourState, host: TourHost) {
  const f = finale(s);
  const medals = Object.entries(f.medals).map(([k, n]) => `${tx(k)}${n > 1 ? ` ×${n}` : ''}`).join(' · ');
  root.innerHTML = `<div class="tour tour-finale"><button class="btn ghost menu-back" data-back>${esc(tx('Back'))}</button>
    <div class="kicker">${esc(tx('THE TOUR · 25 MISSIONS'))}</div><h2>${esc(tx('Going Home'))}</h2>
    <p class="tour-sub">${esc(tx('Twenty-five missions. The crew climbs out of the {ship} for the last time.', { ship: ship(s.ship.name) }))}</p>
    ${radio('tour_home')}
    <div class="tour-cert"><b>${esc(tx('Lucky Bastard Club'))}</b>${esc(tx('This certifies that the bearer has completed a combat tour of twenty-five missions over enemy territory with the 401st Bomb Squadron.'))}</div>
    <div class="tour-card" style="max-width:760px;margin:0 auto">
      <div class="tour-stat"><span>${esc(tx('Sorties flown'))}</span><b>${f.sorties}</b></div>
      <div class="tour-stat"><span>${esc(tx('Confirmed kills'))}</span><b>${f.kills}</b></div>
      <div class="tour-stat"><span>${esc(tx('Fortresses'))}</span><b><bdi>${esc(f.ships.map(ship).join(', '))}</bdi></b></div>
      <div class="tour-stat"><span>${esc(tx('Repair patches'))}</span><b>${f.patches}</b></div>
      <div class="tour-stat"><span>${esc(tx('Medals'))}</span><b>${esc(medals || '—')}</b></div>
    </div>
    <div class="tour-fates">${fateList('Going home with you', f.home)}${fateList('Sent home wounded', f.wounded)}${fateList('Remembered', f.fallen)}</div>
    <div class="tour-actions" style="justify-content:center"><button class="btn primary-go" data-new>${esc(tx('Begin a new tour'))}</button><button class="btn ghost" data-menu>${esc(tx('Main menu'))}</button></div>
  </div>`;
  root.querySelector<HTMLElement>('[data-back]')!.onclick = () => host.menu();
  root.querySelector<HTMLElement>('[data-menu]')!.onclick = () => host.menu();
  root.querySelector<HTMLElement>('[data-new]')!.onclick = () => { selected = 0; saveTour(newTour()); showTour(host); };
  if (root.dataset.voiced !== 'finale') { root.dataset.voiced = 'finale'; say('tour_home'); }
}

// ---------------- the briefing ----------------

/** BriefingExtras.decorateBriefing: the Tour's kicker and the crew's current ship on the sheet. */
export function decorateTourBriefing(sheet: HTMLElement) {
  const s = loadTour();
  const k = sheet.querySelector<HTMLElement>('.kicker');
  if (k) k.textContent = tx('THE TOUR') + ' · ' + k.textContent;
  const name = sheet.querySelector<HTMLElement>('.target bdi');
  if (s && name) name.textContent = `B-17G "${ship(s.ship.name)}"`;
}

// ---------------- entry points ----------------

let opener: (() => void) | null = null;
/** Game registers how to open the Tour from the campaign map (back returns to the map). */
export function registerTourOpener(f: () => void) { opener = f; }
/** The campaign map's and summary's footer: a button into the Tour. */
export function mountTourAccess(root: HTMLElement) {
  const foot = root.querySelector('.cm-foot');
  if (!foot || !opener || foot.querySelector('[data-tour-entry]')) return;
  const b = document.createElement('button');
  b.className = 'btn'; b.dataset.tourEntry = '';
  b.textContent = tx('The Tour · 25 missions');
  b.onclick = () => opener?.();
  foot.appendChild(b);
}

// ---------------- the debrief ----------------

/** End of showDebrief for a tour mission: the tour report and the way back to the tour. */
export function mountTourReport(res: { state: TourState; report: TourReport }, openTour: () => void, speak = true) {
  ensureStyle();
  const host = document.querySelector<HTMLElement>('#debrief .box');
  if (!host) return;
  host.querySelector('.lb-panel')?.remove();
  host.querySelector<HTMLElement>('[data-a="retry"]')?.remove();   // a tour sortie is booked once; the next one starts from the tour
  const s = res.state, r = res.report;
  const box = document.createElement('div');
  box.className = 'tour-card tour-report';
  box.dataset.tourReport = '';
  box.innerHTML = `<h3>${esc(tx('The Tour · {n} of 25 missions credited', { n: s.done }))}</h3>${radio(r.voice)}${reportBlock(r)}
    <div class="tour-actions"><button class="btn" data-tour>${esc(tx(s.complete ? 'Going Home' : 'Back to the tour'))}</button></div>`;
  const row = host.querySelector('.row');
  if (row) row.before(box); else host.appendChild(box);
  box.querySelector<HTMLElement>('[data-tour]')!.onclick = openTour;
  if (speak) setTimeout(() => say(r.voice), 900);
}
