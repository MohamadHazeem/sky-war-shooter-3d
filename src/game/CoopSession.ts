// Online co-op (beta): two players crew the same B-17 in Survival, each on a different gun.
//
// Host-authoritative. The host runs the whole battle (AI, ballistics, damage, director) exactly
// as in single player. The guest's gun is a "remote gunner" on the host: the guest sends its
// seat, gun yaw/pitch and trigger (~30 Hz, unreliable channel) and the host fires real rounds
// from that station with that aim, so the guest's hits and kills happen in the host's world.
// The AI crewman at the guest's seat stands down (World.remoteStations).
//
// The host streams snapshots at 20 Hz: every aircraft's id, type, absolute position (the
// floating-origin offsets of each side are tracked here), quaternion, alive/damage flags and
// structure, the player bomber's zone health, the host's gun aim, and a sample of the tracers
// fired since the last snapshot. Kills, the guest's hits and the end of the mission go over the
// reliable channel.
//
// The guest runs a normal gunner mission for its own view, HUD and gun, but its World is a
// puppet: World.update is swapped for `puppet()`, which places proxy aircraft from the
// snapshots (100 ms interpolation buffer), replays tracers and plays deaths and hit effects
// from the host's events. No AI, no director (Game.direct is blocked), no damage: the guest's
// own rounds are visual only. Everything is frame-stepped (no timers in the simulation path),
// so `sws.step()` drives it in background tabs.
//
// Hooks in other files (kept to a few lines):
//   Game.ts   constructor:  this.coop = new CoopSession(this, engine, ui)
//             startMenu():  this.coop.onTitle()            (title button; quitting ends a session)
//             frame():      this.coop.update(dt)           (right after world.update)
//             direct():     if (this.coop.blocksDirector) return;
//   World.ts  remoteStations set, skipped by bomberGunners()
// Instance-level wrappers (installed for a co-op mission, removed when it ends): World.update
// (guest), World.rebase (origin tracking), Ballistics.fire/onHit (host: tracers, the guest's
// hits), GunnerController.requestStation (no sitting on the partner's gun), and World.events.kill
// (named partner credit, with separate personal and shared score ledgers).
import * as THREE from 'three';
import type { Game } from './Game';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Mission } from './Missions';
import { CAMPAIGN, survivalMission } from './Missions';
import { CoopLink, Sample, sampleTrack, advanceClock } from '../net/Coop';
import { hostSignal, joinSignal, normalizeCode, RoomError, Signalling } from '../net/Signal';
import { CoopScreen } from '../ui/CoopScreen';
import { STATIONS, StationId, dirFromYawPitch, wrapAngle } from '../world/B17Layout';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import type { HitEvent } from '../world/Ballistics';
import { ENEMY_VARIANTS, EnemyType } from '../world/EnemyTypes';
import { updateFighterDeath } from '../world/FighterDeath';
import { updateBomberDeath } from '../world/BomberDeath';
import { update as updateDamageLook } from '../world/DamageLook';
import { update as updateDamageStages } from '../world/DamageStages';
import { updateExhausts } from '../world/Exhaust';
import { disposeOwned } from '../render/Dispose';
import { applyWeather, Weather } from '../render/Weather';
import { sound } from '../audio/Sound';
import { fetchIceServers } from '../net/Ice';
import { emptyGunnerScore, mergeCrew, buildCoopDebrief, isCoopDebrief, type CoopDebrief } from '../net/CoopResult';
import { cleanName, savedName, crewName } from '../net/Leaderboard';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { achievements } from './Achievements';
import { crewRoster } from './CrewRoster';
import { tx } from '../i18n';
import { CombatTally } from './CombatTally';


export const SNAP_HZ = 20;
export const INPUT_HZ = 30;
const TRACERS_PER_SNAP = 40;
const MAX_SNAP_CHARS = 14000;       // keep a snapshot inside one comfortable data-channel message
const INPUT_STALE = 0.75;           // s without guest input (sim and wall clock) -> trigger released
const CONNECT_TIMEOUT_MS = 25000;

// snapshot aircraft flags
export const F_ALIVE = 1, F_PB = 2, F_BURN = 4, F_SMOKE = 8, F_ENG0 = 16; // F_ENG0 << i: engine i dead

// [id, kind, x, y, z, qx, qy, qz, qw, flags, structure 0..1]
export type SnapAircraft = [number, string, number, number, number, number, number, number, number, number, number];

interface Track { kind: string; s: Sample[]; seen: number }
interface RemoteInput { s: StationId; y: number; p: number; f: boolean }

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const R = () => Math.random() * 2 - 1;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const _remoteDir = new THREE.Vector3(), _remoteVel = new THREE.Vector3();

// Kind code of an aircraft in snapshots ('B' bomber, 'P' allied fighter, else the enemy type)
export function kindOf(a: Aircraft): string | null {
  if (a instanceof Bomber) return 'B';
  if (a instanceof Fighter) return a.team === 'allied' ? 'P' : (a.enemyType || 'fw190');
  return null;
}

// marker for the guest's rounds on the host (never an aircraft: compared by identity only)
const REMOTE: Aircraft = Object.freeze({ remoteGunner: true }) as unknown as Aircraft;

export class CoopSession {
  role: 'host' | 'guest' | null = null;
  phase: 'idle' | 'lobby' | 'mission' | 'debrief' = 'idle';
  hostSeat: StationId = 'waistL';
  guestSeat: StationId = 'waistR';
  code = '';
  devFire = false;          // dev/playtests: the guest holds the trigger without a mouse
  stats = { snapsSent: 0, snapsRecv: 0, inputsSent: 0, inputsRecv: 0, guestRounds: 0, guestHits: 0, guestKills: 0, killsRecv: 0 };
  private link: CoopLink | null = null;
  private connectionAttempt = 0;
  private run = 0;
  private rewardedRun = 0;
  private partnerReady = true;
  private myName = 'Gunner';
  private partnerName = 'Walsh';
  private hostScore = emptyGunnerScore();
  private guestScore = emptyGunnerScore();
  private guestTally = new CombatTally();
  private guestStreak = 0;
  private guestLastKill = -99;
  private kill0: Game['world']['events']['kill'] | undefined;
  private result: CoopDebrief | null = null;
  get crewKills() { return this.role === 'host' ? this.game.world.stats.kills + this.guestScore.kills : this.hostScore.kills + this.guestScore.kills; }

