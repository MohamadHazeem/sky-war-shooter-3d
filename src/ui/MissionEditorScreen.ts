// Mission editor screens (Phase 11 goal 27; logic in game/MissionEditor.ts):
//   - the "Mission Editor" tab on the Survival screen (More modes): new mission, open a code or
//     link, and the library of my and shared missions (fly, edit, share, rate, remove);
//   - the editor itself (layer #me-screen);
//   - the shared-mission card a ?mission=CODE link opens on the title screen (#me-shared);
//   - the rating strip on the debrief of a player mission.
// Importing this module registers the mode. Every text a code carries is escaped; the only free
// text (the name) is already reduced to letters, digits and plain punctuation by cleanName().
import {
  BOMBERS, DECODE_ERROR_TEXT, DEFAULT_SPEC, ESCORT_LABEL, ESCORTS, FLAK_LABEL, FROM_LABEL, FROMS, LEG_LABEL, LEGS, NAME_MAX, ROUTE_LABEL, ROUTE_SECONDS, ROUTES,
  TARGETS, USER_MISSION_ID, WAVE_COUNT, WAVES_MAX, type EditorWave, type LibraryEntry, type MissionSpec,
  addToLibrary, buildUserMission, decodeMission, describeSpec, encodeMission, enemyName, linkCode, loadDraft, loadLibrary, missionTitle,
  rateMission, recordPlay, removeFromLibrary, sanitizeSpec, saveDraft, shareLink, totalFighters, userMissionCode, withoutLinkCode,
} from '../game/MissionEditor';
import { ALL_ENEMIES, DUSK_MAX_SUN, LIMITS, MOOD_LABEL, MOODS, SEATS, SKILL_DEF, SKILLS, timeOfDayLabel, type Mood } from '../game/CustomBattle';
import { type ModeDef, registerMode } from '../game/Modes';
import type { Mission } from '../game/Missions';
import type { DebriefData } from './UI';
import { STATIONS } from '../world/B17Layout';
import { injectCss as injectBattleCss } from './CustomBattleScreen';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { tx } from '../i18n';

