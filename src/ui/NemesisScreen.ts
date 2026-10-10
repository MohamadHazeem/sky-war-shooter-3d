// "Luftwaffe Experten": the group intelligence officer's file on the named German aces
// (game/Nemesis.ts). Opened from the Career screen and the campaign map. A paper sheet like
// the Career record: the most wanted man with his bounty, a dossier card for every ace on
// strength (photo silhouette, rank and name, unit, aircraft, colours and emblem, victories,
// style, status, patches and grudge, and his history with the player: who wounded whom,
// escapes, shoot-downs), and the file of those killed in action.
import {
  type AceRecord, type EmblemId, type NemesisState, ACE_RANKS, COLOURS, EMBLEMS, TRAITS, bounty, encounterText, loadNemesis, mostWanted, record,
  MOST_WANTED_MULT, rankName, personName, fullRankName, unitLabel, traitLabel, placeLabel,
} from '../game/Nemesis';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { num, tx, isAr } from '../i18n';
import './career.css';

const AC: Record<string, string> = { fw190: 'Fw 190 A-8', bf109: 'Bf 109 G-6', me262: 'Me 262 A-1a', me410: 'Me 410 A-1' };

// The emblem as an inline SVG in his colour
export function emblemSvg(id: EmblemId, color: string, size = 24): string {
  const e = EMBLEMS[id] ?? EMBLEMS.star;
  const dark = color === '#1d1d1d';
  return `<svg class="nem-emb" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="${color}" stroke="rgba(0,0,0,0.6)" stroke-width="2"/><g transform="translate(9 9) scale(0.72)"><path d="${e.d}" fill="${dark ? '#efefe8' : '#141410'}" fill-rule="evenodd"/></g></svg>`;
}

// A portrait silhouette: a pilot in a flying helmet and goggles against his colour; patches
// show as sticking plaster, a grudge as a red glare, a fallen ace in grey with a black band
export function portraitSvg(a: AceRecord, size = 72): string {
  const dead = a.status === 'dead';
  const bg = dead ? '#6d6a60' : a.color;
  const ink = dead ? '#2a2925' : '#17150f';
  const scar = a.scars > 0 ? `<path d="M40 30 L50 40" stroke="#d9c7a3" stroke-width="3" stroke-linecap="round"/><path d="M41 37 L48 33" stroke="#d9c7a3" stroke-width="2" stroke-linecap="round"/>` : '';
  const glare = a.grudge > 0 && !dead ? `<circle cx="38" cy="33" r="${1.4 + a.grudge * 0.5}" fill="#ff4a2a"/>` : '';
  const band = dead ? `<path d="M50 0 L64 0 L64 14 Z" fill="#111"/>` : '';
  return `<svg class="nem-pic" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" fill="${bg}"/><rect width="64" height="64" fill="url(#nemShade)" opacity="0.35"/>
    <defs><radialGradient id="nemShade" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient></defs>
    <path d="M10 64 C12 52 20 47 32 46 C44 47 52 52 54 64 Z" fill="${ink}"/>
    <path d="M22 50 L32 58 L42 50 L40 47 L32 52 L24 47 Z" fill="${dead ? '#55524a' : '#3d3a30'}"/>
    <path d="M18 34 C17 20 23 11 33 11 C43 11 49 20 47 34 C46 42 40 47 32 47 C24 47 19 42 18 34 Z" fill="${ink}"/>
    <path d="M16 30 C18 18 26 9 33 9 C41 9 48 17 49 30 L46 31 C44 21 39 15 33 15 C26 15 21 21 19 31 Z" fill="${dead ? '#3a3832' : '#2a2619'}"/>
    <rect x="20" y="22" width="25" height="7" rx="3.5" fill="${dead ? '#4a4840' : '#5b543c'}" stroke="${ink}" stroke-width="1.5"/>
    <circle cx="27" cy="25.5" r="3.4" fill="${dead ? '#77736a' : '#9fb7c0'}" opacity="0.85"/><circle cx="38" cy="25.5" r="3.4" fill="${dead ? '#77736a' : '#9fb7c0'}" opacity="0.85"/>
    ${glare}${scar}${band}
  </svg>`;
}

function statusLine(a: AceRecord, st: NemesisState): string {
  if (a.status === 'dead') return `<span class="nem-st kia">${tx('Killed in action')}</span>`;
  if (a.status === 'injured') return `<span class="nem-st hosp">${tx('In hospital · back in {n} missions', { n: Math.max(1, a.returnAt - st.missions) })}</span>`;
  return `<span class="nem-st on">${tx('On strength')}</span>`;
}