  private signal: Signalling | null = null;
  private screen: CoopScreen;
  private connected = false;
  private mission: Mission | null = null;
  private origin = new THREE.Vector3();   // sum of this side's floating-origin shifts
  private endWhy = '';
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  // host
  private hosting = false;      // host wrappers installed
  private inp: RemoteInput | null = null;
  private inAge = 99;
  private inWall = 0;
  private gunCd = 0;
  private gunShots = 0;
  private snapAcc = 0;
  private tracers: number[][] = [];
  private tracerSeen = 0;
  private hits: number[] = [];
  private pbHits: number[] = [];
  private tracked = new Map<number, Aircraft>();
  private guestKills = new Set<number>();
  private lastT = 0;
  private endSent = false;
  private sentWx = '';
  private lastBump = -99;
  // guest
  private puppeting = false;    // guest wrappers installed
  private tracks = new Map<number, Track>();
  private proxies = new Map<number, Aircraft>();
  private known = new WeakSet<Aircraft>();
  private flags = new WeakMap<Aircraft, number>();
  private dead = new Map<number, number>();         // host id -> rt it died (ignore its tracks)
  private pendingDeath = new Map<number, number>(); // host id -> rt deadline to wait for the kill event
  private meta: any = null;
  private latestTm = -1;
  private rt = -1;
  private mapped = false;
  private pbLocal: Bomber | null = null;
  private trq: { t: number; d: number[] }[] = [];
  private inAcc = 0;
  private trailAcc = 0;
  private hostState = 'playing';

  constructor(private game: Game, private engine: Engine, private ui: UI) {
    this.screen = new CoopScreen({
      host: () => { void this.host(); },
      join: (c) => { void this.join(c); },
      seat: (s) => this.pickSeat(s),
      start: () => this.startHostMission(),
      leave: () => { this.leave(); this.screen.menu(); },
      back: () => { this.leave(); this.game.startMenu(); },
    });
  }

  // ---------------- hooks ----------------

  // Game.startMenu(): a title screen means any co-op game is over; (re)add the menu entry
  onTitle() {
    if (this.phase !== 'idle') this.leave();
    this.screen.titleButton(() => this.screen.menu());
  }

  // Game.direct(): the guest never runs the director, spawns or end conditions
  get blocksDirector() { return this.role === 'guest' && this.phase === 'mission'; }

  // Game.frame(), right after world.update(dt)
  update(dt: number) {
    const link = this.link;
    this.screen.setPing(link?.rtt ?? -1, !!link && link.status === 'open');
    if (this.phase !== 'mission' || !link) return;
    if (this.role === 'host') this.hostTick(dt);
    else this.guestTick(dt);
  }

  get partnerSeat(): StationId | null {
    if (!this.connected) return null;
    return this.role === 'host' ? this.guestSeat : this.role === 'guest' ? this.hostSeat : null;
  }

  // ---------------- session ----------------

  private newLink(role: 'host' | 'guest', iceServers?: RTCIceServer[]) {
    const link = new CoopLink(role, iceServers);
    this.link = link;
    link.onOpen = () => this.onOpen(link);
    link.onClose = (why) => this.onLinkClosed(link, why);
    link.onEvent = (m) => { if (this.link === link) this.onEvent(m); };
    link.onState = (m) => { if (this.link === link) { if (role === 'host') this.onInput(m); else this.onSnap(m); } };
    if (role === 'host') link.pingInfo = () => this.game.state;
    else link.onPingInfo = (x) => { this.hostState = String(x); };
    return link;
  }

  private async host() {
    this.leave();
    this.role = 'host'; this.phase = 'lobby';
    this.hostSeat = 'waistL'; this.guestSeat = 'waistR';
    this.screen.busy('Creating a game…');
    const attempt = this.connectionAttempt;
    const ice = await fetchIceServers();
    if (attempt !== this.connectionAttempt) return;
    const link = this.newLink('host', ice);
    try {
      const sig = await hostSignal(link.pc, (e) => console.warn('Co-op: signalling', e));
      if (this.link !== link) { void sig.close(); return; }
      this.signal = sig;
      this.code = sig.code;
      this.renderLobby('Waiting for your partner to join…');
    } catch (e) {
      if (this.link !== link) return;
      console.warn('Co-op: hosting failed', e);
      this.leave();
      this.screen.menu('Could not create a game. Check your connection and try again.');
    }
  }

  private async join(input: string) {
    const code = normalizeCode(input);
    if (!code) { this.screen.menu('A join code is 6 letters and digits.', input); return; }
    this.leave();
    this.role = 'guest'; this.phase = 'lobby'; this.code = code;
    this.screen.busy(`Joining ${code}…`);
    const attempt = this.connectionAttempt;
    const ice = await fetchIceServers();
    if (attempt !== this.connectionAttempt) return;
    const link = this.newLink('guest', ice);
    try {
      const sig = await joinSignal(link.pc, code, (e) => console.warn('Co-op: signalling', e));
      if (this.link !== link) { void sig.close(); return; }
      this.signal = sig;
      this.screen.busy('Connecting to the host…');
      this.connectTimer = setTimeout(() => {
        if (this.link !== link || this.connected) return;
        this.leave();
        this.screen.menu('Could not connect to the host. Try another network or try again.', code);
      }, CONNECT_TIMEOUT_MS);
    } catch (e) {
      if (this.link !== link) return;
      console.warn('Co-op: join failed', e);
      this.leave();
      this.screen.menu(e instanceof RoomError ? e.message : 'Could not reach the game server. Check your connection.', code);
    }
  }

  private onOpen(link: CoopLink) {
    if (this.link !== link) return;
    this.connected = true;
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    // connected: the room has done its job (the host deletes it, freeing the code)
    void this.signal?.close();
    this.signal = null;
    if (this.role === 'host') { this.sendLobby(); this.renderLobby('Partner connected — pick your guns and start'); sound.confirm('kill_confirm'); }
    else { link.sendEvent({ t: 'hello', name: this.myName }); this.renderLobby('Connected — waiting for the host to start'); }
  }

  // The user leaves (or a title screen appears): tell the partner, drop everything
  leave() {
    this.connectionAttempt++;
    this.myName = cleanName(savedName());
    const link = this.link;
    this.link = null;
    link?.close('local', true);
    this.reset();
  }

  private reset() {
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    void this.signal?.close();
    this.signal = null;
    this.teardownHost();
    this.teardownGuest();
    this.link = null;
    this.connected = false;
    this.role = null;
    this.phase = 'idle';
    this.mission = null;
    this.endWhy = '';
    this.code = '';
    this.run = 0; this.rewardedRun = 0; this.result = null; this.partnerReady = true;
    this.engine.paused = false;
    this.screen.waiting(null);
    this.screen.markPartner(null);
    this.screen.setPing(-1, false);
  }