function injectCss() {
  injectBattleCss();
  if (document.getElementById('me-css')) return;
  const st = document.createElement('style');
  st.id = 'me-css';
  st.textContent = `
#me-screen .box, #me-shared .box { width: min(820px, 100%); max-height: 92vh; overflow: auto; padding: 24px 30px; text-align: left; }
@media (max-width: 640px) { #me-screen .box, #me-shared .box { padding: 18px 14px; } }
.me-top { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 10px; }
@media (max-width: 640px) { .me-top { grid-template-columns: 1fr; } }
.me-in, .me-sel { background: rgba(0,0,0,0.3); color: var(--ink); border: 1px solid var(--line); padding: 8px 10px; font: inherit; font-size: 15px; width: 100%; box-sizing: border-box; }
.me-in:focus, .me-sel:focus { border-color: var(--khaki); outline: none; }
.me-waves { display: flex; flex-direction: column; gap: 8px; }
.me-wave { border: 1px solid var(--line); background: rgba(0,0,0,0.18); padding: 8px 10px; display: grid; grid-template-columns: auto 1fr 1fr 1.2fr auto; gap: 8px; align-items: center; }
.me-wave .n { grid-area: 1 / 1; } .me-wave [data-w=leg] { grid-area: 1 / 2; } .me-wave [data-w=from] { grid-area: 1 / 3; } .me-wave .cnt { grid-area: 1 / 4; } .me-wave .x { grid-area: 1 / 5; }
.me-wave .n { font-family: 'Special Elite', monospace; color: var(--khaki); font-size: 13px; }
.me-wave .types { grid-area: 2 / 2 / 3 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.me-wave .types button { background: rgba(0,0,0,0.25); color: var(--ink-dim); border: 1px solid var(--line); padding: 3px 7px; font: inherit; font-size: 12px; cursor: pointer; }
.me-wave .types button.on { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
.me-wave .cnt { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-dim); }
.me-wave .cnt input { flex: 1; min-width: 60px; accent-color: var(--khaki); }
.me-wave .x { background: none; border: 1px solid var(--line); color: var(--ink-dim); cursor: pointer; font: inherit; padding: 4px 9px; }
.me-wave .x:hover { color: #e07a5f; border-color: #e07a5f; }
@media (max-width: 640px) {
  .me-wave { grid-template-columns: 1fr 1fr auto; }
  .me-wave .n { grid-area: 1 / 1 / 2 / -1; } .me-wave [data-w=leg] { grid-area: 2 / 1; } .me-wave [data-w=from] { grid-area: 2 / 2; } .me-wave .x { grid-area: 2 / 3; }
  .me-wave .cnt { grid-area: 3 / 1 / 4 / -1; } .me-wave .types { grid-area: 4 / 1 / 5 / -1; }
}
/* the sticky Back stays opaque over the scrolled sheet */
#me-screen .btn.menu-back, #me-shared .btn.menu-back { background: var(--panel-solid, #202720); }
.me-share { margin-top: 12px; display: flex; gap: 8px; align-items: center; }
.me-share input { flex: 1; min-width: 0; font-family: monospace; font-size: 12px; }
.me-err { color: #e07a5f; font-size: 13px; margin: 6px 0 0; min-height: 1em; }
.me-lib { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; max-height: 46vh; overflow: auto; }
.me-item { border: 1px solid var(--line); background: rgba(0,0,0,0.2); padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; }
.me-item .t { color: var(--ink); font-size: 15px; }
.me-item .t small { color: var(--khaki); font-size: 11px; letter-spacing: 1px; margin-inline-start: 6px; text-transform: uppercase; }
.me-item .s { color: var(--ink-dim); font-size: 12px; grid-column: 1; }
.me-item .a { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.me-item .a button, .me-mini { background: rgba(0,0,0,0.25); color: var(--ink); border: 1px solid var(--line); padding: 5px 9px; font: inherit; font-size: 12px; letter-spacing: 1px; cursor: pointer; }
.me-item .a button:hover, .me-mini:hover { border-color: var(--khaki); color: var(--khaki); }
.me-item .a button.fly { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
.me-stars { display: inline-flex; gap: 1px; direction: ltr; }
.me-stars button { background: none; border: none; color: #8a7d55; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 1px; }
.me-stars button.on { color: #e2b33c; }
.me-stars.big button { font-size: 28px; }
.me-open { display: flex; gap: 8px; margin-top: 10px; }
.me-open input { flex: 1; min-width: 0; }
.me-rate { margin-top: 14px; padding: 10px 12px; border: 1px solid rgba(226,179,60,0.45); background: rgba(0,0,0,0.2); display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.me-rate .k { font-family: 'Special Elite', monospace; color: #e2b33c; letter-spacing: 2px; font-size: 12px; }
.me-rate .s { color: var(--ink-dim); font-size: 13px; flex: 1; min-width: 160px; }
.me-card ul { margin: 8px 0 0; padding-inline-start: 18px; color: var(--ink-dim); font-size: 14px; line-height: 1.6; }
html[dir=rtl] #me-screen .box, html[dir=rtl] #me-shared .box { text-align: right; }
html[lang=ar] .me-wave .n, html[lang=ar] .me-rate .k { font-family: 'Special Elite', 'Noto Naskh Arabic', monospace; }
`;
  document.head.appendChild(st);
}

const stars = (n: number, cls = '') => `<span class="me-stars ${cls}" role="group" aria-label="${esc(tx('Your rating'))}">${[1, 2, 3, 4, 5].map((i) =>
  `<button type="button" data-star="${i}" class="${i <= n ? 'on' : ''}" aria-label="${esc(tx(`Rate ${i} of 5`))}">${i <= n ? '★' : '☆'}</button>`).join('')}</span>`;
