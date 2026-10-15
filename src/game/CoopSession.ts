import { isEscortKind } from '../world/EscortTypes';
// Online co-op: up to four B-17 gunners or two locally flown P-51s with host-authoritative combat.
// Pilot flight/damage/respawns live in CoopPilot.ts; transport, proxies and results are shared.
//
// Host-authoritative. The host runs the whole battle (AI, ballistics, damage, director) exactly
// as in single player. The guest's gun is a "remote gunner" on the host: the guest sends its
// seat, gun yaw/pitch and trigger (~30 Hz, unreliable channel) and the host fires real rounds
// from that station with that aim, so the guest's hits and kills happen in the host's world.
// The AI crewman at the guest's seat stands down (World.remoteStations).
//
// The host streams snapshots at up to 20 Hz per guest (27 KB/s payload budget): every aircraft's id, type, absolute position (the
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
// Spectators (Phase 11 goal 34): two more rooms per B-17 crew game (slots 3 and 4, SPEC_SLOTS) take
// a guest without a gun. It gets the same lobby, start, snapshots and events as the gunners (plus
// every gun's aim, `ca`/`cf`, which also swings the crewmates' guns on everyone's ship), never
// sends input, is left out of the roster, seats, debrief split and host migration, and holds the
// whole broadcast back by its delay setting (DelayLine). Its camera is game/Spectator.ts.
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
import { STATIONS, STATION_ORDER, StationId, dirFromYawPitch, wrapAngle } from '../world/B17Layout';
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
import { emptyGunnerScore, crewDebriefs, mergeCrew, buildCoopDebrief, isCoopDebrief, type CoopDebrief } from '../net/CoopResult';
import { cleanName, savedName, crewName } from '../net/Leaderboard';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { achievements } from './Achievements';
import { crewRoster } from './CrewRoster';
import { tx } from '../i18n';
import { CoopPilot } from './CoopPilot';
import { coopBoard, packAircraft, unpackAircraft, type CoopMode } from '../net/CoopPilot';
import { buildCustomMission, loadConfig } from './CustomBattle';
import { CombatTally } from './CombatTally';
import { freeSeat, canTakeSeat, crewCode, snapshotInterval, type CrewSeat } from '../net/Crew';
import { CrewPings } from './CrewPings';
import { makeCode } from '../net/Signal';
import { fetchListings, HEARTBEAT_MS, inviteCode, inviteLink, listingFields, localRegion, publishListing, PUBLISH_GAP_MS, quickJoinOrder, rankLobbies, removeListing, sameListing, withoutInvite, type ListingFields } from '../net/Lobbies';
import { clearTicket, lossAction, MIGRATE_GAP_MS, MIGRATE_TRIES, pickHeir, RECONNECT_GAP_MS, RECONNECT_TRIES, saveTicket, validPlan, type MigrationPlan } from '../net/Rejoin';
import type { DebriefData } from '../ui/UI';
import { Spectator } from './Spectator';
import { DelayLine, aimOf, delaySeconds, fireMask, packAims, readAims } from './SpectatorRules';
import { crewLabel, streamer } from '../ui/Streamer';

interface CrewPeer {
  id: number; run: number; link: CoopLink; signal: Signalling | null; seat: StationId; name: string; ready: boolean;
  owner: Aircraft; score: ReturnType<typeof emptyGunnerScore>; tally: CombatTally;
  inp: RemoteInput | null; age: number; wall: number; seq: number; cd: number; shots: number;
  hits: number[]; streak: number; lastKill: number;
  spec: boolean;   // a spectator (slots 3-4): no gun, no seat, not in the roster
}



export const SNAP_HZ = 20;
export const INPUT_HZ = 30;
const TRACERS_PER_SNAP = 40;
const INPUT_STALE = 0.75;           // s without guest input (sim and wall clock) -> trigger released
const CONNECT_TIMEOUT_MS = 25000;
export const CREW_SLOTS = [0, 1, 2] as const;
export const SPEC_SLOTS = [3, 4] as const;   // spectator rooms (crewCode slots), opened after the crew's
// guest -> host events and snapshots a spectator holds back by its broadcast delay (lobby and seat traffic stays live)
const HELD_EVENTS = new Set(['start', 'k', 'h', 'end', 'debrief', 'wx', 'mark']);
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// snapshot aircraft flags
export const F_ALIVE = 1, F_PB = 2, F_BURN = 4, F_SMOKE = 8, F_ENG0 = 16; // F_ENG0 << i: engine i dead
export const F_PARTS = 8;   // flags >> F_PARTS: an enemy's structural part state (destruction/FailureModel.ts bits())

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

// Snapshot kinds: B bomber, P legacy/player Mustang, explicit escort or enemy kind.
export function kindOf(a: Aircraft): string | null {
  if (a instanceof Bomber) return 'B';
  if (a instanceof Fighter) return a.team === 'allied' ? (a.kind === 'p51d' ? 'P' : a.kind) : (a.enemyType || 'fw190');
  return null;
}

// marker for the guest's rounds on the host (never an aircraft: compared by identity only)
const REMOTE: Aircraft = Object.freeze({ remoteGunner: true }) as unknown as Aircraft;