  private onLinkClosed(link: CoopLink, why: 'left' | 'lost' | 'local') {
    if (why === 'local' || this.link !== link) return;
    const role = this.role, phase = this.phase, ended = !!this.endWhy;
    if (phase === 'debrief') { this.connected = false; this.screen.toast('Partner disconnected'); return; }
    if (role === 'host') {
      if (phase === 'mission') {
        // the battle goes on: the AI crewman takes the gun back
        this.teardownHost();
        this.link = null; this.connected = false;
        void this.signal?.close(); this.signal = null;
        if (!ended) { this.ui.tip(why === 'left' ? 'Your partner left — carrying on alone' : 'Lost your partner — carrying on alone', 4000); this.ui.feed('Partner disconnected', 'loss'); }
      } else {
        this.reset();
        this.screen.menu(why === 'left' ? 'Your partner left.' : 'The connection to your partner was lost.');
      }
      return;
    }
    const msg = ended ? `Mission over — ${this.endWhy}` : why === 'left' ? 'The host left the game. Co-op session ended.' : 'Lost the connection to the host. Co-op session ended.';
    this.reset();
    if (phase === 'mission') { this.game.startMenu(); this.screen.toast(msg, 6000); }
    else this.screen.menu(msg);
  }

  private renderLobby(status: string) {
    if (!this.role || this.phase !== 'lobby') return;
    this.lobbyStatus = status;
    this.screen.lobby({
      role: this.role, code: this.code, status, connected: this.connected && this.partnerReady,
      mine: this.role === 'host' ? this.hostSeat : this.guestSeat,
      partner: this.partnerSeat,
    });
  }
  private lobbyStatus = '';

  private sendLobby() { this.link?.sendEvent({ t: 'lobby', hs: this.hostSeat, gs: this.guestSeat, name: this.myName }); }

  private pickSeat(s: StationId) {
    if (this.phase !== 'lobby' || !(s in STATIONS)) return;
    if (this.role === 'host') {
      if (this.connected && s === this.guestSeat) return;
      this.hostSeat = s;
      this.sendLobby();
    } else {
      if (s === this.hostSeat) return;
      this.guestSeat = s;   // optimistic; the host's lobby message confirms
      this.link?.sendEvent({ t: 'seat', s });
    }
    this.renderLobby(this.lobbyStatus);
  }

  private onEvent(m: any) {
    switch (m.t) {
      // ---- to the host ----
      case 'hello':
        if (this.role === 'host') { this.partnerName = cleanName(String(m.name ?? 'Walsh')); this.sendLobby(); }
        break;
      case 'ready':
        if (this.role === 'host' && m.run === this.run) { this.partnerReady = true; this.renderLobby('Partner connected — pick your guns and start'); }
        break;
      case 'debrief':
        if (this.role === 'guest' && this.phase === 'mission' && m.run === this.run && isCoopDebrief(m)) this.presentDebrief(m);
        break;
      case 'seat':
        if (this.role === 'host' && this.phase === 'lobby' && m.s in STATIONS && m.s !== this.hostSeat) this.guestSeat = m.s;
        if (this.role === 'host') { this.sendLobby(); this.renderLobby(this.lobbyStatus); }
        break;
      // ---- to the guest ----
      case 'lobby':
        if (this.role !== 'guest') break;
        this.partnerName = cleanName(String(m.name ?? 'Gunner'));
        if (m.hs in STATIONS) this.hostSeat = m.hs;
        if (m.gs in STATIONS) this.guestSeat = m.gs;
        this.renderLobby(this.lobbyStatus);
        break;
      case 'start': if (this.role === 'guest' && (this.phase === 'lobby' || this.phase === 'mission')) this.startGuestMission(m); break;
      case 'k': if (this.role === 'guest' && this.phase === 'mission' && m.run === this.run) this.onKill(Number(m.id), m.g === 1); break;
      case 'h': if (this.role === 'guest' && this.phase === 'mission' && m.run === this.run && Array.isArray(m.l)) this.onHits(m.l); break;
      case 'bump':
        if (this.role === 'guest' && m.s in STATIONS) {
          this.guestSeat = m.s;
          this.reqStation0?.call(this.game.gunner, m.s);
          this.ui.tip('Your partner took that gun', 2200);
        }
        break;
      case 'wx':
        if (this.role === 'guest' && typeof m.w === 'string') {
          try { const w = JSON.parse(m.w) as Weather; this.game.world.contrails.enabled = w.contrails !== false; applyWeather(this.engine, w); } catch { /* ignore */ }
        }
        break;
      case 'end':
        if (this.role === 'guest' && this.phase === 'mission' && m.run === this.run && !this.endWhy) {
          this.endWhy = String(m.why ?? 'The mission is over.').slice(0, 200);
          this.ui.banner('MISSION OVER', this.endWhy.length > 70 ? 'The Fortress is lost' : this.endWhy, 5000);
          this.hostState = 'ending';
          this.devFire = false;
        }
        break;
    }
  }

  // Pause-menu restarts are host-controlled and get a fresh protocol epoch on both peers.
  restart(): boolean {
    if (this.phase !== 'mission' || !this.role) return false;
    if (this.role === 'guest') { this.ui.tip('Waiting for the host…', 2200); return true; }
    if (!this.connected) { this.leave(); return false; }
    this.teardownHost(); this.phase = 'lobby'; this.partnerReady = true;
    this.startHostMission();
    return true;
  }

  private beginRun(run: number) {
    this.run = run; this.result = null; this.endWhy = ''; this.partnerReady = false;
    this.hostScore = emptyGunnerScore(); this.guestScore = emptyGunnerScore();
    this.guestTally.reset(); this.guestStreak = 0; this.guestLastKill = -99;
    this.stats.guestKills = this.stats.guestHits = this.stats.guestRounds = 0;
    this.devFire = false;
  }

  private readHostScore() {
    const s = this.game.world.stats;
    this.hostScore.kills = s.kills; this.hostScore.hits = s.hits; this.hostScore.shots = s.shots;
    return this.hostScore;
  }