const sunLabel = (el: number, mood: Mood) => mood === 'dusk' ? `${tx('dusk')} · ${Math.min(el, DUSK_MAX_SUN)}°` : `${tx(timeOfDayLabel(el))} · ${el}°`;
// '3 times', 'once' (the record line on the card, the library and the debrief). Counts are filled in
// before tx(): the Arabic table's patterns pick the counted noun forms from the number.
const flown = (n: number, b: number) => tx(n === 1 ? `Flown once · best ${b}` : `Flown ${n} times · best ${b}`);
const summary = (s: MissionSpec) => describeSpec(s).map((p) => tx(p)).join(' · ');
const linkFor = (code: string) => shareLink(typeof location !== 'undefined' && /^https?:/.test(location.href) ? location.href : 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev/', code);

// Copy the share link; the field next to the button keeps it visible (and selected) either way
function copyLink(btn: HTMLButtonElement, field: HTMLInputElement | null, link: string) {
  if (field) { field.value = link; field.select(); }
  const done = (ok: boolean) => { btn.textContent = tx(ok ? 'Link copied' : 'Copy the link above'); setTimeout(() => { if (btn.isConnected) btn.textContent = tx('Copy link'); }, 2200); };
  try { navigator.clipboard.writeText(link).then(() => done(true), () => done(false)); } catch { done(false); }
}

// ---------------- the editor ----------------
export interface EditorOpts {
  start(m: Mission): void;
  back(): void;
  spec?: MissionSpec;     // edit this one (else the saved draft)
}

export function showMissionEditor(o: EditorOpts) {
  injectCss();
  const el = showLayer('me-screen');
  let s: MissionSpec = sanitizeSpec(o.spec ?? loadDraft());
  const seg = <T extends string | number>(key: string, list: readonly T[], label: (v: T) => string) =>
    `<div class="cb-seg" data-seg="${key}">${list.map((v) => `<button type="button" data-v="${esc(String(v))}">${esc(label(v))}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="screen-center"><div class="box panel">
    <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
    <div class="kicker">${tx('MISSION EDITOR · B-17 GUNNER')}</div><h2 class="h2">${tx('Build a mission')}</h2>
    <div class="me-top">
      <div class="cb-f"><div class="cb-l">${tx('Mission name')}</div><input class="me-in" data-name maxlength="${NAME_MAX * 2}" placeholder="${esc(tx('Optional'))}"/></div>
      <div class="cb-f"><div class="cb-l">${tx('Target')}</div><select class="me-sel" data-target>${TARGETS.map((t, i) => `<option value="${i}">${esc(tx(t))}</option>`).join('')}</select></div>
    </div>
    <div class="cb-grid" data-grid>
      <details class="settings-group wide" open><summary>${tx('Enemy waves')}</summary><div class="cb-grid">
        <div class="cb-f wide"><div class="cb-l">${tx('Enemy skill')} <b data-out="skill"></b></div>${seg('skill', SKILLS, (v) => tx(SKILL_DEF[v].label))}</div>
        <div class="cb-f wide"><div class="me-waves" data-waves></div>
          <div class="cb-actions" style="justify-content:flex-start;margin-top:6px"><button class="btn ghost" data-add>${tx('Add wave')}</button><span class="cb-note" data-out="total"></span></div></div>
      </div></details>
      <details class="settings-group wide"><summary>${tx('Route & sky')}</summary><div class="cb-grid">
        <div class="cb-f"><div class="cb-l">${tx('Route length')} <b data-out="route"></b></div>${seg('route', ROUTES, (v) => tx(ROUTE_LABEL[v]))}</div>
        <div class="cb-f"><div class="cb-l">${tx('Time of day')} <b data-out="sunEl"></b></div>
          <input type="range" data-k="sunEl" min="${LIMITS.sunEl[0]}" max="${LIMITS.sunEl[1]}" step="1" aria-label="${tx('Sun elevation: dawn to noon')}"/>
          <div class="cb-pair cb-scale"><span>${tx('dawn / dusk')}</span><span>${tx('morning')}</span><span>${tx('noon')}</span></div></div>
        <div class="cb-f wide"><div class="cb-l">${tx('Weather')}</div>${seg('mood', MOODS, (v) => tx(MOOD_LABEL[v]))}</div>
      </div></details>
      <details class="settings-group wide"><summary>${tx('Bomber, escorts & flak')}</summary><div class="cb-grid">
        <div class="cb-f wide"><div class="cb-l">${tx('Gunner seat')}</div>${seg('station', SEATS, (v) => tx(STATIONS[v].label))}</div>
        <div class="cb-f"><div class="cb-l">${tx('Formation')} <b data-out="bombers"></b></div>${seg('bombers', BOMBERS, (v) => String(v))}</div>
        <div class="cb-f"><div class="cb-l">${tx('Flak density')}</div>${seg('flak', [0, 1, 2, 3] as const, (v) => tx(FLAK_LABEL[v]))}</div>
        <div class="cb-f wide"><div class="cb-l">${tx('Escorts')}</div>${seg('escorts', ESCORTS, (v) => tx(ESCORT_LABEL[v]))}</div>
      </div></details>
    </div>
    <div class="cb-sum" data-sum></div>
    <div class="me-share"><input class="me-in" data-link readonly aria-label="${esc(tx('Share link'))}"/><button class="btn ghost" data-copy>${tx('Copy link')}</button></div>
    <p class="cb-note">${tx('Anyone with the link can fly your mission. Player missions are not posted to the online leaderboards.')}</p>
    <div class="cb-actions"><button class="btn ghost" data-reset>${tx('Defaults')}</button><button class="btn ghost" data-save>${tx('Save')}</button><button class="btn" data-start>${tx('Fly mission')}</button></div>
  </div></div>`;

  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const name = q<HTMLInputElement>('[data-name]'), target = q<HTMLSelectElement>('[data-target]'), sun = q<HTMLInputElement>('[data-k="sunEl"]');
  const wavesEl = q<HTMLElement>('[data-waves]');

  const waveRow = (w: EditorWave, i: number) => `<div class="me-wave" data-wave="${i}">
      <span class="n">${tx(`Wave ${i + 1}`)}</span>
      <select class="me-sel" data-w="leg" aria-label="${esc(tx('When'))}">${LEGS.map((l) => `<option value="${l}" ${l === w.leg ? 'selected' : ''}>${esc(tx(LEG_LABEL[l]))}</option>`).join('')}</select>
      <select class="me-sel" data-w="from" aria-label="${esc(tx('From'))}">${FROMS.map((f) => `<option value="${f}" ${f === w.from ? 'selected' : ''}>${esc(tx(FROM_LABEL[f]))}</option>`).join('')}</select>
      <label class="cnt"><input type="range" data-w="count" min="${WAVE_COUNT[0]}" max="${WAVE_COUNT[1]}" step="1" value="${w.count}" aria-label="${esc(tx('Fighters'))}"/><b>${w.count}</b></label>
      <button type="button" class="x" data-w="remove" aria-label="${esc(tx('Remove wave'))}" ${s.waves.length <= 1 ? 'disabled' : ''}>✕</button>
      <div class="types">${ALL_ENEMIES.map((t) => `<button type="button" data-type="${t}" class="${w.types.includes(t) ? 'on' : ''}">${esc(enemyName(t))}</button>`).join('')}</div>
    </div>`;

  const drawWaves = () => {
    wavesEl.innerHTML = s.waves.map(waveRow).join('');
    wavesEl.querySelectorAll<HTMLElement>('[data-wave]').forEach((row) => {
      const w = s.waves[+row.dataset.wave!];
      row.querySelector<HTMLSelectElement>('[data-w="leg"]')!.onchange = (e) => { w.leg = (e.target as HTMLSelectElement).value as EditorWave['leg']; sync(); };
      row.querySelector<HTMLSelectElement>('[data-w="from"]')!.onchange = (e) => { w.from = (e.target as HTMLSelectElement).value as EditorWave['from']; sync(); };
      const cnt = row.querySelector<HTMLInputElement>('[data-w="count"]')!;
      cnt.oninput = () => { w.count = +cnt.value; row.querySelector('.cnt b')!.textContent = cnt.value; sync(false); };
      row.querySelector<HTMLButtonElement>('[data-w="remove"]')!.onclick = () => { if (s.waves.length > 1) { s.waves.splice(+row.dataset.wave!, 1); sync(); } };
      row.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) => b.onclick = () => {
        const t = b.dataset.type as EditorWave['types'][number];
        const next = w.types.includes(t) ? w.types.filter((x) => x !== t) : [...w.types, t];
        if (next.length) w.types = ALL_ENEMIES.filter((x) => next.includes(x));   // at least one type stays on
        sync();
      });
    });
  };

  // spec -> controls (redraw: rebuild the wave rows too)
  const sync = (redraw = true) => {
    s = sanitizeSpec(s);
    el.querySelectorAll<HTMLElement>('[data-seg]').forEach((g) => {
      const v = String((s as any)[g.dataset.seg!]);
      g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    });
    if (document.activeElement !== name) name.value = s.name;
    target.value = String(s.target);
    sun.value = String(s.sunEl); sun.disabled = s.mood === 'dusk';
    if (redraw) drawWaves();
    q<HTMLButtonElement>('[data-add]').disabled = s.waves.length >= WAVES_MAX;
    const out = (k: string, v: string) => (q<HTMLElement>(`[data-out="${k}"]`).textContent = v);
    out('skill', tx(SKILL_DEF[s.skill].label));
    out('route', tx(`${Math.round(ROUTE_SECONDS[s.route] / 6) / 10} min`));
    out('sunEl', sunLabel(s.sunEl, s.mood));
    out('bombers', tx(`${s.bombers} bombers`));
    out('total', tx(`${s.waves.length} of ${WAVES_MAX} waves · ${totalFighters(s)} fighters`));
    q<HTMLElement>('[data-sum]').textContent = `${missionTitle(s) === s.name ? s.name : tx(missionTitle(s))} — ${summary(s)}`;
    q<HTMLInputElement>('[data-link]').value = linkFor(encodeMission(s));
    saveDraft(s);
  };

  el.querySelectorAll<HTMLElement>('[data-seg]').forEach((g) => g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => {
    const k = g.dataset.seg!, v = b.dataset.v!;
    (s as any)[k] = k === 'bombers' || k === 'flak' ? +v : v;
    if (k === 'mood' && v === 'dusk') s.sunEl = Math.min(s.sunEl, DUSK_MAX_SUN);
    sync(false);
  })));
  name.addEventListener('input', () => { s.name = name.value; sync(false); });
  name.addEventListener('change', () => { name.value = s.name; });
  target.addEventListener('change', () => { s.target = +target.value; sync(false); });
  sun.addEventListener('input', () => { s.sunEl = +sun.value; sync(false); });
  q('[data-add]').addEventListener('click', () => {
    if (s.waves.length >= WAVES_MAX) return;
    const last = s.waves[s.waves.length - 1];
    s.waves.push({ leg: last?.leg ?? 'in', from: 'mixed', count: last?.count ?? 4, types: last?.types.slice() ?? ['fw190'] });
    sync();
  });
  q('[data-reset]').addEventListener('click', () => { s = sanitizeSpec(DEFAULT_SPEC); sync(); });
  const save = () => addToLibrary(encodeMission(s), true);
  q<HTMLButtonElement>('[data-save]').addEventListener('click', (e) => { save(); (e.target as HTMLButtonElement).textContent = tx('Saved'); });
  q<HTMLButtonElement>('[data-copy]').addEventListener('click', (e) => { save(); copyLink(e.target as HTMLButtonElement, q('[data-link]'), linkFor(encodeMission(s))); });
  q('[data-back]').addEventListener('click', o.back);
  q('[data-start]').addEventListener('click', () => { save(); o.start(buildUserMission(s)); });
  onBackKey(el, o.back);
  sync();
}

// ---------------- the shared-mission card (a ?mission= link, or a pasted code) ----------------
export interface SharedOpts { start(m: Mission): void; back(): void; edit(spec: MissionSpec): void }

export function showSharedMission(code: string, o: SharedOpts) {
  injectCss();
  const el = showLayer('me-shared');
  const d = decodeMission(code);
  if (!d.ok) {
    el.innerHTML = `<div class="screen-center"><div class="box panel me-card">
      <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
      <div class="kicker">${tx('SHARED MISSION')}</div><h2 class="h2">${tx('Mission code not valid')}</h2>
      <p class="cb-note">${esc(tx(DECODE_ERROR_TEXT[d.error]))}</p></div></div>`;
    el.querySelector('[data-back]')!.addEventListener('click', o.back);
    onBackKey(el, o.back);
    return;
  }
  const s = d.spec;
  const entry = loadLibrary().find((x) => x.code === d.code);
  const legs = LEGS.map((l) => [l, s.waves.filter((w) => w.leg === l)] as const).filter(([, ws]) => ws.length);
  el.innerHTML = `<div class="screen-center"><div class="box panel me-card">
    <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
    <div class="kicker">${tx('SHARED MISSION · B-17 GUNNER')}</div><h2 class="h2"><bdi>${esc(s.name || tx(missionTitle(s)))}</bdi></h2>
    <div class="cb-summary">${esc(summary(s))}</div>
    <ul>
      <li>${esc(tx(MOOD_LABEL[s.mood]))} · ${esc(s.mood === 'dusk' ? `${Math.min(s.sunEl, DUSK_MAX_SUN)}°` : sunLabel(s.sunEl, s.mood))} · ${esc(tx(STATIONS[s.station].label))} · ${esc(tx(`${s.bombers} bombers`))}</li>
      ${legs.map(([l, ws]) => `<li>${esc(tx(LEG_LABEL[l]))}: ${ws.map((w) => `${w.count} × ${esc(w.types.map(enemyName).join('/'))} (${esc(tx(FROM_LABEL[w.from]))})`).join(' · ')}</li>`).join('')}
    </ul>
    <div class="me-rate"><span class="k">${tx('YOUR RATING')}</span>${stars(entry?.rating ?? 0, 'big')}<span class="s">${entry?.plays ? esc(flown(entry.plays, entry.best)) : esc(tx('Not flown yet'))}</span></div>
    <p class="cb-note">${tx('Player missions are not posted to the online leaderboards.')}</p>
    <div class="cb-actions"><button class="btn ghost" data-edit>${tx('Edit a copy')}</button><button class="btn ghost" data-save>${tx(entry ? 'In your missions' : 'Save')}</button><button class="btn" data-start>${tx('Fly mission')}</button></div>
  </div></div>`;
  wireStars(el, d.code);
  el.querySelector('[data-back]')!.addEventListener('click', o.back);
  el.querySelector<HTMLButtonElement>('[data-save]')!.addEventListener('click', (e) => { addToLibrary(d.code, false); (e.target as HTMLButtonElement).textContent = tx('In your missions'); });
  el.querySelector('[data-edit]')!.addEventListener('click', () => o.edit({ ...s, waves: s.waves.map((w) => ({ ...w, types: w.types.slice() })) }));
  el.querySelector('[data-start]')!.addEventListener('click', () => { addToLibrary(d.code, false); o.start(buildUserMission(s)); });
  onBackKey(el, o.back);
}

function wireStars(root: HTMLElement, code: string) {
  root.querySelectorAll<HTMLElement>('.me-stars').forEach((g) => g.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    addToLibrary(code, false);
    rateMission(code, +b.dataset.star!);
    const n = +b.dataset.star!;
    g.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((x) => { const on = +x.dataset.star! <= n; x.classList.toggle('on', on); x.textContent = on ? '★' : '☆'; });
  })));
}

// ---------------- the Survival-screen tab: the library ----------------
export const USER_MODE: ModeDef = {
  id: 'editor', title: 'Mission Editor', roles: ['gunner'],
  blurb: 'Build your own gunner mission — target, route, weather, time of day, enemy waves, escorts and flak — and share it as a link. Fly, rate and replay missions friends send you.',
  mission: () => buildUserMission(loadDraft()),
  matches: (m) => m.id === USER_MISSION_ID,
  board: () => '',
};
registerMode(USER_MODE);

function backToSurvival(refresh: () => void) {
  const s = document.getElementById('survival');
  if (!s) return;
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === s));
  refresh();
}

const entryLine = (e: LibraryEntry, s: MissionSpec) => [tx(TARGETS[s.target]), e.plays ? flown(e.plays, e.best) : tx('Not flown yet')].join(' · ');

USER_MODE.panel = function draw(body, onPick) {
  injectCss();
  const lib = loadLibrary();
  const back = () => backToSurvival(() => draw(body, onPick));
  const edit = (spec?: MissionSpec) => showMissionEditor({ start: onPick, back, spec });
  body.innerHTML = `<p>${esc(tx(USER_MODE.blurb))}</p>
    <div class="row"><button class="btn" data-me-new>${tx('Build a mission')}</button></div>
    <div class="me-open"><input class="me-in" data-me-code placeholder="${esc(tx('Paste a mission code or link'))}" aria-label="${esc(tx('Mission code'))}"/><button class="btn ghost" data-me-open>${tx('Open')}</button></div>
    <p class="me-err" data-me-err></p>
    <div class="cb-l" style="margin-top:8px">${tx('Your missions')}</div>
    <div class="me-lib">${lib.length ? lib.map((e) => {
      const s = decodeMission(e.code);
      if (!s.ok) return '';
      return `<div class="me-item" data-code="${esc(e.code)}">
        <div class="t"><bdi>${esc(s.spec.name || tx(missionTitle(s.spec)))}</bdi>${e.mine ? '' : `<small>${tx('shared')}</small>`} ${stars(e.rating)}</div>
        <div class="s">${esc(entryLine(e, s.spec))}</div>
        <div class="a"><button class="fly" data-a="fly">${tx('Fly')}</button><button data-a="edit">${tx('Edit')}</button><button data-a="share">${tx('Copy link')}</button><button data-a="del" aria-label="${esc(tx('Remove'))}">✕</button></div>
      </div>`;
    }).join('') : `<p class="cb-note">${tx('No missions yet. Build one, or open a code a friend sent you.')}</p>`}</div>`;
  body.querySelector('[data-me-new]')!.addEventListener('click', () => edit());
  const input = body.querySelector<HTMLInputElement>('[data-me-code]')!;
  const open = () => {
    const d = decodeMission(input.value);
    if (!d.ok) { body.querySelector('[data-me-err]')!.textContent = tx(DECODE_ERROR_TEXT[d.error]); return; }
    showSharedMission(d.code, { start: onPick, back, edit });
  };
  body.querySelector('[data-me-open]')!.addEventListener('click', open);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  body.querySelectorAll<HTMLElement>('.me-item').forEach((row) => {
    const code = row.dataset.code!;
    wireStars(row, code);
    row.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const d = decodeMission(code);
      if (!d.ok) return;
      switch (b.dataset.a) {
        case 'fly': onPick(buildUserMission(d.spec)); break;
        case 'edit': edit(d.spec); break;
        case 'share': copyLink(b, null, linkFor(code)); break;
        case 'del': removeFromLibrary(code); draw(body, onPick); break;
      }
    }));
  });
};

// ---------------- debrief: rate it, see the record, share it ----------------
export function mountMissionRating(host: HTMLElement | null, m: Mission, d: Pick<DebriefData, 'success' | 'score'>) {
  const code = userMissionCode(m);
  if (!host || !code) return;
  injectCss();
  const e = recordPlay(code, d.success, d.score);
  if (!e) return;
  host.querySelector('.me-rate')?.remove();
  const div = document.createElement('div');
  div.className = 'me-rate';
  div.innerHTML = `<span class="k">${tx('RATE THIS MISSION')}</span>${stars(e.rating, 'big')}
    <span class="s">${esc(flown(e.plays, e.best))}</span><button type="button" class="me-mini" data-copy>${tx('Copy link')}</button>`;
  host.appendChild(div);
  wireStars(div, e.code);
  div.querySelector<HTMLButtonElement>('[data-copy]')!.addEventListener('click', (ev) => copyLink(ev.target as HTMLButtonElement, null, linkFor(e.code)));
}

// ---------------- the title screen: a ?mission=CODE link ----------------
let linkChecked = false;
export interface LinkHost { state: string; showBriefing(m: Mission, back?: () => void): void; startMenu(): void }

// Returns true when the page was opened from a mission link (the title's first-flight prompt waits)
export function openMissionLink(g: LinkHost): boolean {
  if (linkChecked || typeof location === 'undefined') return false;
  linkChecked = true;
  const code = linkCode(location.href);
  if (!code) return false;
  try { history.replaceState(history.state, '', withoutLinkCode(location.href)); } catch { /* file:// */ }
  const back = () => g.startMenu();
  const card = () => showSharedMission(code, {
    back,
    start: (m) => g.showBriefing(m, card),
    edit: (spec) => showMissionEditor({ spec, back: card, start: (m) => g.showBriefing(m, card) }),
  });
  setTimeout(() => { if (g.state === 'menu') card(); }, 0);
  return true;
}
