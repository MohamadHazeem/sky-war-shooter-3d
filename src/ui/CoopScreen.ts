// Co-op (beta) screens: the title-menu entry, host / join menu, lobby with seat picking, the
// text-free connection-quality indicator, the PARTNER tag on the gunner HUD's station bar and
// short notices. All DOM lives here (own layer and styles), driven by CoopSession.
import { STATION_ORDER, STATIONS, StationId } from '../world/B17Layout';

export interface CoopScreenHandlers {
  host(): void;
  join(code: string): void;
  seat(s: StationId): void;
  start(): void;
  leave(): void;   // lobby: leave / cancel
  back(): void;    // menu: back to the title
}

export interface LobbyView {
  role: 'host' | 'guest';
  code: string;
  status: string;
  connected: boolean;
  mine: StationId;
  partner: StationId | null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const CSS = `
#coop .box { width: min(560px, 100%); padding: 28px 30px; }
#coop p.note { color: var(--ink-dim); font-size: 13px; line-height: 1.5; margin: 16px 0 0; }
#coop .err { color: #f08a6c; min-height: 20px; font-size: 14px; margin-top: 10px; }
#coop .code { font-family: 'IBM Plex Mono', monospace; font-size: 44px; letter-spacing: 10px; color: var(--khaki); margin: 6px 0 2px; user-select: all; }
#coop .status { font-size: 14px; letter-spacing: 1px; color: var(--ink-dim); margin: 6px 0 14px; }
#coop .status.ok { color: #9fd38a; }
#coop .seats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 8px 0 18px; }
#coop .seats button { font: inherit; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 10px 4px; background: rgba(0,0,0,0.35); color: var(--ink); border: 1px solid var(--line); cursor: pointer; position: relative; }
#coop .seats button.mine { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
#coop .seats button.partner { border-color: #6fa8d8; color: #9cc6ec; cursor: not-allowed; }
#coop .seats button.partner::after { content: 'PARTNER'; position: absolute; left: 50%; top: -8px; transform: translateX(-50%); font-size: 9px; padding: 0 4px; background: #2b5d86; color: #fff; letter-spacing: 1px; }
#coop .joinrow { display: flex; gap: 8px; margin-top: 8px; }
#coop .joinrow input { flex: 1; min-width: 0; font-family: 'IBM Plex Mono', monospace; font-size: 22px; letter-spacing: 6px; text-transform: uppercase; padding: 8px 12px; background: rgba(0,0,0,0.4); color: var(--ink); border: 1px solid var(--line); }
#coop .joinrow input:focus { outline: 2px solid var(--khaki); }
#coop .btn:disabled { opacity: 0.4; cursor: default; filter: none; }
#coop .sep { border: none; border-top: 1px solid var(--line); margin: 20px 0 14px; }
#hStations span.partner { border-color: #6fa8d8; color: #9cc6ec; }
#hStations span.partner::after { content: 'PARTNER'; position: absolute; left: 50%; top: -9px; transform: translateX(-50%); font-size: 8px; line-height: 11px; padding: 0 3px; background: #2b5d86; color: #fff; letter-spacing: 1px; white-space: nowrap; }
#coopPing { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 40; display: none; align-items: flex-end; gap: 2px; height: 14px; padding: 3px 5px; background: rgba(0,0,0,0.35); border-radius: 3px; pointer-events: auto; }
#coopPing.show { display: flex; }
#coopPing i { display: block; width: 4px; background: rgba(255,255,255,0.18); border-radius: 1px; }
#coopPing i:nth-child(1) { height: 25%; } #coopPing i:nth-child(2) { height: 50%; } #coopPing i:nth-child(3) { height: 75%; } #coopPing i:nth-child(4) { height: 100%; }
#coopPing.q4 i, #coopPing.q3 i:nth-child(-n+3), #coopPing.q2 i:nth-child(-n+2), #coopPing.q1 i:nth-child(1) { background: var(--q); }
#coopPing.q4 { --q: #7ed36a; } #coopPing.q3 { --q: #c9d65a; } #coopPing.q2 { --q: #eaa64a; } #coopPing.q1 { --q: #e8573f; }
#coopPing.q0 i { animation: coopBlink 1s steps(2) infinite; }
@keyframes coopBlink { 50% { background: rgba(232,87,63,0.8); } }
#coopToast { position: fixed; left: 50%; top: 18%; transform: translateX(-50%); z-index: 60; background: rgba(12,12,8,0.88); border: 1px solid rgba(185,167,111,0.6); color: var(--ink); padding: 12px 20px; font-size: 16px; letter-spacing: 1px; text-align: center; max-width: min(560px, 90vw); opacity: 0; transition: opacity 0.4s; pointer-events: none; }
#coopToast.show { opacity: 1; }
#coopWait { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 30; background: rgba(12,12,8,0.8); border: 1px solid var(--line); padding: 14px 22px; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; display: none; pointer-events: none; }
#coopWait.show { display: block; }
`;

export class CoopScreen {
  private root: HTMLElement;
  private ping: HTMLElement;
  private toastEl: HTMLElement;
  private waitEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private h: CoopScreenHandlers) {
    if (!document.getElementById('coopStyle')) {
      const st = document.createElement('style');
      st.id = 'coopStyle';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = this.make('div', 'coop', 'layer');
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

  // "Co-op (beta)" entry under Survival on the title menu (rebuilt with every title screen)
  titleButton(onClick: () => void) {
    const menu = document.querySelector<HTMLElement>('#title .menu');
    if (!menu || menu.querySelector('[data-a="coop"]')) return;
    const b = document.createElement('button');
    b.dataset.a = 'coop';
    b.innerHTML = 'Co-op (beta) <small>two gunners, one B-17 · online</small>';
    b.addEventListener('click', onClick);
    const after = menu.querySelector('[data-a="survival"]');
    if (after?.nextSibling) menu.insertBefore(b, after.nextSibling); else menu.appendChild(b);
  }

  private show() {
    document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === this.root));
  }