  // MissionFlow delegates co-op results here, before the solo rewards/leaderboard path.
  showDebrief(): boolean {
    if (!this.role || !this.mission || this.phase === 'idle') return false;
    if (this.role === 'guest' || this.result) return true;
    const g = this.game, w = g.world, r = g.endResult;
    if (!r) return true;
    const host = this.readHostScore(), crew = mergeCrew(host, this.guestScore);
    if (r.success) g.score += 500 + w.bombers().filter(b => b.alive).length * 50 + Math.round((crew.shots ? crew.hits / crew.shots : 0) * 300);
    const result = buildCoopDebrief(this.run, {
      success: r.success, title: this.mission.title, reason: r.reason, kills: 0, accuracy: 0,
      bombersLost: w.stats.bombersLost, bombersTotal: this.mission.bombers, time: w.time,
      score: g.score, medals: [], survival: true, waves: g.roundIdx + (r.success ? 1 : 0), nextAvailable: false,
    }, host, this.guestScore, w.combatLosses, w.crewWounded > 0);
    const tally = (t: CombatTally) => ({ bestStreak: t.bestStreak, closestKill: Number.isFinite(t.closestKill) ? t.closestKill : null, killsByGun: t.killsByGun() });
    Object.assign(result.host, tally(g.tally)); Object.assign(result.guest, tally(this.guestTally));
    this.link?.sendEvent(result);
    this.presentDebrief(result);
    return true;
  }

  private presentDebrief(result: CoopDebrief) {
    if (result.run <= this.rewardedRun || !this.mission) return;
    this.rewardedRun = result.run; this.result = result; this.phase = 'debrief';
    const g = this.game, d = this.role === 'host' ? result.host : result.guest;
    g.score = result.crew.score;
    Object.assign(g.world.stats, { kills: d.kills, shots: d.rounds, hits: d.hits, bombersLost: d.bombersLost });
    g.endResult = { success: d.success, reason: d.reason };
    g.state = 'debrief'; this.engine.paused = true; g.input.unlock();
    this.screen.waiting(null); this.screen.markPartner(null);
    sound.stopSpeech(); sound.music.stinger(d.success); sound.setMode('menu');
    achievements.endMission(d.success, d.rounds!, d.hits!);
    crewRoster.endMission(d.success);
    g.prog.earn(d.merit ?? 0); d.points = g.prog.points;
    const h = {
      next: () => this.returnToLobby(), retry: () => this.returnToLobby(), menu: () => g.startMenu(),
      armory: () => g.ui.armory(g.prog, () => { g.ui.debrief({ ...d, points: g.prog.points }, h); }),
    };
    g.ui.debrief(d, h);
    g.service.onDebrief(this.mission, d, d.medals);
    const box = document.querySelector<HTMLElement>('#debrief .box');
    if (box) mountLeaderboard(box, 'coop-gunner', 'CREW LEADERBOARD', this.role === 'host' ? {
      name: crewName(this.myName, this.partnerName), mode: 'coop-gunner', score: result.crew.score,
      kills: result.crew.kills, rounds: d.waves ?? 0,
    } : undefined);
  }

  private returnToLobby() {
    if (!this.connected || this.link?.status !== 'open') { this.game.startMenu(); return; }
    this.teardownHost(); this.teardownGuest();
    this.phase = 'lobby'; this.mission = null;
    this.game.state = 'paused'; this.engine.paused = true;
    if (this.role === 'guest') this.link.sendEvent({ t: 'ready', run: this.run });
    this.renderLobby(this.role === 'host' && !this.partnerReady ? 'Waiting for your partner to return…' : this.role === 'host' ? 'Partner connected — pick your guns and start' : 'Connected — waiting for the host to start');
  }

  // ---------------- mission start ----------------

  private coopMission(station: StationId, weather?: Weather): Mission {
    return { ...survivalMission('gunner'), station, weather, title: 'Co-op Survival — Gunners' };
  }

  private startHostMission() {
    if (this.role !== 'host' || this.phase !== 'lobby' || !this.connected || !this.partnerReady || !this.link) return;
    this.beginRun(++this.run);
    const presets = CAMPAIGN.map((c) => c.weather).filter((w): w is Weather => !!w);
    const weather = presets[Math.floor(Math.random() * presets.length)];
    const m = this.coopMission(this.hostSeat, weather);
    this.mission = m;
    this.phase = 'mission';
    this.screen.hide();
    this.link.sendEvent({ t: 'start', run: this.run, w: weather, hs: this.hostSeat, gs: this.guestSeat });
    this.installHost();
    this.engine.paused = false;
    this.game.startMission(m);
  }

  private startGuestMission(msg: any) {
    if (!Number.isSafeInteger(msg.run) || msg.run <= this.run) return;
    this.teardownGuest();
    this.beginRun(msg.run);
    if (msg.hs in STATIONS) this.hostSeat = msg.hs;
    if (msg.gs in STATIONS) this.guestSeat = msg.gs;
    const m = this.coopMission(this.guestSeat, msg.w && typeof msg.w === 'object' ? msg.w as Weather : undefined);
    this.mission = m;
    this.phase = 'mission';
    this.screen.hide();
    this.installGuest();
    this.engine.paused = false;
    this.game.startMission(m);
  }

  // instance wrappers shared by both sides
  private reqStation0: ((id: StationId) => void) | null = null;
  private wrapCommon() {
    const w = this.game.world, g = this.game.gunner;
    this.origin.set(0, 0, 0);
    const rebase0 = Object.getPrototypeOf(w).rebase as (off: THREE.Vector3) => void;
    (w as any).rebase = (off: THREE.Vector3) => { this.origin.add(off); rebase0.call(w, off); };
    const req0 = Object.getPrototypeOf(g).requestStation as (id: StationId) => void;
    this.reqStation0 = req0;
    (g as any).requestStation = (id: StationId) => {
      if (this.connected && id === this.partnerSeat) { g.onNotice?.(`PARTNER is on the ${STATIONS[id].label.toUpperCase()}`); return; }
      req0.call(g, id);
    };
  }
  private unwrapCommon() {
    delete (this.game.world as any).rebase;
    delete (this.game.gunner as any).requestStation;
    this.reqStation0 = null;
  }

  // ---------------- host ----------------

