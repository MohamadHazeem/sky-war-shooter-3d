import { keyMap } from '../core/KeyMap';
import type { CrewSeat } from '../net/Crew';
import { onBackKey } from './serviceCommon';
import type { CoopMode } from '../net/CoopPilot';
import { CAMPAIGN } from '../game/Missions';
// Co-op (beta) screens: the title-menu entry, host / join menu, lobby with seat picking, the
// text-free connection-quality indicator, the PARTNER tag on the gunner HUD's station bar and
// short notices. All DOM lives here (own layer and styles), driven by CoopSession.
// Every text is English in the code and shown through tx() (Arabic: i18n/ar/coop.ts); the
// PARTNER tag is CSS content, fed from the --coop-partner custom property.
import { STATION_ORDER, STATIONS, StationId } from '../world/B17Layout';
import { tx } from '../i18n';
import { savedName, saveName } from '../net/Leaderboard';
import { estimateRtt, latencyBars, REGION_LABEL, MAX_CREW, type LobbyListing, type Region } from '../net/Lobbies';
import { loadTicket } from '../net/Rejoin';

const PUBLIC_KEY = 'sws3d.coopPublic';
function publicPref() { try { return localStorage.getItem(PUBLIC_KEY) !== '0'; } catch { return true; } }
function savePublicPref(on: boolean) { try { localStorage.setItem(PUBLIC_KEY, on ? '1' : '0'); } catch { /* */ } }

export interface CoopScreenHandlers {
  host(pub: boolean): void;
  mode(mode: CoopMode, scenario: string): void;
  join(code: string): void;
  quick(): void;             // quick join: the best public crew
  browse(): void;            // the public game list
  rejoin(code: string): void;
  invite(): void;            // share / copy the invite link
  seat(s: StationId): void;
  start(): void;
  ready(): void;
  ping(): void;
  intercom?(el: HTMLElement): void;   // the lobby's crew intercom panel (game/CrewIntercom.ts)
  leave(): void;   // lobby: leave / cancel
  back(): void;    // menu: back to the title
}