export class CoopSession {
  mode: CoopMode = 'gunner';
  scenario = 'survival';
  readonly pilots: CoopPilot;
  readonly pings: CrewPings;
  readonly peers: CrewPeer[] = [];
  roster: CrewSeat[] = [];
  private departed: CrewPeer[] = [];
  private myId = 0;
  private myReady = false;
  private inputSeq = 0;
  private snapInterval = 1 / SNAP_HZ;
  private roomIce: RTCIceServer[] = [];
  private crewNames: string[] = [];
  // public listing, rejoin and host migration (net/Lobbies.ts, net/Rejoin.ts)
  private publicGame = false;
  private listed: ListingFields | null = null;
  private listAt = 0;
  private listBeat: ReturnType<typeof setInterval> | null = null;
  private region = localRegion();
  private nextCode = '';                       // host: where the crew regroups if we leave mid-round
  private plan: MigrationPlan | null = null;   // guest: the host's latest migration plan
  private hostLeft = false;                    // guest: the host announced it is leaving
  private rejoining = false;                   // guest: reconnected mid-round, accept the same run's start
  private followCode = '';                     // guest: the heir's code, rejoined from the debrief
  private inviteChecked = false;
  // spectating (game/Spectator.ts)
  readonly spectator: Spectator;
  watching = false;                            // guest: we joined a spectator room
  watchers = 0;                                // spectators connected (host counts, guests are told)
  readonly crewAim = new Float32Array(10);     // every gun's aim from the latest snapshot (`ca`)
  crewFire = 0;                                // guns firing (`cf`)
  private held = new DelayLine<{ s: boolean; m: any }>();
  private heldStart = false;                   // a held 'start' is waiting in the line
  private heldT = 0;
  broadcast(m: unknown) {
    if (this.role === 'host' && this.mode === 'gunner') { for (const p of this.peers) p.link.sendEvent(m); }
    else this.link?.sendEvent(m);
  }
  pingTarget(id: number) { return this.role === 'host' ? this.game.world.aircraft.find(a => a.id === id) : this.proxies.get(id); }
  targetId(a: Aircraft) { if (this.role === 'host') return a.id; for (const [id, proxy] of this.proxies) if (proxy === a) return id; return -1; }
  get epoch() { return this.run; }
  get localId() { return this.myId; }
  get activeCrew(): CrewSeat[] {
    return [{ id: 0, name: this.myName, seat: this.hostSeat, ready: this.myReady }, ...this.peers.filter(p => p.link.status === 'open' && !p.spec).map(p => ({ id: p.id, name: p.name, seat: p.seat, ready: p.ready }))];
  }
  private refreshCrew() {
    this.roster = this.activeCrew;
    this.connected = this.roster.length > 1;
    this.partnerReady = this.myReady && this.roster.every(p => p.ready);
    this.link = this.peers.find(p => p.link.status === 'open' && !p.spec)?.link ?? this.peers.find(p => !p.spec)?.link ?? null;
    this.watchers = this.peers.filter(p => p.spec && p.link.status === 'open').length;
    this.game.world.remoteStations.clear();
    if (this.phase === 'mission') for (const p of this.peers) if (p.link.status === 'open' && !p.spec) this.game.world.remoteStations.add(p.seat);
  }
  private aggregateGuests() {
    const total = this.guestScore; total.kills = total.hits = total.shots = total.score = 0;
    for (const p of this.peers) { total.kills += p.score.kills; total.hits += p.score.hits; total.shots += p.score.shots; total.score += p.score.score; }
    for (const p of this.departed) { total.kills += p.score.kills; total.hits += p.score.hits; total.shots += p.score.shots; total.score += p.score.score; }
    return total;
  }
  get flying() { return this.mode === 'pilot' && this.phase === 'mission' && this.connected; }
  get partnerPlane(): Fighter | null { return this.role === 'host' ? this.pilots.remote : this.proxies.get(this.pilots.hostId) as Fighter ?? null; }
  beforeWorld(dt: number) { if (this.flying && this.role === 'host') this.pilots.beforeWorld(dt); }
  afterPilot() { if (this.flying) this.pilots.spectate(this.partnerPlane); }
  onMissionStart() { if (this.flying) this.pilots.start(this.role === 'host'); }
  onRound() { if (this.flying && this.role === 'host') this.pilots.reviveHost(); }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, extras = true) { if (this.flying) { if (extras) this.pilots.draw(ctx, W, H, this.partnerPlane); } else this.pings.draw(ctx, W, H); }
  get partnerSurvives() { return this.flying && !!this.partnerPlane?.alive; }
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
    this.pings = new CrewPings(game, this);
    this.pilots = new CoopPilot(game, m => this.link?.sendEvent({ ...m, run: this.run }), this.origin);
    const session = this;
    this.spectator = new Spectator(game, engine, game.input, {
      crew: () => this.roster, get myId() { return session.myId; }, aims: this.crewAim, get fire() { return session.crewFire; },
      delay: () => this.delay, waiting: () => this.latestTm < 0,
      station: (id) => { if (this.game.gunner.station !== id) this.reqStation0?.call(this.game.gunner, id); },
      leave: () => { this.leave(); this.game.startMenu(); },
    });
    this.screen = new CoopScreen({
      mode: (mode, scenario) => { if (this.role === 'guest' || (this.role === 'host' && mode !== this.mode)) return; this.mode = mode; this.scenario = mode === 'gunner' ? 'survival' : scenario; this.sendLobby(); this.renderLobby(this.lobbyStatus); },
      host: (pub) => { this.publicGame = pub && this.mode === 'gunner'; void this.host(); },
      join: (c) => { void this.join(c); },
      watch: (c) => { void this.join(c, 1, [], true); },
      delay: (n) => { this.game.settings.spectatorDelay = delaySeconds(n); this.game.applySettings(); },
      delayNow: () => this.delay,
      quick: () => { void this.quickJoin(); },
      browse: () => { void this.browse(); },
      rejoin: (c) => { void this.join(c, RECONNECT_TRIES); },
      invite: () => { void this.invite(); },
      seat: (s) => this.pickSeat(s),
      start: () => this.startHostMission(),
      ready: () => this.toggleReady(),
      ping: () => this.pings.mark(),
      leave: () => { clearTicket(); this.leave(); this.screen.menu(); },
      back: () => { clearTicket(); this.leave(); this.game.startMenu(); },
    });
  }

  // ---------------- hooks ----------------

  // Game.startMenu(): a title screen means any co-op game is over; (re)add the menu entry
  openMenu(back = () => this.game.startMenu()) { this.screen.menu('', '', () => { this.leave(); back(); }); }

  onTitle() {
    if (this.phase !== 'idle') this.leave();
    // a friend's invite link (?join=CODE): once per page load, after the title screen is up
    if (this.inviteChecked || typeof location === 'undefined') return;
    this.inviteChecked = true;
    const code = inviteCode(location.href);
    if (!code) return;
    try { history.replaceState(history.state, '', withoutInvite(location.href)); } catch { /* file:// */ }
    setTimeout(() => { if (this.phase === 'idle' && this.game.state === 'menu') void this.join(code); }, 0);
  }

  // Game.direct(): the guest never runs the director, spawns or end conditions
  get blocksDirector() { return this.role === 'guest' && this.phase === 'mission'; }

  // Game.frame(), right after world.update(dt)
  update(dt: number) {
    if (this.watching) this.release(dt);
    const link = this.link;
    this.pings.update(dt);
    this.screen.setPing(link?.rtt ?? -1, !!link && link.status === 'open', this.phase === 'mission', this.mode === 'gunner');
    if (this.phase !== 'mission' || (!link && this.role !== 'host')) return;
    if (this.role === 'host') this.hostTick(dt);
    else this.guestTick(dt);
  }

  get partnerSeat(): StationId | null {
    if (!this.connected || this.mode === 'pilot') return null;
    return this.role === 'host' ? this.peers.find(p => p.link.status === 'open' && !p.spec)?.seat ?? null : this.role === 'guest' ? this.hostSeat : null;
  }

  // Game.frame(), right after Cinematics: the spectator's cinematic camera and overlay
  afterView(dt: number) { if (this.watching && this.phase === 'mission') this.spectator.post(dt); }

  /** The spectator's broadcast delay in seconds (Settings → Spectator delay). */
  get delay() { return delaySeconds(this.game.settings.spectatorDelay); }

  // Spectator: messages from the host go through the delay line (Settings delay, 0 = straight through)
  private ingest(snap: boolean, m: any) {
    if (!this.watching || !(snap || HELD_EVENTS.has(m?.t)) || (!this.delay && !this.held.length)) { this.dispatch(snap, m); return; }
    if (m?.t === 'start') this.heldStart = true;
    this.held.push(performance.now(), { s: snap, m });
  }
  private dispatch(snap: boolean, m: any) {
    if (snap) this.onSnap(m); else this.onEvent(m);
  }
  private release(dt: number) {
    if (!this.held.length) return;
    this.held.drain(performance.now(), this.delay * 1000, (x) => { if (x.m?.t === 'start') this.heldStart = false; this.dispatch(x.s, x.m); });
    this.heldT -= dt;
    if (this.heldStart && this.phase === 'lobby' && this.heldT <= 0) {
      this.heldT = 0.5;
      const n = Math.ceil(this.held.wait(performance.now(), this.delay * 1000, false));
      this.renderLobby(tx('The mission has started — your delayed picture begins in {n} s', { n }));
    }
  }

  // ---------------- session ----------------

  private newLink(role: 'host' | 'guest', iceServers?: RTCIceServer[], slot = 0) {
    const link = new CoopLink(role, iceServers);
    if (role === 'host' && this.mode === 'gunner') {
      const spec = (SPEC_SLOTS as readonly number[]).includes(slot);
      const seat = spec ? STATION_ORDER[0] : freeSeat(this.activeCrew, 'waistR') ?? STATION_ORDER[0];
      const peer: CrewPeer = { id: slot + 1, run: 0, link, signal: null, seat, name: spec ? 'Spectator' : 'Gunner', ready: spec,
        owner: Object.freeze({ remoteGunner: slot + 1 }) as unknown as Aircraft, score: emptyGunnerScore(), tally: new CombatTally(),
        inp: null, age: 99, wall: 0, seq: -1, cd: 0, shots: 0, hits: [], streak: 0, lastKill: -99, spec };
      this.peers.push(peer);
    }
    this.link ??= link;
    if (role === 'guest' || this.mode === 'pilot') this.link = link;
    link.onOpen = () => this.onOpen(link);
    link.onClose = (why) => this.onLinkClosed(link, why);
    link.onEvent = (m) => { const peer = this.peers.find(p => p.link === link); if (peer) this.onEvent(m, peer); else if (this.link === link) this.ingest(false, m); };
    link.onState = (m) => { const peer = this.peers.find(p => p.link === link); if (peer || this.link === link) { if (role === 'host') this.onInput(m, peer); else this.ingest(true, m); } };
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
    this.roomIce = ice;
    try {
      if (this.mode === 'gunner') {
        const code = makeCode();
        for (let slot = 0; slot < 3; slot++) {
          await this.offerSlot(slot, code, attempt);
          if (attempt !== this.connectionAttempt) return;
        }
        this.code = code;
        this.refreshCrew();
        this.syncListing(true);
        void this.openSpecSlots(code, attempt);
      } else {
        const link = this.newLink('host', ice);
        const sig = await hostSignal(link.pc, e => console.warn('Co-op: signalling', e));
        if (attempt !== this.connectionAttempt) { void sig.close(); return; }
        this.signal = sig; this.code = sig.code;
      }
      this.renderLobby('Waiting for your partner to join…');
    } catch (e) {
      if (attempt !== this.connectionAttempt) return;
      console.warn('Co-op: hosting failed', e);
      this.leave();
      this.screen.menu('Could not create a game. Check your connection and try again.');
    }
  }

  // Spectator rooms: best effort (a clash or an error only means this game can't be watched)
  private async openSpecSlots(code: string, attempt: number) {
    for (const slot of SPEC_SLOTS) {
      if (attempt !== this.connectionAttempt) return;
      try { await this.offerSlot(slot, code, attempt); }
      catch (e) {
        console.warn('Co-op: spectator room unavailable', e);
        const i = this.peers.findIndex(p => p.id === slot + 1 && !p.signal);
        if (i >= 0) { this.peers[i].link.close('local', false); this.peers.splice(i, 1); }
      }
    }
  }

  private async offerSlot(slot: number, code: string, attempt: number) {
    const link = this.newLink('host', this.roomIce, slot);
    const peer = this.peers.find(p => p.link === link)!;
    const sig = await hostSignal(link.pc, e => console.warn('Co-op: signalling', e), crewCode(code, slot));
    if (attempt !== this.connectionAttempt) { link.close(); await sig.close(); return; }
    peer.signal = sig;
  }

  // tries > 1: keep retrying (rejoin, or following the heir while it opens its rooms);
  // fallbacks: further codes to try when this one is full or gone (quick join)
  private async join(input: string, tries = 1, fallbacks: readonly string[] = [], watch = false) {
    const code = normalizeCode(input);
    if (!code) { this.screen.menu('A join code is 6 letters and digits.', input); return; }
    this.leave();
    this.role = 'guest'; this.phase = 'lobby'; this.code = code; this.watching = watch;
    this.screen.busy(watch ? 'Joining as a spectator…' : `Joining ${code}…`);
    const attempt = this.connectionAttempt;
    const ice = await fetchIceServers();
    for (let i = 0; i < tries; i++) {
      if (attempt !== this.connectionAttempt) return;
      const link = await this.trySlots(code, ice, attempt);
      if (link === 'stale') return;
      if (link) {
        if (!this.connected) this.screen.busy('Connecting to the host…');
        this.connectTimer = setTimeout(() => {
          if (this.link !== link || this.connected) return;
          this.leave(); this.screen.menu('Could not connect to the host. Try another network or try again.', code);
        }, CONNECT_TIMEOUT_MS);
        return;
      }
      if (i + 1 < tries) await sleep(tries === RECONNECT_TRIES ? RECONNECT_GAP_MS : MIGRATE_GAP_MS);
    }
    if (attempt !== this.connectionAttempt) return;
    if (fallbacks.length) { void this.join(fallbacks[0], 1, fallbacks.slice(1)); return; }
    this.leave();
    this.screen.menu(watch ? 'No spectator seat free, or this game cannot be watched.' : 'Crew full or unavailable. Try again shortly.', code);
  }

  // Claim the first free crew slot of a game: the open link, null (full / gone) or 'stale' (cancelled)
  private async trySlots(code: string, ice: RTCIceServer[], attempt: number): Promise<CoopLink | null | 'stale'> {
    let lastError: unknown, expectedHost: string | undefined;
    const slots = this.watching ? SPEC_SLOTS : CREW_SLOTS;
    for (const slot of slots) {
      const link = this.newLink('guest', ice);
      try {
        const sig = await joinSignal(link.pc, crewCode(code, slot), e => console.warn('Co-op: signalling', e), expectedHost);
        if (attempt !== this.connectionAttempt) { void sig.close(); link.close('local', false); return 'stale'; }
        this.signal = sig;
        return link;
      } catch (e) {
        if (this.link === link) this.link = null;
        link.close('local', false); lastError = e;
        if (attempt !== this.connectionAttempt) return 'stale';
        if (slot === slots[0]) {
          if (!(e instanceof RoomError) || !e.host) break;
          expectedHost = e.host;
        }
      }
    }
    console.warn('Co-op: join failed', lastError);
    return null;
  }

  // ---------------- public games, quick join, invites ----------------

  private async quickJoin() {
    this.leave();
    this.screen.busy('Looking for a crew…');
    const attempt = this.connectionAttempt;
    let codes: string[] = [];
    try {
      const { list, uid } = await fetchListings();
      codes = quickJoinOrder(list, this.region, Date.now(), uid);
    } catch (e) { console.warn('Co-op: lobby list failed', e); }
    if (attempt !== this.connectionAttempt) return;
    if (!codes.length) { this.screen.menu('No open crews right now. Host a public game and others can find it.'); return; }
    void this.join(codes[0], 1, codes.slice(1));
  }

  private async browse() {
    this.leave();
    this.screen.browser(null, this.region);
    const attempt = this.connectionAttempt;
    try {
      const { list, uid } = await fetchListings();
      if (attempt !== this.connectionAttempt) return;
      this.screen.browser(rankLobbies(list, this.region, Date.now(), uid), this.region);
    } catch (e) {
      if (attempt !== this.connectionAttempt) return;
      console.warn('Co-op: lobby list failed', e);
      this.screen.menu('Could not load the game list. Check your connection and try again.');
    }
  }

  private async invite() {
    if (!this.code || typeof location === 'undefined') return;
    const url = inviteLink(location.href, this.code);
    try {
      if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) { await navigator.share({ url }); return; }
      await navigator.clipboard.writeText(url);
      this.screen.toast('Invite link copied — send it to a friend', 3000);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      this.screen.toast(streamer.on ? 'Could not copy the invite link.' : url, 8000);
    }
  }

  // The host's public listing: published on hosting, refreshed on changes and every minute
  private syncListing(force = false) {
    if (!this.publicGame || this.role !== 'host' || this.mode !== 'gunner' || !this.code || this.phase === 'idle') return;
    this.listBeat ??= setInterval(() => this.syncListing(), 2000);
    const now = Date.now();
    const f = listingFields(this.myName, this.activeCrew.length, this.phase === 'mission' ? 'mission' : 'lobby', this.phase === 'mission' ? this.game.roundIdx + 1 : 0, this.region);
    if (!force && sameListing(this.listed, f) && now - this.listAt < HEARTBEAT_MS) return;
    if (now - this.listAt < PUBLISH_GAP_MS) return;   // the 2 s beat brings it back
    this.listed = f; this.listAt = now;
    publishListing(this.code, f).catch((e) => { console.warn('Co-op: listing failed', e); this.listed = null; });
  }

  private unlist() {
    if (this.listBeat) { clearInterval(this.listBeat); this.listBeat = null; }
    if (this.listAt && this.code && this.role === 'host') removeListing(this.code).catch((e) => console.warn('Co-op: unlisting failed (it goes stale in 3 min)', e));
    this.listed = null; this.listAt = 0;
  }

  // ---------------- rejoin and host migration ----------------

  private hostPlan(): MigrationPlan {
    this.nextCode ||= makeCode();
    return { heir: pickHeir(this.roster ?? []), next: this.nextCode, pub: !!this.publicGame };
  }

  // Guest, mid-round: the link to the host closed
  private onHostLost(why: 'left' | 'lost') {
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    void this.signal?.close(); this.signal = null;
    this.link = null; this.connected = false;
    const hostLeft = this.hostLeft || why === 'left';
    this.afterLoss(lossAction({ crewMode: this.mode === 'gunner', plan: this.plan, myId: this.myId, hostLeft, reconnectFailed: false }), why);
  }

  private afterLoss(action: ReturnType<typeof lossAction>, why: 'left' | 'lost') {
    if (action === 'reconnect') void this.reconnect();
    else if (action === 'takeover') void this.takeOver();
    else if (action === 'follow') this.gracefulEnd('The host left. Return to the co-op lobby to rejoin your crew under the new host.', this.plan!.next);
    else this.gracefulEnd(why === 'left' ? 'The host left the game. Co-op session ended.' : 'Lost the connection to the host. Co-op session ended.', '');
  }

  // Our own connection may be what failed: the host re-offers our slot, so try the same code
  private async reconnect() {
    const code = this.code, attempt = ++this.connectionAttempt;
    this.screen.waiting('Connection lost — rejoining…');
    const ice = await fetchIceServers();
    for (let i = 0; i < RECONNECT_TRIES; i++) {
      if (attempt !== this.connectionAttempt || this.phase !== 'mission') return;
      const link = await this.trySlots(code, ice, attempt);
      if (link === 'stale') return;
      if (link) {
        this.rejoining = true;
        const t0 = Date.now();
        while (Date.now() - t0 < CONNECT_TIMEOUT_MS && attempt === this.connectionAttempt && link.status === 'connecting') await sleep(250);
        if (attempt !== this.connectionAttempt) return;
        if (link.status === 'open') return;   // the host sends 'start': the round reloads around us
        if (this.link === link) this.link = null;
        link.close('local', false); void this.signal?.close(); this.signal = null;
      }
      if (i + 1 < RECONNECT_TRIES) await sleep(RECONNECT_GAP_MS);
    }
    if (attempt !== this.connectionAttempt || this.phase !== 'mission') return;
    this.rejoining = false;
    this.screen.waiting(null);
    this.afterLoss(lossAction({ crewMode: true, plan: this.plan, myId: this.myId, hostLeft: this.hostLeft, reconnectFailed: true }), 'lost');
  }

  // We are the heir: our puppet world becomes the real battle (the proxies are ordinary aircraft,
  // the director picks up at the synced round) and the crew regroups under the plan's code.
  private async takeOver() {
    const plan = this.plan!;
    const attempt = ++this.connectionAttempt;
    this.teardownGuest();
    this.screen.waiting(null);
    this.role = 'host'; this.myId = 0; this.hostLeft = false; this.plan = null; this.rejoining = false;
    this.hostSeat = this.game.gunner.station; this.myReady = true; this.partnerReady = true;
    this.peers.length = 0; this.departed = []; this.link = null; this.connected = false;
    this.code = plan.next; this.nextCode = ''; this.publicGame = plan.pub;
    this.crewNames = [this.myName];
    this.installHost();
    this.refreshCrew();
    this.ui.tip('The host left — you now run the battle', 4500);
    this.ui.feed('You are the new host', 'mine');
    try {
      this.roomIce = await fetchIceServers();
      for (let slot = 0; slot < 3; slot++) {
        if (attempt !== this.connectionAttempt) return;
        await this.offerSlot(slot, plan.next, attempt);
      }
      this.syncListing(true);
      void this.openSpecSlots(plan.next, attempt);
    } catch (e) {
      if (attempt !== this.connectionAttempt) return;
      console.warn('Co-op: could not reopen the crew rooms', e);
      this.ui.tip('Could not reopen the crew rooms — carrying on alone', 4000);
    }
  }

  // No one can carry the round on (or we follow the heir): a debrief of the sortie so far, with
  // personal rewards, from the last scores the host streamed. `follow`: the code to rejoin from it.
  private gracefulEnd(reason: string, follow: string) {
    this.screen.waiting(null);
    this.rejoining = false;
    this.followCode = follow;
    if (follow) saveTicket(follow); else clearTicket();
    const g = this.game, w = g.world, m = this.mission;
    if (this.watching) { this.reset(); g.startMenu(); this.screen.toast('The host left — the broadcast has ended.', 6000); return; }
    if (!m || this.result || this.role !== 'guest') {
      this.reset(); g.startMenu(); this.screen.toast(reason, 6000);
      return;
    }
    this.endWhy = reason;
    const base: DebriefData = {
      success: false, title: m.title, reason, kills: 0, accuracy: 0, bombersLost: w.stats.bombersLost, bombersTotal: m.bombers,
      time: w.time, score: g.score, medals: [], survival: m.duration === Infinity, waves: g.roundIdx, nextAvailable: false,
    };
    this.presentDebrief(buildCoopDebrief(Math.max(1, this.run), base, this.hostScore, this.guestScore, w.combatLosses, w.crewWounded > 0));
  }

  private onOpen(link: CoopLink) {
    const peer = this.peers.find(p => p.link === link);
    if (peer?.spec) { this.refreshCrew(); this.sendLobby(); this.renderLobby(this.lobbyStatus || 'Waiting for your partner to join…'); this.ui.feed(tx('A spectator is watching'), 'mine'); return; }
    if (peer) {
      peer.seat = freeSeat(this.activeCrew.filter(p => p.id !== peer.id), peer.seat) ?? peer.seat;
      this.refreshCrew(); this.sendLobby();
      this.renderLobby('Crew connected — pick a seat and ready up');
      return;
    }
    if (this.link !== link) return;
    this.connected = true;
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    // connected: the room has done its job (the host deletes it, freeing the code)
    void this.signal?.close();
    this.signal = null;
    if (this.role === 'host') { this.sendLobby(); this.renderLobby(this.mode === 'pilot' ? 'Partner connected — ready to fly' : 'Partner connected — pick your guns and start'); sound.confirm('kill_confirm'); }
    else {
      link.sendEvent({ t: 'hello', name: this.myName, spec: this.watching || undefined }); this.renderLobby(this.watching ? 'Watching — waiting for the host to start' : 'Connected — waiting for the host to start');
      if (this.mode === 'gunner' && !this.watching) saveTicket(this.code);
      if (this.rejoining) { this.screen.waiting(null); this.ui.tip('Back aboard', 2000); }
    }
  }

  // The user leaves (or a title screen appears): tell the partner, drop everything
  leave() {
    this.connectionAttempt++;
    // mid-round, the crew carries on under the heir (net/Rejoin.ts)
    if (this.role === 'host' && this.phase === 'mission' && this.mode === 'gunner' && !this.endWhy) {
      const plan = this.hostPlan();
      if (plan.heir > 0) for (const p of this.peers) p.link.sendEvent({ t: 'migrate', ...plan });
    }
    this.unlist();
    this.myName = cleanName(savedName());
    const link = this.link;
    this.link = null;
    link?.close('local', true);
    for (const p of this.peers) { p.link.close('local', true); void p.signal?.close(); }
    this.peers.length = 0;
    this.reset();
  }

  private reset() {
    this.unlist();
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
    this.roster = []; this.departed = []; this.myId = 0; this.myReady = false; this.pings.reset();
    this.run = 0; this.rewardedRun = 0; this.result = null; this.partnerReady = true;
    this.plan = null; this.hostLeft = false; this.rejoining = false; this.nextCode = '';
    this.spectator?.end(); this.watching = false; this.watchers = 0; this.held?.clear(); this.heldStart = false; this.crewAim?.fill(0); this.crewFire = 0;
    this.engine.paused = false;
    this.screen.waiting(null);
    this.screen.markPartner(null);
    this.screen.setPing(-1, false);
  }

  private onLinkClosed(link: CoopLink, why: 'left' | 'lost' | 'local') {
    if (why === 'local') return;
    const peer = this.peers.find(p => p.link === link);
    if (peer?.spec) {
      this.peers.splice(this.peers.indexOf(peer), 1);
      this.refreshCrew(); this.sendLobby(); this.renderLobby(this.lobbyStatus);
      const attempt = this.connectionAttempt, code = this.code;
      void (async () => {
        await peer.signal?.close();
        if (attempt !== this.connectionAttempt || !code) return;
        try { await this.offerSlot(peer.id - 1, code, attempt); }
        catch (e) { console.warn('Co-op: spectator room unavailable', e); }
      })();
      return;
    }
    if (peer) {
      this.peers.splice(this.peers.indexOf(peer), 1); this.departed.push(peer);
      this.refreshCrew(); this.sendLobby(); this.renderLobby('Crew connected — pick a seat and ready up');
      this.ui.tip('Crew member left — AI has the gun', 3000);
      const attempt = this.connectionAttempt, code = this.code;
      void (async () => {
        await peer.signal?.close();
        if (attempt !== this.connectionAttempt || !code) return;
        try { await this.offerSlot(peer.id - 1, code, attempt); }
        catch (e) { console.warn('Co-op: replacement slot unavailable', e); }
      })();
      return;
    }
    if (this.link !== link) return;
    const role = this.role, phase = this.phase, ended = !!this.endWhy;
    if (phase === 'debrief') { this.connected = false; this.screen.toast('Partner disconnected'); return; }
    if (role === 'host') {
      if (phase === 'mission') {
        // the battle goes on: the AI crewman takes the gun back
        this.teardownHost();
        if (this.mode === 'pilot') this.pilots.fallback();
        this.link = null; this.connected = false;
        void this.signal?.close(); this.signal = null;
        if (!ended) { this.ui.tip(why === 'left' ? 'Your partner left — carrying on alone' : 'Lost your partner — carrying on alone', 4000); this.ui.feed('Partner disconnected', 'loss'); }
      } else {
        this.reset();
        this.screen.menu(why === 'left' ? 'Your partner left.' : 'The connection to your partner was lost.');
      }
      return;
    }
    if (phase === 'mission' && !ended) { this.onHostLost(why); return; }
    const msg = ended ? `Mission over — ${this.endWhy}` : why === 'left' ? 'The host left the game. Co-op session ended.' : 'Lost the connection to the host. Co-op session ended.';
    if (why === 'left') clearTicket();
    this.reset();
    if (phase === 'mission') { this.game.startMenu(); this.screen.toast(msg, 6000); }
    else this.screen.menu(msg);
  }

  private renderLobby(status: string) {
    if (!this.role || this.phase !== 'lobby') return;
    this.lobbyStatus = status;
    this.screen.lobby({
      mode: this.mode, scenario: this.scenario,
      role: this.role, code: this.code, status, connected: this.connected && this.partnerReady,
      mine: this.role === 'host' ? this.hostSeat : this.guestSeat,
      partner: this.partnerSeat,
      crew: this.mode === 'gunner' ? this.roster : undefined, myId: this.myId, ready: this.myReady,
      listed: this.role === 'host' && this.mode === 'gunner' ? !!this.publicGame : undefined,
      watching: this.watching, watchers: this.watchers,
    });
  }
  private lobbyStatus = '';

  private sendLobby() {
    if (this.role === 'host' && this.mode === 'gunner') {
      this.refreshCrew();
      const plan = this.hostPlan();
      for (const p of this.peers) p.link.sendEvent({ t: 'lobby', mode: this.mode, scenario: this.scenario, hs: this.hostSeat, gs: p.seat, name: this.myName, crew: this.roster, id: p.id, plan, watchers: this.watchers });
      this.syncListing();
    } else this.link?.sendEvent({ t: 'lobby', mode: this.mode, scenario: this.scenario, hs: this.hostSeat, gs: this.guestSeat, name: this.myName });
  }
  private toggleReady() {
    if (this.phase !== 'lobby' || this.watching) return;
    this.myReady = !this.myReady;
    if (this.role === 'host') this.sendLobby();
    else this.link?.sendEvent({ t: 'crewReady', ready: this.myReady });
    this.renderLobby(this.lobbyStatus);
  }

  private pickSeat(s: StationId) {
    if (this.phase !== 'lobby' || !(s in STATIONS) || this.watching) return;
    if (this.mode === 'gunner') {
      if (!canTakeSeat(this.roster, this.myId, s)) return;
      if (this.role === 'host') { this.hostSeat = s; this.myReady = false; this.sendLobby(); }
      else this.link?.sendEvent({ t: 'seat', s });
    } else if (this.role === 'host') { this.hostSeat = s; this.sendLobby(); }
    else this.link?.sendEvent({ t: 'seat', s });
    this.renderLobby(this.lobbyStatus);
  }

  private onEvent(m: any, peer?: CrewPeer) {
    if (peer?.spec) {
      // a spectator only introduces itself: no seat, no ready, no marks
      if (m.t !== 'hello') return;
      peer.name = cleanName(String(m.name ?? 'Spectator'));
      this.sendLobby();
      if (this.phase === 'mission' && !this.endWhy) { this.sendStart(peer); if (this.sentWx) peer.link.sendEvent({ t: 'wx', w: this.sentWx }); }
      else if (this.phase === 'debrief') peer.link.sendEvent({ t: 'crewWait' });
      return;
    }
    if (m.t === 'mark') { this.pings.receive(m, peer?.id); return; }
    if (peer) {
      if (m.t === 'hello') {
        peer.name = cleanName(String(m.name ?? 'Gunner')); this.crewNames[peer.id] = peer.name; this.sendLobby();
        if (this.phase === 'mission' && !this.endWhy) { this.sendStart(peer); if (this.sentWx) peer.link.sendEvent({ t: 'wx', w: this.sentWx }); }
        else if (this.phase === 'debrief') peer.link.sendEvent({ t: 'crewWait' });
      } else if (m.t === 'crewReady' && this.phase === 'lobby') { peer.ready = m.ready === true; this.sendLobby(); }
      else if (m.t === 'ready' && m.run === this.run) { peer.ready = false; this.sendLobby(); }
      else if (m.t === 'seat' && (this.phase === 'lobby' || this.phase === 'mission')) {
        if (canTakeSeat(this.roster, peer.id, m.s)) { peer.seat = m.s; peer.inp = null; peer.ready = false; }
        this.sendLobby(); peer.link.sendEvent({ t: 'seatAck', s: peer.seat, run: this.run });
      }
      this.renderLobby('Crew connected — pick a seat and ready up');
      return;
    }
    switch (m.t) {
      case 'migrate':
        if (this.role === 'guest' && validPlan(m)) { this.plan = { heir: m.heir, next: m.next, pub: m.pub }; this.hostLeft = true; }
        break;
      case 'crewWait':
        if (this.role === 'guest') this.renderLobby('Waiting for the host…');
        break;
      case 'seatAck':
        if (this.role === 'guest' && m.run === this.run && m.s in STATIONS) {
          this.guestSeat = m.s;
          if (this.phase === 'mission') this.reqStation0?.call(this.game.gunner, m.s);
        }
        break;
      case 'pd': if (this.flying && this.role === 'guest' && m.run === this.run) this.pilots.guestDamage(m.d); break;
      case 'revive': if (this.flying && this.role === 'guest' && m.run === this.run) { this.pilots.reviveGuest(m); if (this.game.world.playerFighter) this.bind(this.pilots.guestId, this.game.world.playerFighter); } break;
      // ---- to the host ----
      case 'hello':
        if (this.role === 'host') { this.partnerName = cleanName(String(m.name ?? 'Walsh')); this.sendLobby(); }
        break;
      case 'ready':
        if (this.role === 'host' && m.run === this.run) { this.partnerReady = true; this.renderLobby(this.mode === 'pilot' ? 'Partner connected — ready to fly' : 'Partner connected — pick your guns and start'); }
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
        this.mode = m.mode === 'pilot' ? 'pilot' : 'gunner';
        this.scenario = typeof m.scenario === 'string' ? m.scenario : 'survival';
        if (Array.isArray(m.crew)) {
          this.roster = m.crew; this.myId = m.id;
          this.myReady = this.roster.find(p => p.id === this.myId)?.ready ?? false;
        }
        this.partnerName = cleanName(String(m.name ?? 'Gunner'));
        this.watchers = Number.isInteger(m.watchers) ? Math.max(0, Math.min(SPEC_SLOTS.length, m.watchers)) : 0;
        if (validPlan(m.plan)) this.plan = m.plan;
        if (m.hs in STATIONS) this.hostSeat = m.hs;
        if (m.gs in STATIONS) this.guestSeat = m.gs;
        this.renderLobby(this.lobbyStatus);
        break;
      case 'start': if (this.role === 'guest' && (this.phase === 'lobby' || this.phase === 'mission')) this.startGuestMission(m); break;
      case 'k': if (this.role === 'guest' && this.phase === 'mission' && m.run === this.run) this.onKill(Number(m.id), m.g === 1, m.h === 1, Number.isInteger(m.d) ? m.d : -1); break;
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
    this.devFire = false; this.inputSeq = 0; this.pings.reset(); this.departed = [];
    for (const p of this.peers) { p.run = 0; p.score = emptyGunnerScore(); p.tally.reset(); p.inp = null; p.seq = -1; p.age = 99; p.cd = 0; p.shots = 0; p.hits = []; p.streak = 0; p.lastKill = -99; }
    this.crewNames = [this.myName];
    for (const p of this.peers) if (p.link.status === 'open') this.crewNames[p.id] = p.name;
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
    if (this.mode === 'gunner') this.guestScore = this.aggregateGuests();
    const host = this.readHostScore(), crew = mergeCrew(host, this.guestScore);
    if (r.success) g.score += 500 + w.bombers().filter(b => b.alive).length * 50 + Math.round((crew.shots ? crew.hits / crew.shots : 0) * 300);
    const result = buildCoopDebrief(this.run, {
      success: r.success, title: this.mission.title, reason: r.reason, kills: 0, accuracy: 0,
      bombersLost: w.stats.bombersLost, bombersTotal: this.mission.bombers, time: w.time,
      score: g.score, medals: [], survival: this.mission.duration === Infinity, waves: g.roundIdx + (r.success ? 1 : 0), nextAvailable: false,
    }, host, this.guestScore, w.combatLosses, w.crewWounded > 0);
    const tally = (t: CombatTally) => ({ bestStreak: t.bestStreak, closestKill: Number.isFinite(t.closestKill) ? t.closestKill : null, killsByGun: this.mode === 'gunner' ? t.killsByGun() : undefined });
    Object.assign(result.host, tally(g.tally)); Object.assign(result.guest, tally(this.guestTally));
    if (this.mode === 'gunner') {
      const members = [{ score: host, tally: g.tally }, ...this.peers.filter(p => p.link.status === 'open' && p.run === this.run && !p.spec), ...this.departed.filter(p => p.run === this.run)];
      const personal = crewDebriefs(this.run, result.host, members.map(p => p.score), w.combatLosses, w.crewWounded > 0);
      personal.forEach((d, i) => Object.assign(d, tally(members[i].tally)));
      result.host = personal[0];
      let i = 1;
      for (const p of this.peers) if (p.link.status === 'open' && p.run === this.run) p.link.sendEvent({ ...result, guest: p.spec ? result.host : personal[i++] });
    } else this.link?.sendEvent(result);
    this.presentDebrief(result);
    return true;
  }

  private presentDebrief(result: CoopDebrief) {
    if (result.run <= this.rewardedRun || !this.mission) return;
    this.rewardedRun = result.run; this.result = result; this.phase = 'debrief';
    if (this.watching) { this.watchDebrief(result); return; }
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
    if (box && this.scenario !== 'custom') mountLeaderboard(box, coopBoard(this.mode), 'CREW LEADERBOARD', this.role === 'host' ? {
      name: this.mode === 'pilot' ? crewName('Blue One', 'Blue Two') : crewName(...this.crewNames.filter(Boolean)), mode: coopBoard(this.mode), score: result.crew.score,
      kills: result.crew.kills, rounds: d.waves ?? 0, duration: d.time,
    } : undefined);
  }

  // A spectator's debrief: the crew's totals, no personal rewards, medals or service record
  private watchDebrief(result: CoopDebrief) {
    const g = this.game, c = result.crew;
    this.spectator.end();
    const d: DebriefData = { ...result.host, kills: c.kills, rounds: c.shots, hits: c.hits, accuracy: c.shots ? Math.min(1, c.hits / c.shots) : 0,
      personalScore: c.score, merit: 0, medals: [] };
    g.score = c.score;
    Object.assign(g.world.stats, { kills: d.kills, shots: d.rounds, hits: d.hits, bombersLost: d.bombersLost });
    g.endResult = { success: d.success, reason: d.reason };
    g.state = 'debrief'; this.engine.paused = true; g.input.unlock();
    this.screen.waiting(null); this.screen.markPartner(null);
    sound.stopSpeech(); sound.music.stinger(d.success); sound.setMode('menu');
    g.ui.debrief(d, { next: () => this.returnToLobby(), retry: () => this.returnToLobby(), menu: () => g.startMenu(), armory: () => this.returnToLobby() });
  }

  private returnToLobby() {
    const follow = this.followCode;
    this.followCode = '';
    if (!this.connected || this.link?.status !== 'open') {
      this.game.startMenu();
      if (follow) void this.join(follow, MIGRATE_TRIES);   // regroup under the heir
      return;
    }
    this.teardownHost(); this.teardownGuest();
    this.phase = 'lobby'; this.mission = null;
    this.game.state = 'paused'; this.engine.paused = true;
    this.myReady = false;
    if (this.mode === 'gunner' && this.role === 'host') { for (const p of this.peers) p.ready = false; this.sendLobby(); }
    if (this.role === 'guest') this.link.sendEvent({ t: 'ready', run: this.run });
    this.renderLobby(this.role === 'host' && !this.partnerReady ? 'Waiting for your partner to return…' : this.role === 'host' ? (this.mode === 'pilot' ? 'Partner connected — ready to fly' : 'Partner connected — pick your guns and start') : this.watching ? 'Watching — waiting for the host to start' : 'Connected — waiting for the host to start');
  }

  // ---------------- mission start ----------------

  private coopMission(station: StationId, weather?: Weather): Mission {
    if (this.mode === 'gunner') return { ...survivalMission('gunner'), specials: false, midRound: false, boss: false, station, weather, title: 'Co-op Survival — Gunners' };
    const campaign = CAMPAIGN.find(m => m.id === this.scenario && m.role === 'pilot' && m.bombers > 0 && !m.naval);
    const base = this.scenario === 'custom' ? buildCustomMission({ ...loadConfig(), role: 'pilot' }) : campaign ?? survivalMission('pilot');
    return { ...base, escorts: 0, specials: false, midRound: false, boss: false, weather: base.weather ?? weather, title: campaign?.title ?? (this.scenario === 'custom' ? base.title : 'Co-op Survival — Pilots') };
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
    if (this.mode === 'gunner') { for (const p of this.peers) if (p.link.status === 'open') this.sendStart(p); }
    else this.link.sendEvent({ t: 'start', run: this.run, mode: this.mode, scenario: this.scenario, custom: this.scenario === 'custom' ? loadConfig() : undefined, w: m.weather, hs: this.hostSeat, gs: this.guestSeat });
    this.installHost();
    this.engine.paused = false;
    this.game.startMission(m);
  }

  private sendStart(p: CrewPeer) {
    p.run = this.run;
    p.link.sendEvent({ t: 'start', run: this.run, mode: 'gunner', scenario: this.scenario, w: this.mission?.weather, hs: this.hostSeat, gs: p.seat, plan: this.hostPlan() });
  }

  private startGuestMission(msg: any) {
    if (!Number.isSafeInteger(msg.run) || msg.run < this.run || (msg.run === this.run && !this.rejoining)) return;
    this.rejoining = false; this.hostLeft = false;
    if (validPlan(msg.plan)) this.plan = msg.plan;
    this.screen.waiting(null);
    this.rewardedRun = Math.min(this.rewardedRun, msg.run - 1);
    this.teardownGuest();
    this.beginRun(msg.run);
    this.mode = msg.mode === 'pilot' ? 'pilot' : 'gunner';
    this.scenario = typeof msg.scenario === 'string' ? msg.scenario : 'survival';
    if (msg.hs in STATIONS) this.hostSeat = msg.hs;
    if (msg.gs in STATIONS) this.guestSeat = msg.gs;
    let m = this.coopMission(this.guestSeat, msg.w && typeof msg.w === 'object' ? msg.w as Weather : undefined);
    if (this.mode === 'pilot' && this.scenario === 'custom') m = { ...buildCustomMission({ ...msg.custom, role: 'pilot' }), escorts: 0, specials: false, midRound: false, boss: false };
    this.mission = m;
    this.phase = 'mission';
    this.screen.hide();
    this.installGuest();
    this.engine.paused = false;
    this.game.startMission(m);
    if (this.watching) this.spectator.begin();
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
      if (g.transition > 0) return;
      if (this.mode === 'gunner' && this.phase === 'mission') {
        if (!canTakeSeat(this.roster, this.myId, id)) { this.ui.tip('That gun is crewed', 2200); return; }
        if (this.role === 'guest') { this.link?.sendEvent({ t: 'seat', s: id }); return; }
        this.hostSeat = id; this.sendLobby();
      }
      if (this.connected && this.mode === 'pilot' && id === this.partnerSeat) { g.onNotice?.(`PARTNER is on the ${STATIONS[id].label.toUpperCase()}`); return; }
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
    if (this.mode === 'gunner') this.refreshCrew();
    this.snapAcc = 0; this.snapInterval = 1 / SNAP_HZ;
    this.tracers = []; this.tracerSeen = 0; this.hits = []; this.pbHits = [];
    this.tracked.clear(); this.guestKills.clear(); this.lastT = 0; this.endSent = false; this.sentWx = '';
    this.kill0 = w.events.kill;
    w.events.kill = (victim, byPlayer, cause) => {
      const peer = this.peers.find(p => p.owner === victim.lastAttacker) ?? this.departed.find(p => p.owner === victim.lastAttacker);
      if (victim.team === 'axis' && (victim.lastAttacker === REMOTE || peer)) {
        const ledger = peer?.score ?? this.guestScore;
        if (byPlayer) w.stats.kills--; // the world may credit an earlier host assist
        ledger.kills++; this.stats.guestKills++;
        this.guestKills.add(victim.id);
        const base = victim instanceof Fighter ? ENEMY_VARIANTS[victim.enemyType as EnemyType]?.score ?? 100 : 100;
        const points = Math.round(base * (1 + this.game.roundIdx * 0.1) * this.game.loadout.scoreMult);
        ledger.score += points; this.game.score += points;
        this.game.killsSincePerk++;
        this.guestStreak = w.time - this.guestLastKill < 9 ? this.guestStreak + 1 : 1;
        this.guestLastKill = w.time;
        if (peer) { peer.streak = w.time - peer.lastKill < 9 ? peer.streak + 1 : 1; peer.lastKill = w.time; peer.tally.recordKill(peer.streak, victim.pos.distanceTo(w.playerBomber!.pos), STATIONS[peer.seat]); }
        this.guestTally.recordKill(this.guestStreak, victim.pos.distanceTo(this.mode === 'pilot' && this.pilots.remote ? this.pilots.remote.pos : w.playerBomber!.pos), this.mode === 'pilot' ? null : STATIONS[this.guestSeat]);
        this.ui.feed(tx(this.mode === 'pilot' ? '{name} destroyed {target}' : '{name} (partner) destroyed {target}', { name: this.mode === 'pilot' ? tx('Blue Two') : peer ? crewLabel(peer.name, peer.id, false) : this.partnerName, target: tx(victim.label) }), 'mine');
        return;
      }
      const before = this.game.score;
      this.kill0?.(victim, byPlayer, cause);
      if (byPlayer && victim.team === 'axis') this.hostScore.score += this.game.score - before;
    };
    // tracers for the guest (a sample of every gun's tracer rounds except the guest's own)
    const fire0 = Object.getPrototypeOf(bal).fire as typeof bal.fire;
    (bal as any).fire = (pos: THREE.Vector3, vel: THREE.Vector3, team: 'allied' | 'axis', damage: number, tracer: boolean, color: [number, number, number], owner: Aircraft | null, cannon = false, player = false, ttl = 2.6) => {
      if (this.flying && owner === this.pilots.remote) { owner = REMOTE; player = false; this.stats.guestRounds++; this.guestScore.shots++; }
      if (tracer && owner !== REMOTE) this.captureTracer(pos, vel, team, color, cannon);
      return fire0.call(bal, pos, vel, team, damage, tracer, color, owner, cannon, player, ttl);
    };
    const hit0 = bal.onHit;
    (bal as any).__coopHit0 = hit0;
    bal.onHit = (e: HitEvent) => {
      const peer = this.peers.find(p => p.owner === e.shooter) ?? this.departed.find(p => p.owner === e.shooter);
      if (e.shooter !== REMOTE && !peer) {
        if (e.target === w.playerBomber && this.pbHits.length < 16) this.pbHits.push(Math.max(0, w.playerBomber.zones.indexOf(e.zone)), e.cannon ? 1 : 0);
        if (e.playerShot && e.target.alive && e.target.team === 'axis') { this.hostScore.score += 5; this.game.score += 5; }
        hit0?.(e);
        return;
      }
      // REMOTE stays the last attacker, including delayed fire/structural deaths.
      const t = e.target, ledger = peer?.score ?? this.guestScore, hits = peer?.hits ?? this.hits;
      if (t.alive && t.team === 'axis') {
        this.stats.guestHits++; ledger.hits++;
        ledger.score += 5; this.game.score += 5;
      }
      hit0?.(e);
      if (hits.length < 64) { const l = t.worldToLocal(e.point, _v); hits.push(t.id, r2(l.x), r2(l.y), r2(l.z)); }
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
    const max = this.mode === 'pilot' ? 4 : TRACERS_PER_SNAP;
    if (this.tracers.length < max) this.tracers.push(rec);
    else { const j = Math.floor(Math.random() * this.tracerSeen); if (j < max) this.tracers[j] = rec; }
  }

  private onInput(m: any, peer?: CrewPeer) {
    if (peer) {
      if (this.phase !== 'mission' || m.run !== this.run || m.t !== 'i' || m.s !== peer.seat || !Number.isFinite(m.y) || !Number.isFinite(m.p) || !Number.isSafeInteger(m.seq) || m.seq <= peer.seq) return;
      const def = STATIONS[peer.seat]; let ry = wrapAngle(m.y - def.rest.yaw);
      if (def.yaw[1] - def.yaw[0] < Math.PI * 1.99) ry = THREE.MathUtils.clamp(ry, def.yaw[0], def.yaw[1]);
      peer.inp = { s: peer.seat, y: def.rest.yaw + ry, p: THREE.MathUtils.clamp(m.p, def.pitch[0], def.pitch[1]), f: m.f === 1 };
      peer.seq = m.seq; peer.age = 0; peer.wall = performance.now(); this.stats.inputsRecv++; return;
    }
    if (this.flying && this.role === 'host' && m.run === this.run && m.t === 'pi') { if (this.pilots.input(m.d)) this.stats.inputsRecv++; return; }
  }

  private hostTick(dt: number) {
    const g = this.game, w = g.world, link = this.link!;
    if (!this.hosting) return;
    if (w.time < this.lastT) { this.tracked.clear(); this.guestKills.clear(); this.endSent = false; } // mission restarted
    this.lastT = w.time;
    if (g.gunner.transition <= 0) this.hostSeat = g.gunner.station;
    this.screen.markPartner(this.mode === 'gunner' ? this.roster : null, this.myId);
    if (this.flying) this.pilots.hostTick(dt); else { for (const p of this.peers) if (p.link.status === 'open' && !p.spec) this.remoteGun(dt, p); this.guestScore = this.aggregateGuests(); }
    // kills: anything alive last frame that is not now
    for (const [id, a] of this.tracked) {
      if (!a.alive) {
        // d: the ending that played (wing or tail off where it failed, the tank exploding, ...): every guest plays the same
        const d = a instanceof Fighter ? w.destruction.deathCode(a) : -1;
        if (this.mode === 'gunner') { for (const p of this.peers) p.link.sendEvent({ t: 'k', run: this.run, id, g: a.lastAttacker === p.owner ? 1 : 0, d }); }
        else link?.sendEvent({ t: 'k', run: this.run, id, g: this.guestKills.has(id) ? 1 : 0, h: a.lastAttacker === w.playerFighter ? 1 : 0, d });
        this.tracked.delete(id); this.guestKills.delete(id);
      }
      else if (a.remove) this.tracked.delete(id);
    }
    for (const a of w.aircraft) if (a.alive && !a.remove && !this.tracked.has(a.id) && kindOf(a)) this.tracked.set(a.id, a);
    for (const p of this.peers) if (p.hits.length) { p.link.sendEvent({ t: 'h', run: this.run, l: p.hits }); p.hits.length = 0; }
    if (this.hits.length) { link.sendEvent({ t: 'h', run: this.run, l: this.hits }); this.hits = []; }
    // weather changes between rounds
    const wk = (g as any).weatherKey;
    if (typeof wk === 'string' && wk && wk !== this.sentWx) { this.sentWx = wk; this.broadcast({ t: 'wx', w: wk }); }
    // snapshots at 20 Hz of real time (slow-motion slows the world, not the stream)
    this.snapAcc += dt / Math.max(0.05, this.engine.timeScale);
    if (this.snapAcc >= this.snapInterval) {
      this.snapAcc %= this.snapInterval;
      const snap = this.buildSnap();
      this.snapInterval = snapshotInterval(JSON.stringify(snap).length + 160);
      if (this.mode === 'gunner') {
        for (const p of this.peers) if (p.link.status === 'open') {
          snap.guest = p.score;
          snap.host = { kills: this.crewKills - p.score.kills, hits: this.hostScore.hits + this.guestScore.hits - p.score.hits, shots: this.hostScore.shots + this.guestScore.shots - p.score.shots, score: this.game.score - p.score.score };
          if (p.link.sendState(snap)) this.stats.snapsSent++;
        }
      } else if (link?.sendState(snap)) this.stats.snapsSent++;
      this.tracers = []; this.tracerSeen = 0; this.pbHits = [];
    }
    if ((g.state === 'ending' || g.state === 'debrief') && !this.endSent) {
      this.endSent = true;
      const why = (g as any).endResult?.reason;
      this.broadcast({ t: 'end', run: this.run, why: typeof why === 'string' ? why : 'The mission is over.' });
      this.endWhy = 'ended';
    }
  }

  // The guest's gun, fired here with the guest's aim: real rounds in the host's world
  private remoteGun(dt: number, peer: CrewPeer) {
    const w = this.game.world, pb = w.playerBomber, inp = peer.inp;
    peer.age += dt;
    if (!pb || !pb.alive || !inp || inp.s !== peer.seat) return;
    const def = STATIONS[peer.seat];
    const local = dirFromYawPitch(inp.y, inp.p, _remoteDir);
    const tg = pb.guns.get(peer.seat);
    if (tg) { if (!tg.want) tg.want = new THREE.Vector3(); tg.want.copy(local); }   // swing the visible gun / turret on the ship
    const live = peer.age < INPUT_STALE && performance.now() - peer.wall < INPUT_STALE * 1000;
    const state = this.game.state;
    if (!inp.f || !live || (state !== 'playing' && state !== 'ending')) { if (peer.cd < 0) peer.cd = 0; return; }
    const lo = this.game.gunner.loadout, W = lo.weapon;
    const rate = W.rate * lo.rate;
    peer.cd -= dt;
    let n = 0;
    while (peer.cd <= 0 && n++ < 8) {
      peer.cd += 1 / rate;
      const pivot = pb.localToWorld(_v.copy(def.pivot));
      const dir = _v2.copy(local).applyQuaternion(pb.quat);
      const sp = W.spread * lo.spread;
      dir.x += R() * sp; dir.y += R() * sp; dir.z += R() * sp;
      dir.normalize();
      const muzzle = pivot.addScaledVector(dir, 1.3);
      const vel = _remoteVel.copy(dir).multiplyScalar(W.velocity * lo.velocity).add(pb.vel);
      peer.shots++;
      w.ballistics.fire(muzzle, vel, 'allied', W.damage * lo.damage, peer.shots % W.tracerEvery === 0, W.tracer, peer.owner, !!W.cannon, false);
      this.stats.guestRounds++; peer.score.shots++;
      if (peer.shots % 2 === 0) w.effects.muzzleFlash(muzzle, dir, 0.8, pb.vel);
      if (peer.shots % 3 === 0) sound.play('m2far', muzzle, { gain: 0.55, ref: 8 });
    }
  }

  private aimBuf = new Float32Array(10);
  private wantBuf = STATION_ORDER.map(() => new THREE.Vector3());
  private aim2: [number, number] = [0, 0];
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
      if (ac instanceof Fighter) f |= w.destruction.bits(ac) << F_PARTS;   // parts shot off / burning
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
    msg.a = packAircraft(a);
    if (this.mode === 'gunner' && pb) {
      // every gun's aim and who is firing: the spectator's views, and the crewmates' guns on each ship
      const aims = this.aimBuf;
      STATION_ORDER.forEach((s, i) => {
        if (s === g.station) { aims[i * 2] = g.def.rest.yaw + g.state.yaw; aims[i * 2 + 1] = g.def.rest.pitch + g.state.pitch; return; }
        const tg = pb.guns.get(s);
        if (tg) { aimOf(tg.cur, this.aim2); aims[i * 2] = this.aim2[0]; aims[i * 2 + 1] = this.aim2[1]; }
        else { aims[i * 2] = STATIONS[s].rest.yaw; aims[i * 2 + 1] = STATIONS[s].rest.pitch; }
      });
      msg.ca = packAims(aims);
      msg.cf = fireMask(s => s === g.station ? g.firing : this.peers.some(p => !p.spec && p.seat === s && !!p.inp?.f && p.age < INPUT_STALE));
    }
    if (this.mode === 'pilot') { msg.pi = [this.pilots.hostId, this.pilots.guestId]; delete msg.ha; delete msg.hs; delete msg.ph; delete msg.z; }
    const budget = 1400;
    while (msg.tr.length && JSON.stringify(msg).length > budget) msg.tr.splice(-10);
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
    if (typeof m.a === 'string') { const rows = unpackAircraft(m.a); if (!rows) return; m.a = rows; }
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
    if (this.mode === 'pilot' && Array.isArray(m.pi)) {
      this.pilots.hostId = m.pi[0]; this.pilots.guestId = m.pi[1];
      const own = this.game.world.playerFighter; if (own) this.bind(this.pilots.guestId, own);
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
    if (this.flying) {
      this.pilots.notices(dt, this.partnerPlane);
      this.inAcc += dt;
      const f = g.world.playerFighter;
      if (this.inAcc >= 1 / INPUT_HZ && f) {
        this.inAcc %= 1 / INPUT_HZ;
        if (link.sendState({ t: 'pi', run: this.run, d: this.pilots.packet((f.trigger || this.devFire) && f.alive && g.state === 'playing' && !this.endWhy) })) this.stats.inputsSent++;
      }
      return;
    }
    this.screen.markPartner(this.roster, this.myId);
    this.screen.waiting(this.hostState === 'paused' ? 'Waiting for the host…' : null);
    if (this.watching) { this.spectator.pre(); return; }
    // our gun, to the host
    this.inAcc += dt / Math.max(0.05, this.engine.timeScale);
    if (this.inAcc >= 1 / INPUT_HZ && gun.bomber) {
      this.inAcc = Math.min(this.inAcc - 1 / INPUT_HZ, 1 / INPUT_HZ);
      const st = gun.state, def = gun.def;
      const fire = (gun.firing || this.devFire) && gun.transition <= 0 && g.state === 'playing' && this.hostState === 'playing' && !this.endWhy;
      if (link.sendState({ t: 'i', run: this.run, seq: ++this.inputSeq, s: gun.station, y: r4(def.rest.yaw + st.yaw), p: r4(def.rest.pitch + st.pitch), f: fire ? 1 : 0 })) this.stats.inputsSent++;
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
    if (this.flying) this.pilots.guestWorld(dt);
    this.trailAcc += dt;
    const emit = this.trailAcc >= 0.05;
    if (emit) this.trailAcc = 0;
    for (const a of w.aircraft) {
      if (this.flying && a instanceof Fighter && a === w.playerFighter) {
        updateDamageLook(a, w.time); updateDamageStages(a, dt, w.time, w.effects, w.listener);
        if (emit) {
          const eng = a.zone('engine');
          if (eng && (eng.burning || eng.hp < eng.maxHp * .65)) w.effects.trail(a.pos, a.vel, .7, !!eng.burning, .8);
        }
        continue;
      }
      if (a.alive) { if (a instanceof Bomber) a.update(dt); else a.updateProps(dt, 1.2); }
      else a.update(dt, w.time);
      if (a instanceof Fighter) { updateDamageLook(a, w.time); updateDamageStages(a, dt, w.time, w.effects, w.listener); }
      if (a.hitFlash > 0) a.hitFlash -= dt;
      if (emit && a.alive) this.trails(a);
    }
    updateExhausts(w.aircraft, w.effects.glow);
    updateBomberDeath(dt);
    updateFighterDeath(dt);
    w.destruction.update(dt, true);   // pieces and hulks fly; the host decides what fails
    w.ballistics.update(dt, []);   // tracers fly; nothing can be hit here
    w.effects.update(dt);
    w.wrecks.update(dt);
    w.contrails.update(w.time);
    w.bomberDamage.update(dt);
    // anything the local game spawned on its own (abilities, events) is not part of the host's battle
    if (this.mapped) for (const a of w.aircraft) if (!this.known.has(a) && !(this.flying && a === w.playerFighter)) a.remove = true;
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
    if (this.flying && w.playerFighter && this.pilots.guestId >= 0) this.bind(this.pilots.guestId, w.playerFighter);
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
    } else if (tr.kind === 'P' || isEscortKind(tr.kind)) {
      a = w.spawnEscort(pos.clone(), new THREE.Vector3(), tr.kind === 'P' ? 'p51d' : tr.kind);
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
      if (this.flying && a === w.playerFighter) continue; // own flight is never overwritten by snapshots
      if (this.flying && id === this.pilots.hostId) a.label = 'Blue One';
      if (!a.alive) continue;   // the local death animation owns it now
      sampleTrack(tr.s, rt, a.root.position, a.root.quaternion, a.vel);
      a.root.position.sub(this.origin);
      if (a instanceof Fighter) a.fm.vel.copy(a.vel);
      // the newest flags (deaths come through the kill event; this is the fallback)
      const last = tr.s[tr.s.length - 1];
      this.flags.set(a, last.f);
      if (a instanceof Fighter && Number.isFinite(a.maxStructure)) a.structure = Math.max(1e-3, last.fr) * a.maxStructure;
      if (a instanceof Fighter) w.destruction.applyBits(a, last.f >>> F_PARTS);
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
      if (tg && Array.isArray(m.ha)) { tg.want ??= new THREE.Vector3(); dirFromYawPitch(Number(m.ha[0]) || 0, Number(m.ha[1]) || 0, tg.want); }
      // the rest of the crew's guns (our own station is the first-person gun)
      if (readAims(m.ca, this.crewAim)) {
        this.crewFire = Number.isInteger(m.cf) ? m.cf : 0;
        const mine = this.game.gunner.station;
        STATION_ORDER.forEach((s, i) => {
          if (s === mine || s === this.hostSeat) return;
          const g = pb.guns.get(s);
          if (g) g.want = dirFromYawPitch(this.crewAim[i * 2], this.crewAim[i * 2 + 1], this.wantBuf[i]);
        });
      }
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

  private onKill(id: number, byGuest: boolean, byHost = false, death = -1) {
    this.stats.killsRecv++;
    this.pendingDeath.delete(id);
    const a = this.proxies.get(id);
    this.dead.set(id, this.rt);
    if (!a || !a.alive || this.game.mission !== this.mission) return;
    // the full local death: fireball / wing off / spin, kill feed, and our score when it was ours
    const g = this.game, score = g.score, kills = g.world.stats.kills;
    if (!byGuest) a.playerDamage = -1; // proxy has no damage ledger; 0 >= 0 is not an assist
    if (a instanceof Fighter && death >= 0) g.world.destruction.forceDeath(a, death);
    g.world.killAircraft(a, byGuest, '');
    if (this.flying && a.team === 'axis' && byHost) this.ui.feed(tx('{name} destroyed {target}', { name: tx('Blue One'), target: tx(a.label) }), 'mine');
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