const pips = (n: number, max: number, cls: string) => `<span class="nem-pips ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

function card(a: AceRecord, st: NemesisState, wanted: boolean): string {
  const r = record(a);
  const t = TRAITS[a.trait];
  const colour = COLOURS.find((c) => c.hex === a.color);
  const hist = [...a.history].reverse().slice(0, 5).map((e) => `<li>${esc(encounterText(e))}</li>`).join('');
  const sep = isAr() ? '، ' : ', ';
  const stats = [
    r.met ? tx('{n} encounters', { n: r.met }) : tx('Never met'),
    r.wounded.length ? tx('wounded {crew}', { crew: r.wounded.map((x) => tx(x)).join(sep) }) : '',
    r.downedUs ? tx('shot you down ×{n}', { n: r.downedUs }) : '',
    r.escapes ? tx('escaped you ×{n}', { n: r.escapes }) : '',
  ].filter(Boolean).join(' · ');
  const price = a.status === 'dead' ? '' : `<div class="nem-price">${wanted ? tx('Bounty: {n} merit', { n: num(bounty(a) * MOST_WANTED_MULT) }) : tx('Price on his head: {n} merit', { n: num(bounty(a)) })}</div>`;
  return `<div class="nem-card ${a.status} ${wanted ? 'wanted' : ''}" style="--nc:${a.color}">
    ${wanted ? `<div class="svc-stamp nem-wanted">${tx('MOST WANTED')}</div>` : ''}
    <div class="nem-top">
      <div class="nem-photo">${portraitSvg(a, 76)}</div>
      <div class="nem-id">
        <div class="nem-rank">${esc(rankName(a.rank))}</div>
        <div class="nem-name">${esc(personName(a))}</div>
        <div class="nem-unit">${esc(unitLabel(a.unit))} · ${esc(AC[a.type] ?? a.type)}</div>
        <div class="nem-vic"><b>${a.victories}</b> ${tx('victories')}</div>
      </div>
      <div class="nem-mark" title="${esc(tx(EMBLEMS[a.emblem].label))}">${emblemSvg(a.emblem, a.color, 40)}<small>${esc(tx(colour?.name ?? ''))}</small></div>
    </div>
    <div class="nem-trait"><b>${esc(traitLabel(a.trait))}</b> — ${esc(tx(t.blurb))}</div>
    <div class="nem-row">${statusLine(a, st)}<span>${tx('Patches')} ${pips(a.scars, 4, 'sc')}</span><span>${tx('Grudge')} ${pips(a.grudge, 3, 'gr')}</span></div>
    ${a.promotedFrom ? `<div class="nem-note">${esc(tx('Took over from {name}', { name: promotedFromLabel(a.promotedFrom) }))}</div>` : ''}
    <div class="nem-hist"><div class="nem-hk">${tx('HISTORY WITH YOU')}</div><div class="nem-stats">${esc(stats)}</div>${hist ? `<ul>${hist}</ul>` : ''}</div>
    ${price}
  </div>`;
}

// 'Hptm. Heinz Dorn' (stored English) -> localised
function promotedFromLabel(s: string): string {
  const [short, first, last] = s.split(' ');
  const r = ACE_RANKS.findIndex((x) => x.short === short);
  return r >= 0 && first && last ? `${tx(ACE_RANKS[r].short)} ${tx(first)} ${tx(last)}` : s;
}

export function showNemesisScreen(h: { back(): void }) {
  injectCss();
  const st = loadNemesis();
  const el = showLayer('svc-nemesis');
  const wanted = mostWanted(st);
  const order = [...st.aces].sort((a, b) => (a.status === b.status ? bounty(b) - bounty(a) : a.status === 'active' ? -1 : 1));
  const cards = order.map((a) => card(a, st, a === wanted)).join('');
  const fallen = st.fallen.map((a) => card(a, st, false)).join('');
  const w = wanted;
  const wantedBlock = w ? `<div class="nem-mw">
      <div class="nem-mw-pic">${portraitSvg(w, 96)}</div>
      <div><div class="svc-k">${tx('MOST WANTED')}</div>
      <div class="nem-mw-n">${esc(fullRankName(w))}</div>
      <div class="nem-mw-d">${esc(unitLabel(w.unit))} · ${esc(AC[w.type] ?? w.type)} · ${tx('{n} victories', { n: w.victories })} · ${esc(traitLabel(w.trait))}</div>
      <div class="nem-mw-b">${tx('Bounty: {n} merit', { n: num(bounty(w) * MOST_WANTED_MULT) })}</div></div>
    </div>` : '';
  const last = st.last;
  const lastLine = last ? tx('Last sighting: {mission} · over {place}', { mission: tx(last.mission), place: placeLabel(last.place) }) : tx('No Experten met yet. Intelligence expects them on every big raid.');
  el.innerHTML = `<div class="screen-center"><div class="svc-sheet nem-sheet">
    <div class="svc-stamp svc-stamp-tr">${tx('SECRET')}</div>
    <div class="svc-hdr"><span>${tx('401ST BOMB SQUADRON · S-2 INTELLIGENCE')}</span><span>${tx('ENEMY PERSONALITIES FILE')}</span></div>
    <h2 class="svc-title">${tx('Luftwaffe Experten')}</h2>
    <div class="svc-xpline">${tx('Experten shot down by you: <b>{n}</b>', { n: st.kills })} · ${esc(lastLine)}</div>
    ${wantedBlock}
    <div class="svc-sec">${tx('I. ON STRENGTH · {n}', { n: st.aces.length })}</div>
    <div class="nem-grid">${cards}</div>
    ${fallen ? `<div class="svc-sec">${tx('II. KILLED IN ACTION · {n}', { n: st.fallen.length })}</div><div class="nem-grid">${fallen}</div>` : ''}
    <div class="row svc-actions"><button class="btn ghost" data-back>${tx('Back')}</button></div>
  </div></div>`;
  el.querySelector('[data-back]')!.addEventListener('click', h.back);
  onBackKey(el, h.back);
}

let css = false;
function injectCss() {
  if (css || typeof document === 'undefined') return;
  css = true;
  const s = document.createElement('style');
  s.id = 'nemesis-screen-css';
  s.textContent = `