export interface LobbyView {
  mode: CoopMode;
  scenario: string;
  role: 'host' | 'guest';
  code: string;
  status: string;
  connected: boolean;
  mine: StationId;
  partner: StationId | null;
  crew?: CrewSeat[];
  myId: number;
  ready: boolean;
  listed?: boolean;   // host, B-17 crew: shown in the public game list
  voice?: boolean;    // someone else is connected: show the crew intercom panel
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const CSS = `
#coop .box { width: min(560px, 100%); padding: 28px 30px; max-height: 92vh; overflow: auto; }
#coop select { max-width:100%; padding:6px 8px; background:#252a28; color:var(--ink); border:1px solid var(--line); font:inherit; }
#coop select:disabled { opacity:1; color:var(--ink-dim); }
#coop p.note { color: var(--ink-dim); font-size: 13px; line-height: 1.5; margin: 16px 0 0; }
#coop .err { color: #f08a6c; min-height: 20px; font-size: 14px; margin-top: 10px; }
#coop .code { font-family: 'IBM Plex Mono', monospace; font-size: 44px; letter-spacing: 10px; color: var(--khaki); margin: 6px 0 2px; user-select: all; }
#coop .status { font-size: 14px; letter-spacing: 1px; color: var(--ink-dim); margin: 6px 0 14px; }
#coop .status.ok { color: #9fd38a; }
#coop .seats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 8px 0 18px; }
#coop .seats button { font: inherit; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 10px 4px; background: rgba(0,0,0,0.35); color: var(--ink); border: 1px solid var(--line); cursor: pointer; position: relative; }
#coop .seats button.mine { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
#coop .seats button.partner { border-color: #6fa8d8; color: #9cc6ec; cursor: not-allowed; }
#coop .seats button.partner::after { content: var(--coop-partner, 'PARTNER'); position: absolute; left: 50%; top: -8px; transform: translateX(-50%); font-size: 9px; padding: 0 4px; background: #2b5d86; color: #fff; letter-spacing: 1px; }
#coop .joinrow { display: flex; gap: 8px; margin-top: 8px; }
#coop .joinrow input { flex: 1; min-width: 0; font-family: 'IBM Plex Mono', monospace; font-size: 22px; letter-spacing: 6px; text-transform: uppercase; padding: 8px 12px; background: rgba(0,0,0,0.4); color: var(--ink); border: 1px solid var(--line); }
#coop .joinrow input:focus { outline: 2px solid var(--khaki); }
#coop .btn:disabled { opacity: 0.4; cursor: default; filter: none; }
#coop .sep { border: none; border-top: 1px solid var(--line); margin: 20px 0 14px; }
#coop .check { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; font-size: 14px; color: var(--ink-dim); cursor: pointer; }
#coop .check input { width: 18px; height: 18px; accent-color: var(--khaki); }
#coop .lobbies { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 16px; }
#coop .lobbyrow { display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--line); }
#coop .lobbyrow .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#coop .lobbyrow .who b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#coop .lobbyrow .who small { color: var(--ink-dim); font-size: 12px; }
#coop .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; flex: none; }
#coop .bars i { display: block; width: 4px; background: rgba(255,255,255,0.18); border-radius: 1px; }
#coop .bars i:nth-child(1) { height: 25%; } #coop .bars i:nth-child(2) { height: 50%; } #coop .bars i:nth-child(3) { height: 75%; } #coop .bars i:nth-child(4) { height: 100%; }
#coop .bars.q4 i, #coop .bars.q3 i:nth-child(-n+3), #coop .bars.q2 i:nth-child(-n+2), #coop .bars.q1 i:nth-child(1) { background: var(--q); }
#coop .bars.q4 { --q: #7ed36a; } #coop .bars.q3 { --q: #c9d65a; } #coop .bars.q2 { --q: #eaa64a; } #coop .bars.q1 { --q: #e8573f; }
@media (max-width: 520px) { #coop .box { padding: 20px 16px; } #coop .code { font-size: 34px; letter-spacing: 6px; } #coop .seats { grid-template-columns: repeat(3, 1fr); } }
html[lang=ar] #coop .lobbyrow .who small, html[lang=ar] #coop .check { font-size: 14px; line-height: 1.6; }
#hStations span.partner { border-color: #6fa8d8; color: #9cc6ec; }
#hStations span.partner::after { content: var(--coop-partner, 'PARTNER'); position: absolute; left: 50%; top: -9px; transform: translateX(-50%); font-size: 8px; line-height: 11px; padding: 0 3px; background: #2b5d86; color: #fff; letter-spacing: 1px; white-space: nowrap; }
#coopPing { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 40; display: none; align-items: flex-end; gap: 2px; height: 14px; padding: 3px 5px; background: rgba(0,0,0,0.35); border-radius: 3px; pointer-events: auto; }
#coopPing.show { display: flex; }
#coopPing i { display: block; width: 4px; background: rgba(255,255,255,0.18); border-radius: 1px; }
#coopPing i:nth-child(1) { height: 25%; } #coopPing i:nth-child(2) { height: 50%; } #coopPing i:nth-child(3) { height: 75%; } #coopPing i:nth-child(4) { height: 100%; }
#coopPing.q4 i, #coopPing.q3 i:nth-child(-n+3), #coopPing.q2 i:nth-child(-n+2), #coopPing.q1 i:nth-child(1) { background: var(--q); }
#coopPing.q4 { --q: #7ed36a; } #coopPing.q3 { --q: #c9d65a; } #coopPing.q2 { --q: #eaa64a; } #coopPing.q1 { --q: #e8573f; }
#coopPing.q0 i { animation: coopBlink 1s steps(2) infinite; }
@keyframes coopBlink { 50% { background: rgba(232,87,63,0.8); } }
/* Arabic: the code stays Latin and left-to-right (keeps its spacing); tags and small labels a size up */
html[lang=ar] #coop .code, html[lang=ar] #coop .joinrow input { direction: ltr; text-align: right; }
html[lang=ar] #coop .code { letter-spacing: 10px !important; }
html[lang=ar] #coop .joinrow input:not(:placeholder-shown) { letter-spacing: 6px !important; }
html[lang=ar] #coop .joinrow input:placeholder-shown { direction: rtl; }
html[lang=ar] #coop .seats button { font-size: 12.5px; padding: 9px 3px; line-height: 1.35; }
html[lang=ar] #coop .seats button.partner::after { font-size: 10.5px; top: -10px; line-height: 15px; white-space: nowrap; }
html[lang=ar] #hStations span.partner::after { font-size: 10px; top: -12px; line-height: 14px; }
html[lang=ar] #coop .status, html[lang=ar] #coop .err, html[lang=ar] #coop select { max-width:100%; padding:6px 8px; background:#252a28; color:var(--ink); border:1px solid var(--line); font:inherit; }
#coop select:disabled { opacity:1; color:var(--ink-dim); }
#coop p.note { line-height: 1.7; }
html[lang=ar] #coopToast, html[lang=ar] #coopWait { line-height: 1.6; }
#coopToast { position: fixed; left: 50%; top: 18%; transform: translateX(-50%); z-index: 60; background: rgba(12,12,8,0.88); border: 1px solid rgba(185,167,111,0.6); color: var(--ink); padding: 12px 20px; font-size: 16px; letter-spacing: 1px; text-align: center; max-width: min(560px, 90vw); opacity: 0; transition: opacity 0.4s; pointer-events: none; }
#coopToast.show { opacity: 1; }
#coopWait { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 30; background: rgba(12,12,8,0.8); border: 1px solid var(--line); padding: 14px 22px; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; display: none; pointer-events: none; }
#coopWait.show { display: block; }
`;

export class CoopScreen {
  private root: HTMLElement;
  private ping: HTMLElement;
  private exitButton: HTMLButtonElement;
  private toastEl: HTMLElement;
  private waitEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private pingButton: HTMLButtonElement;