  private installHost() {
    if (this.hosting) return;
    this.hosting = true;
    const w = this.game.world, bal = w.ballistics;
    this.wrapCommon();
    w.remoteStations.clear();
    w.remoteStations.add(this.guestSeat);
    this.inp = null; this.inAge = 99; this.gunCd = 0; this.snapAcc = 0;
    this.tracers = []; this.tracerSeen = 0; this.hits = []; this.pbHits = [];
    this.tracked.clear(); this.guestKills.clear(); this.lastT = 0; this.endSent = false; this.sentWx = '';
    this.kill0 = w.events.kill;
    w.events.kill = (victim, byPlayer, cause) => {
      if (victim.team === 'axis' && victim.lastAttacker === REMOTE) {
        if (byPlayer) w.stats.kills--; // the world may credit an earlier host assist
        this.guestScore.kills++; this.stats.guestKills++;
        this.guestKills.add(victim.id);
        const base = victim instanceof Fighter ? ENEMY_VARIANTS[victim.enemyType as EnemyType]?.score ?? 100 : 100;
        const points = Math.round(base * (1 + this.game.roundIdx * 0.1) * this.game.loadout.scoreMult);
        this.guestScore.score += points; this.game.score += points;
        this.game.killsSincePerk++;
        this.guestStreak = w.time - this.guestLastKill < 9 ? this.guestStreak + 1 : 1;
        this.guestLastKill = w.time;
        this.guestTally.recordKill(this.guestStreak, victim.pos.distanceTo(w.playerBomber!.pos), STATIONS[this.guestSeat]);
        this.ui.feed(tx('{name} (partner) destroyed {target}', { name: this.partnerName, target: tx(victim.label) }), 'mine');
        return;
      }
      const before = this.game.score;
      this.kill0?.(victim, byPlayer, cause);
      if (byPlayer && victim.team === 'axis') this.hostScore.score += this.game.score - before;
    };
    // tracers for the guest (a sample of every gun's tracer rounds except the guest's own)
    const fire0 = Object.getPrototypeOf(bal).fire as typeof bal.fire;
    (bal as any).fire = (pos: THREE.Vector3, vel: THREE.Vector3, team: 'allied' | 'axis', damage: number, tracer: boolean, color: [number, number, number], owner: Aircraft | null, cannon = false, player = false, ttl = 2.6) => {
      if (tracer && owner !== REMOTE) this.captureTracer(pos, vel, team, color, cannon);
      return fire0.call(bal, pos, vel, team, damage, tracer, color, owner, cannon, player, ttl);
    };
    const hit0 = bal.onHit;
    (bal as any).__coopHit0 = hit0;
    bal.onHit = (e: HitEvent) => {
      if (e.shooter !== REMOTE) {
        if (e.target === w.playerBomber && this.pbHits.length < 16) this.pbHits.push(Math.max(0, w.playerBomber.zones.indexOf(e.zone)), e.cannon ? 1 : 0);
        if (e.playerShot && e.target.alive && e.target.team === 'axis') { this.hostScore.score += 5; this.game.score += 5; }
        hit0?.(e);
        return;
      }
      // REMOTE stays the last attacker, including delayed fire/structural deaths.
      const t = e.target;
      if (t.alive && t.team === 'axis') {
        this.stats.guestHits++; this.guestScore.hits++;
        this.guestScore.score += 5; this.game.score += 5;
      }
      hit0?.(e);
      if (this.hits.length < 64) { const l = t.worldToLocal(e.point, _v); this.hits.push(t.id, r2(l.x), r2(l.y), r2(l.z)); }
    };
  }

  private teardownHost() {
    if (!this.hosting) return;
    this.hosting = false;
    const w = this.game.world, bal = w.ballistics as any;
    w.remoteStations.clear();
    w.events.kill = this.kill0; this.kill0 = undefined;
    delete bal.fire;
    if ('__coopHit0' in bal) { bal.onHit = bal.__coopHit0; delete bal.__coopHit0; }
    this.unwrapCommon();
    this.tracked.clear();
  }

  private captureTracer(pos: THREE.Vector3, vel: THREE.Vector3, team: 'allied' | 'axis', color: [number, number, number], cannon: boolean) {
    const pb = this.game.world.playerBomber;
    if (pb && pos.distanceToSquared(pb.pos) > 3000 * 3000) return;
    const o = this.origin;
    const rec = [r2(pos.x + o.x), r2(pos.y + o.y), r2(pos.z + o.z), Math.round(vel.x), Math.round(vel.y), Math.round(vel.z),
      r2(color[0]), r2(color[1]), r2(color[2]), (cannon ? 1 : 0) | (team === 'axis' ? 2 : 0)];
    // reservoir sample: an even spread of everything fired since the last snapshot
    this.tracerSeen++;
    if (this.tracers.length < TRACERS_PER_SNAP) this.tracers.push(rec);
    else { const j = Math.floor(Math.random() * this.tracerSeen); if (j < TRACERS_PER_SNAP) this.tracers[j] = rec; }
  }

  private onInput(m: any) {
    if (this.role !== 'host' || this.phase !== 'mission' || m.run !== this.run || m.t !== 'i' || !(m.s in STATIONS) || !Number.isFinite(m.y) || !Number.isFinite(m.p)) return;
    this.stats.inputsRecv++;
    const s = m.s as StationId;
    const def = STATIONS[s];
    // keep the aim inside the station's field of fire
    let ry = wrapAngle(m.y - def.rest.yaw);
    if (def.yaw[1] - def.yaw[0] < Math.PI * 1.99) ry = THREE.MathUtils.clamp(ry, def.yaw[0], def.yaw[1]);
    const p = THREE.MathUtils.clamp(m.p, def.pitch[0], def.pitch[1]);
    this.inp = { s, y: def.rest.yaw + ry, p, f: m.f === 1 };
    this.inAge = 0;
    this.inWall = performance.now();
    if (this.phase !== 'mission' || !this.hosting || s === this.guestSeat) return;
    const w = this.game.world;
    if (s === this.game.gunner.station) {
      // both took the same gun at once: the host keeps it, the guest goes back
      this.inp.f = false;
      if (w.time - this.lastBump > 0.5) { this.lastBump = w.time; this.link?.sendEvent({ t: 'bump', s: this.guestSeat }); }
      return;
    }
    w.remoteStations.delete(this.guestSeat);
    this.guestSeat = s;
    w.remoteStations.add(s);
  }

  private hostTick(dt: number) {
    const g = this.game, w = g.world, link = this.link!;
    if (!this.hosting) return;
    if (w.time < this.lastT) { this.tracked.clear(); this.guestKills.clear(); this.endSent = false; } // mission restarted
    this.lastT = w.time;
    this.hostSeat = g.gunner.station;
    this.screen.markPartner(this.connected ? this.guestSeat : null);
    this.remoteGun(dt);
    // kills: anything alive last frame that is not now
    for (const [id, a] of this.tracked) {
      if (!a.alive) { link.sendEvent({ t: 'k', run: this.run, id, g: this.guestKills.has(id) ? 1 : 0 }); this.tracked.delete(id); this.guestKills.delete(id); }
      else if (a.remove) this.tracked.delete(id);
    }
    for (const a of w.aircraft) if (a.alive && !a.remove && !this.tracked.has(a.id) && kindOf(a)) this.tracked.set(a.id, a);
    if (this.hits.length) { link.sendEvent({ t: 'h', run: this.run, l: this.hits }); this.hits = []; }
    // weather changes between rounds
    const wk = (g as any).weatherKey;
    if (typeof wk === 'string' && wk && wk !== this.sentWx) { this.sentWx = wk; link.sendEvent({ t: 'wx', w: wk }); }
    // snapshots at 20 Hz of real time (slow-motion slows the world, not the stream)
    this.snapAcc += dt / Math.max(0.05, this.engine.timeScale);
    if (this.snapAcc >= 1 / SNAP_HZ) {
      this.snapAcc = Math.min(this.snapAcc - 1 / SNAP_HZ, 1 / SNAP_HZ);
      if (link.sendState(this.buildSnap())) this.stats.snapsSent++;
      this.tracers = []; this.tracerSeen = 0; this.pbHits = [];
    }
    if ((g.state === 'ending' || g.state === 'debrief') && !this.endSent) {
      this.endSent = true;
      const why = (g as any).endResult?.reason;
      link.sendEvent({ t: 'end', run: this.run, why: typeof why === 'string' ? why : 'The mission is over.' });
      this.endWhy = 'ended';
    }
  }