#svc-nemesis { z-index: 12; }
.nem-sheet { width: min(1040px, 100%); }
.nem-mw { display: flex; gap: 16px; align-items: center; margin: 14px 0 4px; padding: 10px 12px; border: 2px solid rgba(160,30,20,0.75); background: rgba(160,30,20,0.06); }
.nem-mw-pic { flex: none; border: 2px solid rgba(43,37,24,0.7); line-height: 0; }
.nem-mw-n { font-family: Oswald, sans-serif; font-size: 24px; letter-spacing: 1px; text-transform: uppercase; }
.nem-mw-d { font-size: 13px; margin-top: 2px; }
.nem-mw-b { font-family: Oswald, sans-serif; font-size: 18px; color: #8a1e14; margin-top: 4px; }
.nem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.nem-card { position: relative; border: 1px solid rgba(43,37,24,0.55); border-top: 5px solid var(--nc); background: rgba(255,255,255,0.16); padding: 10px 12px 10px; font-size: 13px; }
.nem-card.dead { opacity: 0.72; border-top-color: #444; filter: grayscale(0.6); }
.nem-card.injured { background: rgba(255,255,255,0.08); }
.nem-card.wanted { box-shadow: inset 0 0 0 2px rgba(160,30,20,0.7); }
.nem-wanted { position: absolute; left: 30px; top: 72px; transform: rotate(-9deg); font-size: 12px; z-index: 1; background: rgba(240,232,210,0.7); }
.nem-top { display: flex; gap: 10px; align-items: flex-start; }
.nem-photo { flex: none; border: 2px solid rgba(43,37,24,0.65); line-height: 0; box-shadow: 2px 2px 0 rgba(0,0,0,0.15); }
.nem-id { flex: 1; min-width: 0; }
.nem-rank { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; }
.nem-name { font-family: Oswald, sans-serif; font-size: 19px; letter-spacing: 0.5px; line-height: 1.15; }
.nem-unit { font-size: 12px; color: #1d2a55; }
.nem-vic { font-size: 12px; margin-top: 2px; } .nem-vic b { font-family: Oswald, sans-serif; font-size: 18px; color: #8a1e14; }
.nem-mark { flex: none; text-align: center; font-size: 10px; } .nem-mark small { display: block; opacity: 0.7; }
.nem-trait { margin-top: 7px; line-height: 1.35; }
.nem-row { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; margin-top: 6px; font-size: 11.5px; }
.nem-st { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 1px; padding: 1px 6px; border: 1px solid currentColor; }
.nem-st.on { color: #2c5a2a; } .nem-st.hosp { color: #8a5a10; } .nem-st.kia { color: #8a1e14; }
.nem-pips { display: inline-flex; gap: 2px; vertical-align: middle; } .nem-pips i { width: 8px; height: 8px; border: 1px solid rgba(43,37,24,0.7); display: inline-block; }
.nem-pips.sc i.on { background: #9a9d9f; } .nem-pips.gr i.on { background: #b3261b; }
.nem-note { font-size: 11.5px; margin-top: 4px; font-style: italic; }
.nem-hist { margin-top: 7px; border-top: 1px dotted rgba(43,37,24,0.5); padding-top: 5px; }
.nem-hk { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 2px; opacity: 0.65; }
.nem-stats { font-size: 12px; color: #1d2a55; margin: 2px 0; }
.nem-hist ul { margin: 2px 0 0; padding-left: 16px; } .nem-hist li { font-size: 12px; line-height: 1.35; margin: 2px 0; }
.nem-price { margin-top: 6px; font-family: Oswald, sans-serif; font-size: 13px; letter-spacing: 0.5px; color: #8a1e14; text-align: right; }
html[dir="rtl"] .nem-price { text-align: left; }
html[dir="rtl"] .nem-hist ul { padding-left: 0; padding-right: 16px; }
html[dir="rtl"] .nem-wanted { left: auto; right: 30px; transform: rotate(9deg); }
html[lang="ar"] .nem-rank, html[lang="ar"] .nem-hk { letter-spacing: 0; }
html[lang="ar"] .nem-card, html[lang="ar"] .nem-mw { font-family: 'Noto Naskh Arabic', serif; }
html[lang="ar"] .nem-name, html[lang="ar"] .nem-mw-n { font-family: 'Noto Kufi Arabic', sans-serif; }
@media (max-width: 640px) { .nem-sheet { padding: 22px 16px; } .nem-grid { grid-template-columns: 1fr; } }
`;
  document.head.appendChild(s);
}