  constructor(private h: CoopScreenHandlers) {
    if (!document.getElementById('coopStyle')) {
      const st = document.createElement('style');
      st.id = 'coopStyle';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = this.make('div', 'coop', 'layer');
    this.exitButton = this.make('button', 'coopExit', 'btn ghost') as HTMLButtonElement;
    this.exitButton.style.cssText = 'position:fixed;top:45%;right:12px;z-index:60;display:none;font-size:11px';
    this.exitButton.onclick = () => this.h.back();
    this.pingButton = this.make('button', 'crewMark', 'btn ghost') as HTMLButtonElement;
    this.pingButton.style.cssText = 'position:fixed;top:38%;right:12px;z-index:60;display:none;font-size:11px';
    this.pingButton.onclick = () => this.h.ping();
    this.ping = this.make('div', 'coopPing', '');
    this.ping.innerHTML = '<i></i><i></i><i></i><i></i>';
    this.toastEl = this.make('div', 'coopToast', '');
    this.waitEl = this.make('div', 'coopWait', '');
  }

  private make(tag: string, id: string, cls: string) {
    const e = document.getElementById(id) ?? document.body.appendChild(document.createElement(tag));
    e.id = id;
    if (cls) e.className = cls;
    return e as HTMLElement;
  }

  // the PARTNER tag's text (CSS content), in the current language
  private tagText() {
    const v = JSON.stringify(tx('PARTNER'));
    const root = document.documentElement;
    if (root.style.getPropertyValue('--coop-partner') !== v) root.style.setProperty('--coop-partner', v);
  }

  private show() {
    this.tagText();
    document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === this.root));
  }

  hide() { this.root.classList.remove('show'); }