  hide() { this.root.classList.remove('show'); }

  menu(error = '', code = '') {
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">ONLINE · PEER TO PEER</div><h2 class="h2">Co-op (beta)</h2>
      <p class="note" style="margin-top:4px">Two gunners crew the same Fortress in Survival. One player hosts and runs the battle; the other joins with a code.</p>
      <div class="row" style="margin:18px 0 4px"><button class="btn" data-host>Host a game</button></div>
      <hr class="sep" />
      <div class="hud-label">Join a game</div>
      <div class="joinrow"><input maxlength="7" placeholder="CODE" autocomplete="off" spellcheck="false" value="${esc(code)}" aria-label="Join code" /><button class="btn" data-join>Join</button></div>
      <div class="err" role="alert">${esc(error)}</div>
      <p class="note">Prototype. Peer-to-peer with no relay server, so some networks (strict firewalls, some corporate, campus and mobile networks) cannot connect.</p>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-back>Back</button></div>
    </div></div>`;
    const input = this.root.querySelector('input')!;
    const join = () => this.h.join(input.value);
    this.root.querySelector('[data-host]')!.addEventListener('click', () => this.h.host());
    this.root.querySelector('[data-join]')!.addEventListener('click', join);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    this.root.querySelector('[data-back]')!.addEventListener('click', () => this.h.back());
    this.show();
  }

  busy(text: string) {
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">CO-OP (BETA)</div><h2 class="h2">Stand by</h2>
      <div class="status">${esc(text)}</div>
      <div class="row"><button class="btn ghost" data-leave>Cancel</button></div>
    </div></div>`;
    this.root.querySelector('[data-leave]')!.addEventListener('click', () => this.h.leave());
    this.show();
  }

  lobby(v: LobbyView) {
    this.root.innerHTML = `<div class="screen-center"><div class="box panel">
      <div class="kicker">CO-OP (BETA) · SURVIVAL · B-17 GUNNERS</div>
      <div class="hud-label" style="margin-top:12px">${v.role === 'host' ? 'Join code — give it to your partner' : 'Joined game'}</div>
      <div class="code">${esc(v.code)}</div>
      <div class="status ${v.connected ? 'ok' : ''}" data-status>${esc(v.status)}</div>
      <div class="hud-label">Your gun position</div>
      <div class="seats">${STATION_ORDER.map((s) => `<button data-s="${s}" class="${s === v.mine ? 'mine' : s === v.partner ? 'partner' : ''}" ${s === v.partner ? 'disabled' : ''}>${STATIONS[s].label}</button>`).join('')}</div>
      <div class="row">${v.role === 'host' ? `<button class="btn" data-start ${v.connected ? '' : 'disabled'}>Start mission</button>` : ''}<button class="btn ghost" data-leave>Leave</button></div>
      <p class="note">${v.role === 'host' ? 'You run the battle: if your partner drops out you carry on alone.' : 'The host starts the mission. If the host leaves, the game ends.'}</p>
    </div></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.addEventListener('click', () => this.h.seat(b.dataset.s as StationId)));
    this.root.querySelector('[data-start]')?.addEventListener('click', () => this.h.start());
    this.root.querySelector('[data-leave]')!.addEventListener('click', () => this.h.leave());
    this.show();
  }

  // connection quality from the round-trip time: 4 bars (good) .. 1 bar (poor), blinking = no reply
  setPing(rtt: number, visible: boolean) {
    const q = !visible ? -1 : rtt < 0 ? 0 : rtt < 90 ? 4 : rtt < 160 ? 3 : rtt < 280 ? 2 : 1;
    const cls = q < 0 ? '' : `show q${q}`;
    if (this.ping.className !== cls) this.ping.className = cls;
    const label = q < 0 ? '' : rtt < 0 ? 'Connection: waiting for a reply' : `Connection: ${Math.round(rtt)} ms round trip`;
    if (this.ping.title !== label) { this.ping.title = label; this.ping.setAttribute('aria-label', label); }
  }

  // PARTNER tag on the gunner HUD's station bar (the HUD rebuilds the bar each mission)
  markPartner(seat: StationId | null) {
    const spans = document.querySelectorAll<HTMLElement>('#hStations span');
    if (!spans.length) return;
    for (const el of spans) {
      const on = el.dataset.s === seat;
      if (el.classList.contains('partner') !== on) el.classList.toggle('partner', on);
    }
  }

  waiting(text: string | null) {
    this.waitEl.textContent = text ?? '';
    this.waitEl.classList.toggle('show', !!text);
  }

  toast(text: string, ms = 4500) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