  // The guest's gun, fired here with the guest's aim: real rounds in the host's world
  private remoteGun(dt: number) {
    const w = this.game.world, pb = w.playerBomber, inp = this.inp;
    this.inAge += dt;
    if (!pb || !pb.alive || !inp || inp.s !== this.guestSeat) return;
    const def = STATIONS[this.guestSeat];
    const local = dirFromYawPitch(inp.y, inp.p, _remoteDir);
    const tg = pb.guns.get(this.guestSeat);
    if (tg) { if (!tg.want) tg.want = new THREE.Vector3(); tg.want.copy(local); }   // swing the visible gun / turret on the ship
    const live = this.inAge < INPUT_STALE || performance.now() - this.inWall < INPUT_STALE * 1000;
    const state = this.game.state;
    if (!inp.f || !live || (state !== 'playing' && state !== 'ending')) { if (this.gunCd < 0) this.gunCd = 0; return; }
    const lo = this.game.gunner.loadout, W = lo.weapon;
    const rate = W.rate * lo.rate;
    this.gunCd -= dt;
    let n = 0;
    while (this.gunCd <= 0 && n++ < 8) {
      this.gunCd += 1 / rate;
      const pivot = pb.localToWorld(_v.copy(def.pivot));
      const dir = _v2.copy(local).applyQuaternion(pb.quat);
      const sp = W.spread * lo.spread;
      dir.x += R() * sp; dir.y += R() * sp; dir.z += R() * sp;
      dir.normalize();
      const muzzle = pivot.addScaledVector(dir, 1.3);
      const vel = _remoteVel.copy(dir).multiplyScalar(W.velocity * lo.velocity).add(pb.vel);
      this.gunShots++;
      w.ballistics.fire(muzzle, vel, 'allied', W.damage * lo.damage, this.gunShots % W.tracerEvery === 0, W.tracer, REMOTE, !!W.cannon, false);
      this.stats.guestRounds++; this.guestScore.shots++;
      if (this.gunShots % 2 === 0) w.effects.muzzleFlash(muzzle, dir, 0.8, pb.vel);
      if (this.gunShots % 3 === 0) sound.play('m2far', muzzle, { gain: 0.55, ref: 8 });
    }
  }

  private buildSnap() {
    const w = this.game.world, o = this.origin, pb = w.playerBomber;
    const a: SnapAircraft[] = [];
    for (const ac of w.aircraft) {
      if (ac.remove) continue;
      const kind = kindOf(ac);
      if (!kind) continue;
      let f = ac.alive ? F_ALIVE : 0;
      if (ac === pb) f |= F_PB;
      for (const z of ac.zones) {
        if (z.burning) f |= F_BURN;
        if (z.engine !== undefined && z.hp < z.maxHp * 0.65) f |= F_SMOKE;
      }
      if (ac instanceof Bomber) ac.engineDead.forEach((d, i) => { if (d) f |= F_ENG0 << i; });
      const fr = ac instanceof Fighter ? ac.structureFrac : ac.integrity;
      const p = ac.pos, q = ac.quat;
      a.push([ac.id, kind, r2(p.x + o.x), r2(p.y + o.y), r2(p.z + o.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w), f, r2(fr)]);
    }
    const g = this.game.gunner;
    const fc = w.formationCenter, ff = w.formationForward;
    const msg: any = {
      t: 's', run: this.run, tm: r4(w.time), a,
      score: this.game.score, host: this.readHostScore(), guest: this.guestScore, round: this.game.roundIdx, perks: this.game.prog.perks,
      fc: [r2(fc.x + o.x), r2(fc.y + o.y), r2(fc.z + o.z)], ff: [r4(ff.x), r4(ff.y), r4(ff.z)],
      hs: g.station, ha: [r4(g.def.rest.yaw + g.state.yaw), r4(g.def.rest.pitch + g.state.pitch)],
      z: pb ? pb.zones.map((z) => r2(Math.max(0, z.hp) / z.maxHp)) : [],
      ph: this.pbHits, tr: this.tracers.flat(),
    };
    if (JSON.stringify(msg).length > MAX_SNAP_CHARS) msg.tr = [];
    return msg;
  }

  // ---------------- guest ----------------

  private installGuest() {
    if (this.puppeting) return;
    this.puppeting = true;
    const w = this.game.world;
    this.wrapCommon();
    this.resetProxies();
    this.tracks.clear(); this.dead.clear(); this.trq = [];
    this.meta = null; this.latestTm = -1; this.rt = -1; this.hostState = 'playing';
    const update0 = Object.getPrototypeOf(w).update as (dt: number) => void;
    (w as any).update = (dt: number) => {
      if (this.role === 'guest' && this.phase === 'mission' && this.game.mission === this.mission && this.mission) this.puppet(dt);
      else update0.call(w, dt);
    };
  }

  private teardownGuest() {
    if (!this.puppeting) return;
    this.puppeting = false;
    delete (this.game.world as any).update;
    this.unwrapCommon();
    this.tracks.clear(); this.proxies.clear(); this.dead.clear(); this.pendingDeath.clear(); this.trq = [];
  }

  private resetProxies() {
    this.proxies.clear();
    this.known = new WeakSet();
    this.pendingDeath.clear();
    this.mapped = false;
    this.pbLocal = this.game.world.playerBomber;
  }