  menu(error = '', code = '', back = () => this.h.back()) {
    const ticket = loadTicket();
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${tx('ONLINE · PEER TO PEER')}</div><h2 class="h2">${tx('Co-op (beta)')}</h2>
      <p class="note" style="margin-top:4px">${tx('Up to four gunners crew one B-17, or two pilots fly Mustangs. Share one room code.')}</p>
      <label class="hud-label">${tx('Your callsign')} <input data-name maxlength="20" value="${esc(savedName())}" placeholder="${tx('Your name')}" /></label>
      ${this.modeChoice('gunner', 'survival', false)}
      <div class="row" style="margin:18px 0 4px"><button class="btn" data-host>${tx('Host a game')}</button></div>
      <label class="check" data-pub-row><input type="checkbox" data-pub ${publicPref() ? 'checked' : ''} /><span>${tx('List it publicly — anyone can join')}</span></label>
      <hr class="sep" />
      <div class="hud-label">${tx('Join a game')}</div>
      <div class="row" style="margin:8px 0 10px"><button class="btn" data-quick>${tx('Quick join')}</button><button class="btn ghost" data-browse>${tx('Find a game')}</button></div>
      <div class="joinrow"><input maxlength="7" placeholder="${esc(tx('CODE'))}" autocomplete="off" spellcheck="false" value="${esc(code)}" aria-label="${esc(tx('Join code'))}" /><button class="btn ghost" data-join>${tx('Join')}</button></div>
      ${ticket ? `<div class="row" style="margin-top:10px"><button class="btn ghost" data-rejoin>${tx('Rejoin your last crew')} <span dir="ltr">${esc(ticket.code)}</span></button></div>` : ''}
      <div class="err" role="alert">${esc(tx(error))}</div>
      <p class="note">${tx('Shared crew score and personal rewards. Relay support is used when available.')}</p>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>${tx('Back')}</button></div>
    </div></div>`;
    const input = this.root.querySelector<HTMLInputElement>('.joinrow input')!;
    const name = this.root.querySelector<HTMLInputElement>('[data-name]')!;
    const join = () => { saveName(name.value); this.h.join(input.value); };
    const pub = this.root.querySelector<HTMLInputElement>('[data-pub]')!;
    pub.addEventListener('change', () => savePublicPref(pub.checked));
    this.root.querySelector('[data-host]')!.addEventListener('click', () => { saveName(name.value); this.h.mode(this.root.querySelector<HTMLSelectElement>('[data-mode]')!.value as CoopMode, this.root.querySelector<HTMLSelectElement>('[data-scenario]')!.value); this.h.host(pub.checked); });
    this.root.querySelector('[data-join]')!.addEventListener('click', join);
    this.root.querySelector('[data-quick]')!.addEventListener('click', () => { saveName(name.value); this.h.quick(); });
    this.root.querySelector('[data-browse]')!.addEventListener('click', () => { saveName(name.value); this.h.browse(); });
    this.root.querySelector('[data-rejoin]')?.addEventListener('click', () => { saveName(name.value); if (ticket) this.h.rejoin(ticket.code); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    this.root.querySelector('[data-back]')!.addEventListener('click', back);
    this.wireMode();
    this.show();
    onBackKey(this.root, () => this.root.querySelector<HTMLButtonElement>('[data-back], [data-leave]')?.click());
  }

  private modeChoice(mode: CoopMode, scenario: string, guest: boolean) {
    return `<p><label>${tx('Co-op mode')} <select data-mode ${guest ? 'disabled' : ''}>${(['gunner', 'pilot'] as const).map(m => `<option value="${m}" ${m === mode ? 'selected' : ''}>${tx(m === 'pilot' ? 'P-51 escort (pilots)' : 'B-17 crew (gunners)')}</option>`).join('')}</select></label></p>
      <p data-scenario-row ${mode === 'gunner' ? 'hidden' : ''}><label>${tx('Mission')} <select data-scenario ${guest ? 'disabled' : ''}>
      ${[['survival', 'Survival'], ...CAMPAIGN.filter(m => m.role === 'pilot' && m.bombers > 0 && !m.naval).map(m => [m.id, m.title]), ['custom', 'Custom Battle — saved escort settings']].map(([id, title]) => `<option value="${id}" ${id === scenario ? 'selected' : ''}>${esc(tx(title))}</option>`).join('')}</select></label></p>`;
  }

  private wireMode() {
    const mode = this.root.querySelector<HTMLSelectElement>('[data-mode]');
    const scenario = this.root.querySelector<HTMLSelectElement>('[data-scenario]');
    const change = () => {
      const m = mode?.value === 'pilot' ? 'pilot' : 'gunner';
      this.root.querySelector<HTMLElement>('[data-scenario-row]')!.hidden = m !== 'pilot';
      const pubRow = this.root.querySelector<HTMLElement>('[data-pub-row]');
      if (pubRow) pubRow.hidden = m === 'pilot';
      this.h.mode(m, scenario?.value ?? 'survival');
    };
    mode?.addEventListener('change', change); scenario?.addEventListener('change', change);
  }

  busy(text: string) {
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${tx('CO-OP (BETA)')}</div><h2 class="h2">${tx('Stand by')}</h2>
      <div class="status">${esc(tx(text))}</div>
      <div class="row"><button class="btn ghost" data-leave>${tx('Cancel')}</button></div>
    </div></div>`;
    this.root.querySelector('[data-leave]')!.addEventListener('click', () => this.h.leave());
    this.show();
    onBackKey(this.root, () => this.root.querySelector<HTMLButtonElement>('[data-back], [data-leave]')?.click());
  }

  private crewRows(crew: CrewSeat[]) {
    const rows = Array.from({ length: 4 }, (_, i) => {
      const p = crew[i];
      const label = p ? `${esc(p.name)} · ${tx(STATIONS[p.seat].label)} · ${tx(p.ready ? 'Ready' : 'Not ready')}` : tx('Open crew slot · AI covering');
      return `<p data-crew="${i}">${label}</p>`;
    });
    return `<div class="crew-roster">${rows.join('')}</div>`;
  }

  lobby(v: LobbyView) {
    const occupied = (s: StationId) => v.crew ? v.crew.some(p => p.id !== v.myId && p.seat === s) : s === v.partner;
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${tx(v.mode === 'pilot' ? 'P-51 escort (pilots)' : 'CO-OP (BETA) · SURVIVAL · B-17 GUNNERS')}</div>
      <div class="hud-label" style="margin-top:12px">${tx(v.role === 'host' ? 'Join code — give it to your partner' : 'Joined game')}</div>
      <div class="code">${esc(v.code)}</div>
      <div class="status ${v.connected ? 'ok' : ''}" data-status>${esc(tx(v.status))}</div>
      ${this.modeChoice(v.mode, v.scenario, v.role === 'guest')}
      ${v.crew ? this.crewRows(v.crew) : ''}
      <div data-intercom ${v.voice ? '' : 'hidden'}></div>
      ${v.mode === 'pilot' ? `<p>${tx(v.role === 'host' ? 'Blue One' : 'Blue Two')} · ${tx('PARTNER')}: ${tx(v.role === 'host' ? 'Blue Two' : 'Blue One')}</p>` : ''}
      <div ${v.mode === 'pilot' ? 'hidden' : ''}><div class="hud-label">${tx('Your gun position')}</div>
      <div class="seats">${STATION_ORDER.map((s) => `<button data-s="${s}" class="${s === v.mine ? 'mine' : occupied(s) ? 'partner' : ''}" ${occupied(s) ? 'disabled' : ''}>${tx(STATIONS[s].label)}</button>`).join('')}</div></div>
      <div class="row" style="margin-bottom:10px"><button class="btn ghost" data-invite>${tx('Copy invite link')}</button></div>
      ${v.listed === undefined ? '' : `<p class="note" style="margin:0 0 12px">${tx(v.listed ? 'Listed publicly — players can find this crew' : 'Private — only people with the code or link can join')}</p>`}
      <div class="row">${v.crew ? `<button class="btn ghost" data-ready>${tx(v.ready ? 'Not ready' : 'Ready')}</button>` : ''}${v.role === 'host' ? `<button class="btn" data-start ${v.connected ? '' : 'disabled'}>${tx('Start mission')}</button>` : ''}<button class="btn ghost" data-leave>${tx('Leave')}</button></div>
      <p class="note">${tx(v.role === 'host' ? 'You run the battle: if your partner drops out you carry on alone.' : 'The host starts the mission. If the host leaves, the game ends.')}</p>
    </div></div>`;
    this.wireMode();
    this.root.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.addEventListener('click', () => this.h.seat(b.dataset.s as StationId)));
    this.root.querySelector<HTMLSelectElement>('[data-mode]')!.disabled = true;
    this.root.querySelector('[data-ready]')?.addEventListener('click', () => this.h.ready());
    this.root.querySelector('[data-invite]')!.addEventListener('click', () => this.h.invite());
    this.root.querySelector('[data-start]')?.addEventListener('click', () => this.h.start());
    this.root.querySelector('[data-leave]')!.addEventListener('click', () => this.h.leave());
    const ic = this.root.querySelector<HTMLElement>('[data-intercom]');
    if (ic && !ic.hidden) this.h.intercom?.(ic);
    this.show();
    onBackKey(this.root, () => this.root.querySelector<HTMLButtonElement>('[data-back], [data-leave]')?.click());
  }

  // The public game list (B-17 crews): null while loading
  browser(list: readonly LobbyListing[] | null, me: Region) {
    const row = (l: LobbyListing) => {
      const rtt = estimateRtt(me, l.region);
      const where = l.phase === 'mission' ? tx('In battle · wave {n}', { n: Math.max(1, l.round) }) : tx('In the lobby');
      return `<div class="lobbyrow"><span class="bars q${latencyBars(rtt)}" title="${esc(tx('Estimated round trip: {ms} ms', { ms: rtt }))}"><i></i><i></i><i></i><i></i></span><div class="who"><b>${esc(l.name)}</b><small><span dir="ltr">${l.crew}/${MAX_CREW}</span> · ${tx(REGION_LABEL[l.region])} · ${where}</small></div><button class="btn" data-code="${l.code}">${tx('Join')}</button></div>`;
    };
    const body = list === null ? `<div class="status">${tx('Looking for games…')}</div>`
      : list.length ? `<div class="lobbies">${list.map(row).join('')}</div>`
        : `<div class="status">${tx('No open crews right now. Host a public game and others can find it.')}</div>`;
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">${tx('CO-OP (BETA) · SURVIVAL · B-17 GUNNERS')}</div><h2 class="h2">${tx('Public games')}</h2>
      <p class="note" style="margin-top:4px">${tx('Your region')}: ${tx(REGION_LABEL[me])} · ${tx('Closest crews first; the bars estimate the connection.')}</p>
      ${body}
      <div class="row"><button class="btn ghost" data-refresh ${list === null ? 'disabled' : ''}>${tx('Refresh')}</button><button class="btn ghost" data-back>${tx('Back')}</button></div>
    </div></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) => b.addEventListener('click', () => this.h.join(b.dataset.code!)));
    this.root.querySelector('[data-refresh]')!.addEventListener('click', () => this.h.browse());
    this.root.querySelector('[data-back]')!.addEventListener('click', () => this.menu());
    this.show();
    onBackKey(this.root, () => this.root.querySelector<HTMLButtonElement>('[data-back]')?.click());
  }

  // connection quality from the round-trip time: 4 bars (good) .. 1 bar (poor), blinking = no reply
  setPing(rtt: number, visible: boolean, inMission = false, crew = true) {
    const exitText = tx('Leave co-op'), display = visible && inMission ? 'block' : 'none';
    if (this.exitButton.textContent !== exitText) this.exitButton.textContent = exitText;
    if (this.exitButton.style.display !== display) this.exitButton.style.display = display;
    const markDisplay = crew ? display : 'none';
    if (this.pingButton.style.display !== markDisplay) this.pingButton.style.display = markDisplay;
    const bound = keyMap.label('crewPing');
    const markText = `${tx('Ping target')} (${bound})`;
    if (this.pingButton.textContent !== markText) this.pingButton.textContent = markText;
    const q = !visible ? -1 : rtt < 0 ? 0 : rtt < 90 ? 4 : rtt < 160 ? 3 : rtt < 280 ? 2 : 1;
    const cls = q < 0 ? '' : `show q${q}`;
    if (this.ping.className !== cls) this.ping.className = cls;
    const label = q < 0 ? '' : rtt < 0 ? tx('Connection: waiting for a reply') : tx('Connection: {ms} ms round trip', { ms: Math.round(rtt) });
    if (this.ping.title !== label) { this.ping.title = label; this.ping.setAttribute('aria-label', label); }
  }

  // PARTNER tag on the gunner HUD's station bar (the HUD rebuilds the bar each mission)
  markPartner(seat: StationId | readonly CrewSeat[] | null, myId = -1) {
    const spans = document.querySelectorAll<HTMLElement>('#hStations span');
    if (!spans.length) return;
    if (seat) this.tagText();
    for (const el of spans) {
      const on = Array.isArray(seat) ? seat.some(p => p.id !== myId && p.seat === el.dataset.s) : el.dataset.s === seat;
      if (el.classList.contains('partner') !== on) el.classList.toggle('partner', on);
    }
  }

  waiting(text: string | null) {
    this.waitEl.textContent = text ? tx(text) : '';
    this.waitEl.classList.toggle('show', !!text);
  }

  toast(text: string, ms = 4500) {
    this.toastEl.textContent = tx(text);
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