  private onSnap(m: any) {
    if (this.role !== 'guest' || this.phase !== 'mission' || m.run !== this.run || m.t !== 's' || typeof m.tm !== 'number' || !Array.isArray(m.a)) return;
    if (m.tm <= this.latestTm) return; // same-run late or duplicate unreliable packet
    if (m.host && m.guest && Number.isFinite(m.score)) {
      this.hostScore = m.host; this.guestScore = m.guest;
      this.game.score = m.score;
      const stats = this.game.world.stats;
      stats.kills = m.guest.kills; stats.hits = m.guest.hits; stats.shots = m.guest.shots;
      this.game.roundIdx = m.round;
      if (Array.isArray(m.perks) && (m.perks.length !== this.game.prog.perks.length || m.perks.some((p: string, i: number) => p !== this.game.prog.perks[i]))) {
        this.game.prog.perks = m.perks; this.game.applyLoadout();
      }
    }
    this.stats.snapsRecv++;
    this.latestTm = m.tm;
    this.meta = m;
    for (const e of m.a as SnapAircraft[]) {
      if (!Array.isArray(e) || e.length < 11 || !Number.isFinite(e[2]) || !Number.isFinite(e[8])) continue;
      const id = e[0];
      let tr = this.tracks.get(id);
      if (!tr) this.tracks.set(id, tr = { kind: String(e[1]), s: [], seen: m.tm });
      tr.seen = m.tm;
      tr.s.push({ t: m.tm, p: new THREE.Vector3(e[2], e[3], e[4]), q: new THREE.Quaternion(e[5], e[6], e[7], e[8]).normalize(), f: e[9] | 0, fr: Number(e[10]) || 0 });
      if (tr.s.length > 40) tr.s.shift();
    }
    if (Array.isArray(m.tr) && m.tr.length) this.trq.push({ t: m.tm, d: m.tr });
    if (this.trq.length > 60) this.trq.shift();
    // hits on our own ship: the knocks, flashes and sounds (the host has applied the damage)
    if (Array.isArray(m.ph) && this.game.mission === this.mission) {
      const w = this.game.world, pb = w.playerBomber;
      for (let i = 0; i + 1 < m.ph.length && pb; i += 2) {
        const z = pb.zones[m.ph[i] | 0], heavy = m.ph[i + 1] === 1;
        if (!z) continue;
        sound.playerImpact(heavy);
        w.events.shake?.(heavy ? 0.25 : 0.05);
        w.events.playerHit?.(z.name, heavy);
      }
    }
  }

  private guestTick(dt: number) {
    const g = this.game, gun = g.gunner, link = this.link!;
    if (g.mission !== this.mission) return;
    this.screen.markPartner(this.hostSeat);
    this.screen.waiting(this.hostState === 'paused' ? 'Waiting for the host…' : null);
    // our gun, to the host
    this.inAcc += dt / Math.max(0.05, this.engine.timeScale);
    if (this.inAcc >= 1 / INPUT_HZ && gun.bomber) {
      this.inAcc = Math.min(this.inAcc - 1 / INPUT_HZ, 1 / INPUT_HZ);
      const st = gun.state, def = gun.def;
      const fire = (gun.firing || this.devFire) && gun.transition <= 0 && g.state === 'playing' && this.hostState === 'playing' && !this.endWhy;
      if (link.sendState({ t: 'i', run: this.run, s: gun.station, y: r4(def.rest.yaw + st.yaw), p: r4(def.rest.pitch + st.pitch), f: fire ? 1 : 0 })) this.stats.inputsSent++;
    }
    this.guestSeat = gun.station;
  }

  // The guest's World.update: the host's battle, replayed
  private puppet(dt: number) {
    const w = this.game.world;
    if (dt <= 0) return;
    if (w.playerBomber !== this.pbLocal) this.resetProxies();   // the local mission was (re)started
    if (this.latestTm >= 0) {
      this.rt = advanceClock(this.rt, this.latestTm, dt);
      w.time = this.rt;
      if (!this.mapped && this.meta) this.mapBombers(this.meta.a);
      this.applyTracks();
      this.applyMeta();
      this.spawnTracers();
    } else w.time += dt;
    this.trailAcc += dt;
    const emit = this.trailAcc >= 0.05;
    if (emit) this.trailAcc = 0;
    for (const a of w.aircraft) {
      if (a.alive) { if (a instanceof Bomber) a.update(dt); else a.updateProps(dt, 1.2); }
      else a.update(dt, w.time);
      if (a instanceof Fighter) { updateDamageLook(a, w.time); updateDamageStages(a, dt, w.time, w.effects, w.listener); }
      if (a.hitFlash > 0) a.hitFlash -= dt;
      if (emit && a.alive) this.trails(a);
    }
    updateExhausts(w.aircraft, w.effects.glow);
    updateBomberDeath(dt);
    updateFighterDeath(dt);
    w.ballistics.update(dt, []);   // tracers fly; nothing can be hit here
    w.effects.update(dt);
    w.wrecks.update(dt);
    w.contrails.update(w.time);
    w.bomberDamage.update(dt);
    // anything the local game spawned on its own (abilities, events) is not part of the host's battle
    if (this.mapped) for (const a of w.aircraft) if (!this.known.has(a)) a.remove = true;
    let removed = false;
    for (const a of w.aircraft) if (a.remove && a !== w.playerBomber) { w.scene.remove(a.root); disposeOwned(a.root); removed = true; }
    if (removed) {
      w.aircraft = w.aircraft.filter((a) => !a.remove || a === w.playerBomber);
      for (const [id, a] of this.proxies) if (a.remove && a !== w.playerBomber) this.proxies.delete(id);
    }
  }

  // First snapshot of a mission: the host's B-17s are paired with ours (both formations were
  // built by the same code in the same order; the player's ship is flagged)
  private mapBombers(entries: SnapAircraft[]) {
    const w = this.game.world, pb = w.playerBomber;
    if (!pb) return;
    const hostB = entries.filter((e) => e[1] === 'B').sort((x, y) => x[0] - y[0]);
    const localB = w.bombers().filter((b) => b !== pb).sort((x, y) => x.id - y.id);
    for (const e of hostB) {
      if (e[9] & F_PB) this.bind(e[0], pb);
      else { const b = localB.shift(); if (b) this.bind(e[0], b); }
    }
    for (const b of localB) b.remove = true;
    this.known.add(pb);
    this.mapped = true;
    // kills that arrived before the first frame of the mission
    for (const [id, a] of this.proxies) if (this.dead.has(id) && a.alive) w.killAircraft(a, false, '');
  }

  private bind(id: number, a: Aircraft) { this.proxies.set(id, a); this.known.add(a); }

  private createProxy(id: number, tr: Track): Aircraft | null {
    const w = this.game.world, last = tr.s[tr.s.length - 1];
    if (!last || !(last.f & F_ALIVE)) return null;
    const pos = _v.copy(last.p).sub(this.origin);
    let a: Aircraft | null = null;
    if (tr.kind === 'B') {
      if (last.f & F_PB && w.playerBomber) {
        // the host's ship changed id (restart): ours follows it
        for (const [k, v] of this.proxies) if (v === w.playerBomber) this.proxies.delete(k);
        a = w.playerBomber;
      } else { const b = new Bomber(); b.root.position.copy(pos); w.add(b); a = b; }
    } else if (tr.kind === 'P') {
      a = w.spawnEscort(pos.clone(), new THREE.Vector3());
    } else if (tr.kind in ENEMY_VARIANTS) {
      a = w.spawnEnemy(pos.clone(), 'beam', 1, false, false, tr.kind as EnemyType);
    }
    if (!a) { this.dead.set(id, this.rt); return null; }  // unknown kind: never try again
    this.bind(id, a);
    return a;
  }

  private applyTracks() {
    const w = this.game.world, rt = this.rt;
    for (const [id, tr] of this.tracks) {
      // gone from the host's snapshots (left the battle, or long dead)
      if (this.latestTm - tr.seen > 1) {
        this.tracks.delete(id);
        const a = this.proxies.get(id);
        if (a && a.alive && a !== w.playerBomber) a.remove = true;
        continue;
      }
      while (tr.s.length > 2 && tr.s[1].t < rt - 0.5) tr.s.shift();
      if (this.dead.has(id)) continue;
      let a = this.proxies.get(id);
      if (!a) { if (!this.mapped) continue; a = this.createProxy(id, tr) ?? undefined; if (!a) continue; }
      if (!a.alive) continue;   // the local death animation owns it now
      sampleTrack(tr.s, rt, a.root.position, a.root.quaternion, a.vel);
      a.root.position.sub(this.origin);
      if (a instanceof Fighter) a.fm.vel.copy(a.vel);
      // the newest flags (deaths come through the kill event; this is the fallback)
      const last = tr.s[tr.s.length - 1];
      this.flags.set(a, last.f);
      if (a instanceof Fighter && Number.isFinite(a.maxStructure)) a.structure = Math.max(1e-3, last.fr) * a.maxStructure;
      if (a instanceof Bomber) for (let i = 0; i < a.engineDead.length; i++) a.engineDead[i] = !!(last.f & (F_ENG0 << i));
      if (!(last.f & F_ALIVE)) {
        const due = this.pendingDeath.get(id);
        if (due === undefined) this.pendingDeath.set(id, rt + 0.35);
        else if (rt >= due) this.onKill(id, false);
      }
    }
    for (const [id, t] of this.dead) if (rt - t > 60) this.dead.delete(id);
  }

  private applyMeta() {
    const m = this.meta, w = this.game.world, pb = w.playerBomber;
    if (!m) return;
    if (Array.isArray(m.fc) && m.fc.length === 3) w.formationCenter.set(m.fc[0], m.fc[1], m.fc[2]).sub(this.origin);
    if (Array.isArray(m.ff) && m.ff.length === 3) w.formationForward.set(m.ff[0], m.ff[1], m.ff[2]).normalize();
    if (m.hs in STATIONS) this.hostSeat = m.hs;
    if (pb && pb.alive) {
      if (Array.isArray(m.z)) pb.zones.forEach((z, i) => { const f = Number(m.z[i]); if (Number.isFinite(f)) z.hp = f * z.maxHp; });
      // the partner's gun swings on our ship
      const tg = pb.guns.get(this.hostSeat);
      if (tg && Array.isArray(m.ha)) tg.want = dirFromYawPitch(Number(m.ha[0]) || 0, Number(m.ha[1]) || 0, new THREE.Vector3());
    }
  }

  private spawnTracers() {
    const w = this.game.world, rt = this.rt, o = this.origin;
    while (this.trq.length && this.trq[0].t <= rt + 0.05) {
      const { t, d } = this.trq.shift()!;
      const age = Math.max(0, rt - t);
      if (age > 1.5) continue;
      for (let i = 0; i + 9 < d.length; i += 10) {
        const vel = new THREE.Vector3(d[i + 3], d[i + 4], d[i + 5]);
        const pos = new THREE.Vector3(d[i] - o.x, d[i + 1] - o.y, d[i + 2] - o.z).addScaledVector(vel, age);
        w.ballistics.fire(pos, vel, d[i + 9] & 2 ? 'axis' : 'allied', 0, true, [d[i + 6], d[i + 7], d[i + 8]], null, !!(d[i + 9] & 1), false, 2.6 - age);
      }
    }
  }

  // smoke and fire trails from damaged engines (World.damageEffects runs only on the host)
  private trails(a: Aircraft) {
    const f = this.flags.get(a) ?? 0;
    if (!(f & (F_BURN | F_SMOKE))) return;
    const fx = this.game.world.effects;
    for (const z of a.zones) {
      if (z.engine === undefined) continue;
      if (a instanceof Bomber && !(f & (F_ENG0 << z.engine))) continue;
      const p = a.localToWorld(_v.copy(z.offset).add(_v2.set(0, 0.2, -0.6)), new THREE.Vector3());
      fx.trail(p, a.vel, a instanceof Bomber ? 1 : 0.7, !!(f & F_BURN), a instanceof Bomber ? 1.3 : 0.8);
      if (a instanceof Bomber) break;
    }
  }

  private onKill(id: number, byGuest: boolean) {
    this.stats.killsRecv++;
    this.pendingDeath.delete(id);
    const a = this.proxies.get(id);
    this.dead.set(id, this.rt);
    if (!a || !a.alive || this.game.mission !== this.mission) return;
    // the full local death: fireball / wing off / spin, kill feed, and our score when it was ours
    const g = this.game, score = g.score, kills = g.world.stats.kills;
    if (!byGuest) a.playerDamage = -1; // proxy has no damage ledger; 0 >= 0 is not an assist
    g.world.killAircraft(a, byGuest, '');
    g.score = score; g.world.stats.kills = kills; // authoritative totals come from the host

  }

  private onHits(l: unknown[]) {
    const w = this.game.world;
    if (this.game.mission !== this.mission) return;
    let any = false;
    for (let i = 0; i + 3 < l.length; i += 4) {
      const a = this.proxies.get(Number(l[i]));
      if (!a) continue;
      const p = a.localToWorld(_v.set(Number(l[i + 1]) || 0, Number(l[i + 2]) || 0, Number(l[i + 3]) || 0), new THREE.Vector3());
      w.effects.hitFlash(p, a.vel ?? ZERO);
      w.effects.sparks(p, a.vel ?? ZERO, false);
      a.lastPlayerHit = w.time;
      a.hitFlash = 0.15;
      any = true;
    }
    if (any) {
      w.events.hitMarker?.(false);
      sound.play('hit', null, { gain: 0.3, delay: false });
    }
  }
}
