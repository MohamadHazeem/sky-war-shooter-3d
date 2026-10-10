import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { UI, Settings, Progress, DebriefData, PauseInfo } from '../ui/UI';
import { World, ALTITUDE } from '../world/World';
import { randomEnemyType } from '../world/EnemyTypes';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import { GunnerController } from './GunnerController';
import { PilotController } from './PilotController';
import { PhotoMode } from './PhotoMode';
import { CAMPAIGN, Mission, Round, roundDef, survivalMission, SpawnFrom, Wave } from './Missions';
import { STATIONS, STATION_ORDER, StationId } from '../world/B17Layout';
import { sound } from '../audio/Sound';
import { DistantBattle } from '../audio/DistantBattle';
import { INTERPHONE_LEAD_S } from '../audio/Interphone';
import type { AttackType } from '../world/AI';
import { applyWeather, DEFAULT_WEATHER, Weather } from '../render/Weather';
import * as Radar from '../ui/Radar';
import { Progression } from './Upgrades';
import { GlassCracks } from '../ui/Cracks';
import { Combo } from './Combo';
import { CombatTally } from './CombatTally';
import { achievements } from './Achievements';

type State = 'menu' | 'briefing' | 'playing' | 'paused' | 'ending' | 'debrief';

const SETTINGS_KEY = 'sws3d.settings.v2';
const PROGRESS_KEY = 'sws3d.progress.v1';

function load<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? { ...def, ...JSON.parse(s) } : def; } catch { return def; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

const _v = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;

// Bail-out sequence when a gunner's B-17 is shot down (before the debrief)
const BAIL_SEQ_TIME = 6.5;                            // seconds of sequence
const BAIL_STRIKES = 4, BAIL_GAP = 0.7;               // alarm bell strikes (each also jolts the camera)
const BAIL_CHUTES = [0.9, 1.1, 1.4, 1.8, 2.4, 3.1];   // when each crewman's chute is released

export class Game {
  state: State = 'menu';
  readonly world: World;
  readonly gunner: GunnerController;
  readonly pilot: PilotController;
  readonly photo: PhotoMode;
  settings: Settings;
  progress: Progress;
  mission: Mission | null = null;
  private waveIdx = 0;
  private waveTimer = 0;
  private survivalWave = 0;
  private survivalBreak = 0;
  // radar: Tab toggles the big map; the next wave's arrival point is decided early so it can be shown
  readonly prog = new Progression();
  private perkWave = 0;        // last wave a perk was offered after
  private killsSincePerk = 0;  // every 5 kills also earns a perk
  private spawnCd = 0;         // director: time to the next group
  private roundIdx = 0;        // rounds: harder each time, a hangar break between them
  private roundT0 = 0;
  private roundClear = false;
  private roundsComplete = false;
  private scoreBanked = 0;     // score already paid out as merit at round ends
  private roundKills0 = 0;
  private groups = 0;
  private loadout = this.prog.loadout();
  private baseDamageScale = 1;
  private berserkT = 0;
  private killCount = 0;
  private mapOpen = false;
  private mapT = 0;
  private incomingOff: THREE.Vector3 | null = null;  // relative to the formation centre
  private incoming: Radar.Incoming | null = null;
  private escortsSpawned = false;
  private bombsDropped = false;
  private endTimer = 0;
  private endResult: { success: boolean; reason: string } | null = null;
  private bailT = -1;     // seconds into the bail-out sequence, -1 when inactive
  private bailBell = 0;   // alarm strikes rung so far
  private bailCue = 0;    // crew chutes released so far
  private score = 0;
  private hudAcc = 0;
  private threats: Partial<Record<StationId, number>> = {};
  private idleSeatT = 0;
  private lastSeatTip = -99;
  private hitMarkerT = 0;
  private killMarkerT = 0;
  private damageT = 0;
  private woundT = 0;   // eased wounded-crew amount for the PostFX desaturation
  private cracks = new GlassCracks();
  private slowmo = 0;
  private streak = 0;
  private combo = new Combo();
  private lastKillAt = -99;
  private aceAwarded = false;
  private tally = new CombatTally();
  private chatterT = 0;
  private trauma = 0;
  private popups: { pos: THREE.Vector3; text: string; life: number }[] = [];
  private slowFrames = 0;
  private autoQualityDone = false;
  private prewarmed = false;
  private menuShot = 0;
  private menuShotT = 0;
  private menuMode = true;
  private distantBattle = new DistantBattle();
  private menuGunner = false;
  private bombs: { obj: THREE.Object3D; vel: THREE.Vector3; life: number }[] = [];
  private bombGeo = new THREE.CapsuleGeometry(0.2, 1.1, 4, 8);
  private bombMat = new THREE.MeshStandardMaterial({ color: 0x3c3f33, roughness: 0.6, metalness: 0.4 });

  constructor(private engine: Engine, private input: Input, private ui: UI) {
    this.world = new World(engine);
    this.gunner = new GunnerController(engine, this.world, input);
    this.pilot = new PilotController(engine, this.world, input);
    this.photo = new PhotoMode(engine, input, this.world);
    this.settings = load<Settings>(SETTINGS_KEY, { sensitivity: 1, invertY: false, volume: 0.8, musicVolume: 1, sfxVolume: 1, ambVolume: 1, radio: false, music: true, quality: 'high', markers: true, leadPip: 'always', aimAssist: 'high', flightMode: 'mouseAim', difficulty: 'veteran', fov: 65 });
    // settings saved before aim assist existed: switch the lead indicator on with it
    let raw = ''; try { raw = localStorage.getItem(SETTINGS_KEY) ?? ''; } catch { /* */ }
    if (raw && !raw.includes('aimAssist')) { this.settings.aimAssist = 'high'; this.settings.leadPip = 'always'; if (this.settings.fov === 62) this.settings.fov = 65; }
    // wider view by default (enemies were enlarged to match): move old 55/62 defaults to 65
    if (raw && !raw.includes('"fovV"')) { if (this.settings.fov === 55 || this.settings.fov === 62) this.settings.fov = 65; (this.settings as any).fovV = 2; }
    this.progress = load<Progress>(PROGRESS_KEY, { unlocked: 0, medals: {}, best: {}, survival: [] });
    this.applySettings();
    this.wireWorldEvents();
    this.gunner.onNotice = (t) => this.ui.tip(t, 2200);
    // Esc releases pointer lock -> pause. If the browser never granted the lock the game
    // simply runs in free-cursor mode (no pause loop).
    input.onLockChange = (locked) => {
      if (this.state === 'playing' && !locked && this.input.everLocked) this.pause();
      this.ui.showLockHint(false);
    };
    engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked) this.pause();
      if (e.code === 'KeyP' && this.state === 'playing') this.pause();
      if (e.code === 'KeyF' && !e.repeat && this.state === 'playing') this.photo.toggle();
      if (e.code === 'Tab' && !e.repeat && (this.state === 'playing' || this.state === 'ending')) { e.preventDefault(); this.mapOpen = !this.mapOpen; }
    });
    engine.onFrame = (dt) => this.frame(dt);
    // Browsers only allow audio after a user gesture: start it on the first one
    const unlock = () => { sound.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // Compile shaders for objects that only appear mid-mission (debris, chutes, bombs,
  // gunner viewmodels) so the first explosion doesn't hitch.
  warmupShaders() {
    const g = new THREE.Group();
    for (const o of this.world.effects.warmupObjects()) g.add(o);
    g.add(new THREE.Mesh(this.bombGeo, this.bombMat));
    g.position.copy(this.engine.camera.position).add(new THREE.Vector3(0, 0, -20).applyQuaternion(this.engine.camera.quaternion));
    this.engine.scene.add(g);
    const pb = this.world.playerBomber;
    if (pb) this.gunner.attach(pb, 'waistL');
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    if (pb) this.gunner.detach();
    this.engine.scene.remove(g);
  }

  private weatherKey = '';
  private setWeather(w: Weather) {
    const key = JSON.stringify(w);
    this.world.contrails.enabled = w.contrails !== false;
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    applyWeather(this.engine, w);
  }

  applySettings() {
    const s = this.settings;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    sound.setVolume(s.volume);
    sound.setMusicVolume(s.musicVolume);
    sound.setSfxVolume(s.sfxVolume);
    sound.setAmbVolume(s.ambVolume);
    sound.radioEnabled = s.radio;
    sound.setMusic(s.music);
    this.pilot.mode = s.flightMode;
    if (this.loadout) this.applyAssist();
    // Base FOV from Settings (clamped; the views derive their zoom from it each frame)
    const fov = THREE.MathUtils.clamp(Number.isFinite(s.fov) ? s.fov : 62, 50, 80);
    this.gunner.baseFov = fov;
    this.pilot.baseFov = fov;
    if (this.engine.quality !== s.quality) this.engine.setQuality(s.quality);
    save(SETTINGS_KEY, s);
  }

  private wireWorldEvents() {
    const w = this.world;
    w.events.radio = (speaker, text) => {
      // interphone: call-click and static first, then the line and subtitle
      sound.radioStatic();
      const voice = ['Pilot', 'Navigator', 'Tail', 'Top Turret', 'Ball Turret', 'Bombardier', 'Radio', 'Lead', 'Big Friend'].indexOf(speaker);
      setTimeout(() => {
        this.ui.subtitle(speaker, text);
        sound.speak(text, Math.max(0, voice));
      }, INTERPHONE_LEAD_S * 1000);
    };
    w.events.kill = (victim, byPlayer, cause) => {
      if (victim.team === 'axis') {
        if (byPlayer) {
          // paid at the multiplier held going in; the kill then builds the next step
          const pts = Math.round(100 * (1 + this.survivalWave * 0.1) * this.combo.mult * this.loadout.scoreMult);
          this.score += pts;
          this.combo.onKill();
          this.killsSincePerk++;
          this.killCount++;
          if (this.loadout.berserk) this.berserkT = 6;
          const repair = this.loadout.killRepair + (this.loadout.vampire && this.killCount % 3 === 0 ? 0.1 : 0);
          if (repair) {
            const pl = w.player;
            if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * repair);
            if (this.mission?.role === 'gunner') this.gunner.coolBarrel();
          }
          this.popups.push({ pos: victim.pos.clone(), text: `+${pts}  KILL`, life: 1.6 });
          achievements.onConfirmedKill(w.stats.kills, cause ?? '');
          sound.confirm('kill_confirm');
          this.ui.feed(`${victim.label} destroyed — confirmed`, 'mine');
          // streaks: kills in quick succession
          this.streak = w.time - this.lastKillAt < 9 ? this.streak + 1 : 1;
          this.lastKillAt = w.time;
          if (this.streak >= 2) {
            const label = this.streak === 2 ? 'Double' : this.streak === 3 ? 'Triple' : `${this.streak}×`;
            this.score += 50 * this.streak;
            this.ui.feed(`${label} — +${50 * this.streak}`, 'mine');
          }
          // debrief record: gun position that fired (gunner) and range at the kill
          const range = w.player ? victim.pos.distanceTo(w.player.pos) : Infinity;
          this.tally.recordKill(this.streak, range, this.mission?.role === 'gunner' ? w.playerStation : null);
          if (w.stats.kills >= 5 && !this.aceAwarded) {
            this.aceAwarded = true;
            this.score += 500;
            this.ui.banner('FIVE CONFIRMED', 'Ace in a day', 3500);
            w.callout('ace', 'Pilot', 'That\'s five! You\'re an ace, gunner — drinks are on me tonight!', 0, 3);
          }
          this.killMarkerT = 0.45;
          this.slowmo = this.loadout.bulletTime ? 1.1 : 0.4;
          const lines = ['Got him! He\'s going down!', 'You got him! Nice shooting!', 'He\'s smoking — he\'s finished!', victim.label === 'Bf 109' ? 'Scratch one Messerschmitt!' : 'Scratch one Focke-Wulf!'];
          w.callout('kill', ['Tail', 'Pilot', 'Top Turret', 'Navigator'][Math.floor(Math.random() * 4)], lines[Math.floor(Math.random() * lines.length)], 3, 2);
        } else {
          this.ui.feed(`${victim.label} destroyed`);
        }
      } else if (victim instanceof Fighter && !victim.isPlayer) {
        this.ui.feed('P-51 lost', 'loss');
      }
    };
    w.events.bomberLost = (b) => {
      this.ui.feed(`B-17 "${b.name}" going down`, 'loss');
      if (!b.isPlayer) w.callout('lost' + b.id, 'Tail', `${b.name} is going down! Count the chutes!`, 1, 2);
      else w.callout('playerdown', 'Pilot', 'We\'ve had it! Bail out! Bail out!', 0, 3);
    };
    w.events.playerHit = (zone, heavy) => {
      sound.airframeHit(heavy);
      achievements.onPlayerHit();
      this.damageT = Math.min(0.5, this.damageT + (heavy ? 0.22 : 0.08));
      if (heavy && this.mission?.role === 'gunner' && this.gunner.def.type !== 'waist' && Math.random() < 0.35) this.cracks.hit(); // waist windows are open: no glass
      if (zone === 'gunner') {
        this.ui.feed('You are wounded', 'loss');
        w.callout('wound', 'Navigator', 'Gunner\'s hit! Stay on that gun if you can!', 10, 2);
      }
    };
    w.events.fuselageHit = (local, dir) => { if (this.mission?.role === 'gunner') this.gunner.fuselageHit(local, dir); };
    // shake is kept small and short so the sight stays usable while under fire
    w.events.shake = (a) => { this.trauma = Math.min(0.6, this.trauma + a * 0.4); };
    // kills feed the combo in the kill handler; plain hits only keep it alive and nudge it up
    w.events.hitMarker = (kill) => { if (kill) this.killMarkerT = 0.45; else { this.hitMarkerT = 0.12; this.combo.onHit(); } };
  }

  // ---------------- Menu ----------------
  startMenu() {
    this.photo.exit();
    this.state = 'menu';
    this.menuMode = true;
    this.input.unlock();
    this.gunner.detach();
    this.pilot.detach();
    this.world.reset();
    this.clearBombs();
    this.setWeather(DEFAULT_WEATHER);
    this.world.spawnFormation(12, 1);
    for (let i = 0; i < 3; i++) this.world.spawnEscort(new THREE.Vector3(R() * 300, ALTITUDE + 300 + i * 40, -200 + i * 80), new THREE.Vector3(200 * (i - 1), 350, 200));
    this.menuShot = 0;
    this.menuShotT = 0;
    this.menuGunner = false;
    sound.setMode('menu');
    this.ui.title({
      campaign: () => this.showCampaign(),
      survival: () => this.ui.survivalMenu(this.progress, (r) => this.showBriefing(survivalMission(r)), () => this.startMenu()),
      armory: () => this.ui.armory(this.prog, () => this.startMenu()),
      settings: () => this.ui.settings(this.settings, (s) => { this.settings = s; this.applySettings(); }, () => this.startMenu()),
      credits: () => this.ui.credits(() => this.startMenu()),
    });
    this.ui.fade(false);
  }

  private showCampaign() {
    this.ui.campaign(CAMPAIGN, this.progress, (m) => this.showBriefing(m), () => this.startMenu());
  }

  private showBriefing(m: Mission) {
    sound.init();
    this.state = 'briefing';
    this.ui.briefing(m, () => this.startMission(m), () => (m.number ? this.showCampaign() : this.startMenu()));
  }

  // Cinematic camera over the formation behind the menus
  private menuCamera(dt: number) {
    this.menuShotT += dt;
    const shots = 4;
    if (this.menuShotT > 10) { this.menuShotT = 0; this.menuShot = (this.menuShot + 1) % shots; }
    const pb = this.world.playerBomber;
    if (!pb) return;
    const cam = this.engine.camera;
    if (cam.parent !== this.engine.scene) this.engine.scene.add(cam);
    const t = this.menuShotT;
    const center = pb.pos;
    // Shot 1 = the waist-gunner view from the reference footage
    if (this.menuShot === 1) {
      if (!this.menuGunner) { this.gunner.attach(pb, 'waistL'); this.menuGunner = true; }
      // slow scripted sweep along the formation
      const s = this.gunner.state;
      s.tYaw = Math.sin(t * 0.25) * 0.35 + 0.15;
      s.tPitch = Math.sin(t * 0.33) * 0.06 + 0.02;
      this.input.enabled = false;
      this.gunner.update(dt);
      this.input.enabled = true;
      return;
    }
    if (this.menuGunner) { this.gunner.detach(); this.menuGunner = false; }
    let pos: THREE.Vector3, look: THREE.Vector3;
    if (this.menuShot === 0) {
      pos = _v.copy(center).add(new THREE.Vector3(34 - t * 0.6, 6 + Math.sin(t * 0.2) * 2, 26 - t * 2.2));
      look = center.clone().add(new THREE.Vector3(0, 0, 4));
    } else if (this.menuShot === 2) {
      pos = _v.copy(this.world.formationCenter).add(new THREE.Vector3(-260 + t * 10, 120, 240 - t * 6));
      look = this.world.formationCenter.clone().add(new THREE.Vector3(0, -30, -80));
    } else {
      pos = _v.copy(center).add(new THREE.Vector3(-8 + t * 0.4, 3.5, -36 + t * 0.8));
      look = center.clone().add(new THREE.Vector3(0, 1, 10));
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.fov = this.menuShot === 2 ? 40 : 52;
    cam.updateProjectionMatrix();
    this.engine.post.nearFocus = 0.1;
    this.engine.post.dofStrength = 0;
    this.engine.post.noBlurDist = 1e6;
  }

  // ---------------- Missions ----------------
  startMission(m: Mission) {
    sound.init();
    this.photo.exit();
    this.mission = m;
    this.menuMode = false;
    this.slowmo = 0;
    this.engine.timeScale = 1;
    this.menuGunner = false;
    this.gunner.detach();
    this.pilot.detach();
    this.world.reset();
    this.clearBombs();
    this.world.difficulty = 1;
    this.waveIdx = 0;
    this.waveTimer = 0;
    this.survivalWave = 0;
    this.survivalBreak = 6;
    this.escortsSpawned = false;
    this.bombsDropped = false;
    this.endTimer = 0;
    this.endResult = null;
    this.bailT = -1;
    this.score = 0;
    this.damageT = 0;
    this.cracks.clear();
    this.engine.post.resetHistory();
    // survival picks a random time of day
    const presets: Weather[] = CAMPAIGN.map((c) => c.weather!).filter(Boolean);
    this.setWeather(m.weather ?? (m.duration === Infinity ? presets[Math.floor(Math.random() * presets.length)] : DEFAULT_WEATHER));
    this.world.playerDamageScale = (m.playerArmor ?? (m.role === 'gunner' ? 0.6 : 0.75)) * (m.role === 'gunner' ? 0.55 : 0.6);
    this.world.aiGunnerFactor = 1;
    this.world.playerFocus = m.role === 'gunner' ? 0.75 : 0.2;
    const diff = this.settings.difficulty;
    this.world.difficulty = diff === 'recruit' ? 0.8 : diff === 'ace' ? 1.2 : 1;
    this.world.playerDamageScale *= diff === 'recruit' ? 0.7 : diff === 'ace' ? 1.3 : 1;
    if (diff === 'recruit') this.world.aiGunnerFactor *= 1.2;
    this.streak = 0; this.lastKillAt = -99; this.aceAwarded = false; this.trauma = 0;
    this.incoming = null; this.incomingOff = null; this.mapOpen = false; this.mapT = 0;
    this.prog.perks = []; this.perkWave = 0; this.killsSincePerk = 0; this.spawnCd = 0; this.groups = 0;
    this.roundIdx = 0; this.roundT0 = 0; this.roundClear = false; this.roundsComplete = false; this.scoreBanked = 0; this.roundKills0 = 0;
    this.combo.reset();
    this.tally.reset();
    achievements.beginMission(m);
    this.world.spawnFormation(m.bombers, 1);
    const pb = this.world.playerBomber!;
    if (m.role === 'pilot') for (const b of this.world.bombers()) for (const z of b.zones) { z.hp *= 2.2; z.maxHp *= 2.2; }
    if (m.role === 'gunner') {
      this.gunner.resetAmmo();
      this.gunner.attach(pb, m.station ?? 'waistL');
      sound.setMode('bomber');
      if (m.playerDamaged) {
        for (const name of ['engine2', 'engine4']) {
          const z = pb.zone(name)!;
          z.hp = 0; (z as any).destroyed = true;
          pb.engineDead[z.engine!] = true;
        }
        pb.straggling = true;
        pb.zone('engine2')!.burning = false;
        this.world.playerDamageScale = 0.45;
      }
      this.world.flakIntensity = 0;
    } else {
      // P-51: start above and behind the box
      const start = this.world.formationCenter.clone().add(new THREE.Vector3(60, 420, -600));
      const f = this.world.spawnPlayerFighter(start, this.world.formationForward);
      this.pilot.attach(f);
      this.pilot.throttleCmd = 0.85;
      sound.setMode('fighter');
      for (let i = 0; i < (m.escorts ?? 0); i++) {
        this.world.spawnEscort(start.clone().add(new THREE.Vector3((i + 1) * 40 * (i % 2 ? 1 : -1), 10, -30 * (i + 1))), new THREE.Vector3((i - 1.5) * 250, 380, 150));
      }
    }
    this.prog.role = m.role;
    this.baseDamageScale = this.world.playerDamageScale;
    this.berserkT = 0; this.killCount = 0;
    this.applyLoadout(true);
    if (!this.prewarmed) { this.prewarmed = true; this.world.prewarm(() => this.engine.render(1 / 60), this.engine.camera); }
    this.state = 'playing';
    this.distantBattle.reset();
    this.ui.hud(m.role);
    this.ui.fadeTo(1);
    setTimeout(() => this.ui.fade(false), 50);
    this.input.lock();
    this.ui.banner(m.number ? `MISSION ${m.number} · ${m.target.toUpperCase()}` : m.date.toUpperCase(), m.title, 3800);
    const tips = m.role === 'gunner'
      ? ['<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire', 'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom', 'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position']
      : ['<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires', 'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle', 'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view'];
    tips.forEach((t, i) => setTimeout(() => { if (this.state === 'playing' && this.mission === m) this.ui.tip(t, 4200); }, 4200 + i * 4600));
    setTimeout(() => {
      if (this.state !== 'playing') return;
      if (m.role === 'gunner') this.world.callout('start', 'Pilot', `Pilot to crew: we're at altitude. Test fire your guns, and keep your eyes open.`, 0, 3);
      else this.world.callout('start', 'Lead', 'Blue flight, form up on the bombers. Keep your eyes peeled for bandits.', 0, 3);
    }, 2500);
  }

  // Armory levels + this mission's perks -> guns, ammo, fire, aim aid
  private applyLoadout(refill = false) {
    const l = this.loadout = this.prog.loadout();
    this.gunner.applyLoadout(l, refill);
    const w = this.world;
    w.playerIncendiary = l.incendiary;
    w.playerExecute = l.execute;
    w.playerLucky = l.lucky;
    w.playerWingDmg = l.wingDmg;
    w.playerExplosive = l.explosive;
    w.playerSplash = l.splash;
    w.enemyAimMult = l.enemyAim;
    w.playerDamageScale = this.baseDamageScale * l.armor;
    const f = w.playerFighter;
    if (f && this.mission?.role === 'pilot') {
      const wp = l.weapon;
      for (const g of f.guns) {
        g.damage = wp.damage * l.damage; g.rate = wp.rate * l.rate; g.muzzleVel = wp.velocity * l.velocity;
        g.spread = wp.spread * l.spread; g.cannon = !!wp.cannon; g.tracerEvery = wp.tracerEvery; g.tracerColor = wp.tracer;
        g.ammo = Infinity; // unlimited belts: the fight never stops for ammunition
      }
      const fb = f.fm as any;
      fb.basePower ??= f.fm.p.power;
      f.fm.p = { ...f.fm.p, power: fb.basePower * l.power };
    }
    this.applyAssist();
  }

  // aim assist: Settings level x Hawkeye perk; bullet magnetism x Gyro Gunsight / Gyro Lock
  private applyAssist() {
    const a = this.settings.aimAssist === 'off' ? 0 : this.settings.aimAssist === 'low' ? 0.5 : 1;
    this.gunner.assist = Math.min(1.6, a * this.loadout.assist);
    this.pilot.assist = Math.min(1.6, a * this.loadout.assist);
    this.world.ballistics.playerHitScale = (1 + 0.4 * a) * this.loadout.hitScale;
  }

  // Field upgrade: a random perk, applied on the spot with a short card (no pause)
  private awardPerk(label: string) {
    const p = this.prog.award();
    if (p.id === 'repair') {
      const pl = this.world.player;
      if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.35);
    }
    this.applyLoadout();
    this.ui.perkToast(label, p.name, p.desc);
    sound.confirm('kill_confirm');
  }

  // Continuous engagement: keep the sky full. Groups of 2-4 arrive whenever fewer fighters
  // are in the air than the round's ramping target; the next group shows on the radar.
  private director(dt: number, m: Mission, r: Round, enemies: number) {
    const w = this.world, t = w.time - this.roundT0;
    const ramp = THREE.MathUtils.clamp((t - r.start) / (r.duration * 0.6), 0, 1);
    const target = Math.round(r.min + (r.max - r.min) * ramp);
    // round over: stop sending fighters; once the sky is clear (or 30 s on) the round ends
    if (t >= r.duration) {
      this.updateIncoming(null, null);
      if (!this.roundClear && (enemies === 0 || t >= r.duration + 30) && this.state === 'playing') { this.roundClear = true; this.endRound(m); }
      return;
    }
    if (t < r.start) { this.updateIncoming(null, null); return; }
    this.spawnCd -= dt;
    const want = target - enemies;
    if (want <= 0) { this.updateIncoming(null, null); return; }
    const sides: SpawnFrom[] = ['front', 'rear', 'left', 'right', 'high'];
    const n = Math.min(want, 2 + Math.floor(Math.random() * 3));
    // gunner: every other group goes for a gun position the player is not manning
    let station: string | undefined;
    if (this.mission?.role === 'gunner' && this.groups > 0 && Math.random() < 0.55) {
      const others = STATION_ORDER.filter((s) => s !== this.gunner.station);
      station = others[Math.floor(Math.random() * others.length)];
    }
    const next: Wave = {
      at: 0, count: Math.max(1, n), station,
      from: this.groups % 3 === 2 ? sides[Math.floor(Math.random() * sides.length)] : (this.mission?.role === 'gunner' ? 'mixed' : sides[this.groups % sides.length]),
      skill: THREE.MathUtils.lerp(r.skill[0], r.skill[1], ramp), rockets: r.rockets ?? 0,
    };
    // the first group comes straight away, later ones after a short gap (shown on the radar)
    if (this.groups === 0) this.spawnCd = Math.min(this.spawnCd, r.start - t + 0.01);
    this.updateIncoming(Math.max(0, this.spawnCd), next);
    if (this.spawnCd > 0) return;
    this.spawnWave(next);
    if (this.groups === 0 && m.waves[0]?.radio) w.callout('round', m.waves[0].radio[0], m.waves[0].radio[1], 0, 3);
    else if (next.station) {
      const calls: Record<string, [string, string]> = {
        tail: ['Tail', 'Fighters coming in at six o\'clock — get on the tail gun!'],
        ball: ['Ball', 'Bandits coming up underneath — ball turret, they\'re yours!'],
        top: ['Top Turret', 'Bandits high, twelve o\'clock — top turret!'],
        waistL: ['Navigator', 'Left waist! Fighters at nine o\'clock!'],
        waistR: ['Navigator', 'Right waist! Fighters at three o\'clock!'],
      };
      const c = calls[next.station];
      if (c) w.callout('st' + next.station, c[0], `${c[1]} Press ${STATIONS[next.station as StationId].key}.`, 7, 2);
    } else if (w.player) {
      const p = this.world.fighters('axis').filter((f) => f.alive).pop();
      if (p) w.callout('grp' + (this.groups % 4), Math.random() < 0.5 ? 'Tail' : 'Navigator', `${n > 2 ? 'More bandits' : 'Bandits'}, ${w.clockPosition(w.player, p.pos)}!`, 6, 2);
    }
    this.groups++;
    this.spawnCd = THREE.MathUtils.lerp(7, 3.5, ramp) + Math.random() * 3;
  }

  // A round is over: the last round of a campaign mission completes it; otherwise the
  // merit earned so far is paid out and the hangar opens before the next, harder round.
  private endRound(m: Mission) {
    const w = this.world;
    const last = Number.isFinite(m.rounds ?? 1) && this.roundIdx >= (m.rounds ?? 1) - 1;
    if (last) { this.roundsComplete = true; return; }
    const earned = Math.round((this.score - this.scoreBanked) * this.loadout.scoreMult);
    this.prog.earn(earned);
    this.scoreBanked = this.score;
    const kills = w.stats.kills - this.roundKills0;
    this.state = 'paused';
    this.engine.paused = true;
    this.input.unlock();
    w.callout('roundend', 'Pilot', 'That\'s the last of them for now. Catch your breath, they\'ll be back.', 0, 3);
    this.ui.hangar(this.prog, m.role, {
      title: `ROUND ${this.roundIdx + 1} CLEARED`,
      sub: `${kills} kills this round · +${earned} merit`,
      next: Number.isFinite(m.rounds ?? 1) ? `Round ${this.roundIdx + 2} of ${m.rounds}` : `Round ${this.roundIdx + 2}`,
    }, () => this.startNextRound());
  }

  private startNextRound() {
    const w = this.world;
    this.roundIdx++;
    this.roundT0 = w.time;
    this.roundClear = false;
    this.groups = 0; this.spawnCd = 0;
    this.roundKills0 = w.stats.kills;
    // ground crew patch-up between rounds
    const pl = w.player;
    if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.3);
    this.applyLoadout(true);
    this.state = 'playing';
    this.engine.paused = false;
    this.input.lock();
    this.ui.banner(`ROUND ${this.roundIdx + 1}`, this.roundIdx >= 3 ? 'They\'re sending everything they have' : 'More fighters inbound', 2800);
    w.callout('roundstart', 'Pilot', 'Here they come again! Look sharp, gunners!', 0, 3);
  }

  private spawnPos(from: SpawnFrom): THREE.Vector3 {
    const c = this.world.formationCenter;
    const f = this.world.formationForward;
    const left = new THREE.Vector3(0, 1, 0).cross(f).normalize();
    const pick = from === 'mixed' ? (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[Math.floor(Math.random() * 5)] : from;
    const p = c.clone();
    switch (pick) {
      case 'front': p.addScaledVector(f, 5200).addScaledVector(left, R() * 1200).y += 500 + Math.random() * 500; break;
      case 'rear': p.addScaledVector(f, -3300).addScaledVector(left, R() * 900).y += 200 + Math.random() * 400; break;
      case 'left': p.addScaledVector(left, 3600).addScaledVector(f, 600 + R() * 1200).y += Math.random() * 500 - 100; break;
      case 'right': p.addScaledVector(left, -3600).addScaledVector(f, 600 + R() * 1200).y += Math.random() * 500 - 100; break;
      case 'high': p.addScaledVector(f, R() * 2000).addScaledVector(left, R() * 2000).y += 2000 + Math.random() * 500; break;
    }
    return p;
  }

  // Where the next wave will appear, relative to the formation centre. Gunner missions:
  // out where the player's gun is pointing, so the fighters are seen forming up and coming in.
  private predictWave(w: Wave): THREE.Vector3 {
    const arc = this.mission?.role === 'gunner' ? (w.station ? this.world.stationArc(w.station) : this.world.playerArc()) : null;
    const base = arc ? this.world.playerBomber!.pos.clone().addScaledVector(arc, 1700).add(new THREE.Vector3(R() * 300, 250 + Math.random() * 300, R() * 300)) : this.spawnPos(w.from === 'mixed' ? 'front' : w.from);
    return base.sub(this.world.formationCenter);
  }

  // Track the next wave for the radar: fix its arrival point once it is < 25 s out
  private updateIncoming(eta: number | null, w: Wave | null, count = w?.count ?? 0) {
    if (eta === null || !w || eta > 25) { this.incoming = null; if (eta === null) this.incomingOff = null; return; }
    if (!this.incomingOff) this.incomingOff = this.predictWave(w);
    this.incoming = { pos: this.world.formationCenter.clone().add(this.incomingOff), eta, count };
  }

  private spawnWave(w: Wave) {
    const arc = this.mission?.role === 'gunner' ? (w.station ? this.world.stationArc(w.station) : this.world.playerArc()) : null;
    const base = this.world.formationCenter.clone().add(this.incomingOff ?? this.predictWave(w));
    this.incomingOff = null; this.incoming = null;
    for (let i = 0; i < w.count; i++) {
      const fromArc = arc && (i < Math.ceil(w.count * 0.75));
      const p = fromArc || w.from !== 'mixed' ? base.clone().add(new THREE.Vector3(R() * 150 + i * 45, R() * 60, R() * 150)) : this.spawnPos('mixed');
      let attack: AttackType | undefined = w.attack;
      if (!attack) attack = (['headon', 'stern', 'beam', 'high'] as AttackType[])[Math.floor(Math.random() * 4)];
      const f = this.world.spawnEnemy(p, attack, w.skill, true, Math.random() < (w.rockets ?? 0), randomEnemyType());
      if (fromArc && w.station) this.world.assignStation(f, w.station);
    }
    if (w.radio) this.world.callout('wave' + this.waveIdx, w.radio[0], w.radio[1], 0, 3);
  }

  private direct(dt: number) {
    const m = this.mission!;
    const w = this.world;
    const t = w.time;
    const enemies = w.activeEnemies().length;
    // field promotion: every 5 kills, once the kill's slow-motion beat has played
    if (this.killsSincePerk >= 6 && t - this.lastKillAt > 1.2 && this.state === 'playing' && w.player?.alive) {
      this.killsSincePerk = 0;
      this.awardPerk('6 KILLS · FIELD UPGRADE');
    }
    if (m.round) {
      this.director(dt, m, roundDef(m, this.roundIdx), enemies);
    } else if (m.waves.length) {
      this.waveTimer += dt;
      const next = m.waves[this.waveIdx];
      // field promotion: every 5 kills, once the kill's slow-motion beat has played
      if (this.killsSincePerk >= 5 && t - this.lastKillAt > 1.2 && this.state === 'playing' && w.player?.alive) {
        this.killsSincePerk = 0;
        this.awardPerk('5 KILLS · FIELD PROMOTION');
        return;
      }
      // a wave wiped out with more to come: pick a perk (the next wave waits)
      if (next && enemies === 0 && this.waveIdx > 0 && this.perkWave < this.waveIdx && this.waveTimer > 2.5 && this.state === 'playing' && w.player?.alive) {
        this.perkWave = this.waveIdx; this.killsSincePerk = 0;
        this.awardPerk(`WAVE ${this.waveIdx} CLEARED`);
        return;
      }
      if (next) {
        const ready = next.afterClear ? (enemies === 0 && this.waveTimer > 6) || this.waveTimer > 75 : t >= next.at;
        this.updateIncoming(next.afterClear ? (enemies === 0 ? Math.max(0, 6 - this.waveTimer) : 75 - this.waveTimer) : next.at - t, next);
        if (ready) {
          this.spawnWave(next); this.waveIdx++; this.waveTimer = 0;
          // between waves the gunners restock and the Mustang's guns are topped up
          if (this.waveIdx > 1) {
            this.gunner.resetAmmo();
            if (w.playerFighter) { this.applyLoadout(true); this.ui.tip('Guns topped up', 1800); }
          }
        }
      }
    } else if (m.duration === Infinity) {
      // Survival: endless escalating waves
      this.waveTimer += dt;
      if (enemies === 0 || this.waveTimer > 90) {
        if (enemies === 0 && this.survivalWave > 0 && this.perkWave < this.survivalWave && this.state === 'playing' && w.player?.alive) {
          this.perkWave = this.survivalWave;
          this.awardPerk(`WAVE ${this.survivalWave} SURVIVED`);
          return;
        }
        this.survivalBreak -= dt;
        const nextN = Math.min(14, 2 + Math.floor((this.survivalWave + 1) * 1.4));
        const nextFrom: SpawnFrom = (this.survivalWave + 1) % 3 === 0 ? 'mixed' : (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[(this.survivalWave + 1) % 5];
        this.updateIncoming(Math.max(0, this.survivalBreak), { at: 0, count: nextN, from: nextFrom, skill: 1 });
        if (this.survivalBreak <= 0) {
          this.survivalWave++;
          achievements.onSurvivalWave(this.survivalWave);
          const n = Math.min(14, 2 + Math.floor(this.survivalWave * 1.4));
          const skill = Math.min(1.5, 0.75 + this.survivalWave * 0.06);
          const from: SpawnFrom = this.survivalWave % 3 === 0 ? 'mixed' : (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[this.survivalWave % 5];
          this.spawnWave({ at: 0, count: n, from, skill, rockets: this.survivalWave >= 3 ? 0.3 : 0 });
          this.ui.banner('INCOMING', `Wave ${this.survivalWave}`, 2500);
          this.survivalBreak = 8;
          this.waveTimer = 0;
          if (this.survivalWave > 1) {
            this.score += 150;
            // patch up the guns between waves
            this.gunner.resetAmmo();
            if (w.playerFighter) w.playerFighter.guns.forEach((g) => (g.ammo = Math.min(350, g.ammo + 150)));
          }
        }
      } else if (this.incoming) {
        this.incoming = null; this.incomingOff = null;
      }
    }
    // Flak
    if (m.flak) {
      const inFlak = t >= m.flak.start && t <= m.flak.end;
      w.flakIntensity = inFlak ? m.flak.intensity : 0;
      if (inFlak && t - dt < m.flak.start) w.callout('flak', 'Navigator', 'Flak ahead. Initial point in two minutes — here it comes.', 0, 3);
    }
    if (m.bombsAway && !this.bombsDropped && t >= m.bombsAway) {
      this.bombsDropped = true;
      this.dropBombs();
      w.callout('bombs', 'Bombardier', 'Bombs away! Let\'s get out of here!', 0, 3);
      this.score += 200;
    }
    if (m.escortArrive && !this.escortsSpawned && t >= m.escortArrive) {
      this.escortsSpawned = true;
      for (let i = 0; i < 4; i++) w.spawnEscort(w.formationCenter.clone().add(new THREE.Vector3(R() * 400, 600, -1500 - i * 80)), new THREE.Vector3((i - 1.5) * 200, 300, 0));
      w.callout('escort', 'Radio', 'Little friends at six o\'clock high! The Mustangs are here!', 0, 3);
    }

    // Crew intercom during lulls in the fighting
    this.chatterT += dt;
    if (enemies === 0 && this.chatterT > 32 && t > 12) {
      this.chatterT = Math.random() * 8;
      const gunner: [string, string][] = [
        ['Pilot', 'Pilot to crew, oxygen check. Sound off.'],
        ['Tail', 'Tail gunner, oxygen okay.'],
        ['Navigator', 'Navigator to pilot: on course, two-seven minutes to the IP.'],
        ['Ball Turret', 'Ball turret. Nothing below but cloud. Guns are clear.'],
        ['Radio', 'Radio to pilot: group says keep it tight, fighters reported ahead.'],
        ['Top Turret', 'Engineer to pilot: number three\'s running a little hot. Watching it.'],
        ['Bombardier', 'Bombardier here. Keep your eyes open, they like to come out of the sun.'],
        ['Pilot', 'Stay off the interphone unless you see fighters. Keep scanning.'],
      ];
      const pilot: [string, string][] = [
        ['Lead', 'Blue flight, check your fuel. Weave over the big friends.'],
        ['Big Friend', 'Little friends, little friends, thanks for the company.'],
        ['Lead', 'Keep your heads on a swivel. They\'ll come out of the sun.'],
        ['Blue Three', 'Blue Three, engine temps okay. Holding high cover.'],
      ];
      const lines = m.role === 'gunner' ? gunner : pilot;
      const [who, text] = lines[Math.floor(Math.random() * lines.length)];
      w.callout('chatter', who, text, 25, 1);
    }

    // ---- End conditions ----
    if (this.endResult) return;
    const pl = w.player;
    if (pl && !pl.alive) {
      const cause = w.lastKillCause;
      const why = cause === 'cockpit' ? 'Both pilots were hit and the Sky Queen fell out of control.'
        : cause === 'tail' ? 'The tail was shot away.'
        : cause.startsWith('wing') ? 'A wing was shot off.'
        : cause === 'all engines' ? 'All four engines were knocked out.'
        : 'The Sky Queen was shot down.';
      this.finish(false, m.role === 'gunner' ? `${why} The crew bailed out over enemy territory.` : pl.pos.y < 300 ? 'Your Mustang flew into the ground.' : 'Your Mustang was shot down.', m.role === 'gunner');
      return;
    }
    if (m.role === 'gunner' && w.crewWounded >= 4) {
      this.finish(false, 'You were seriously wounded and could no longer man your gun.');
      return;
    }
    if (m.maxBombersLost !== undefined && w.stats.bombersLost > m.maxBombersLost) {
      this.finish(false, `Too many bombers lost — ${w.stats.bombersLost} Fortresses went down.`);
      return;
    }
    const roundDone = m.round ? this.roundsComplete : false;
    if (roundDone || (!m.round && m.waves.length && this.waveIdx >= m.waves.length && enemies === 0 && t >= Math.min(m.duration, (m.flak?.end ?? 0) + 5))) {
      if (!m.bombsAway || this.bombsDropped) {
        if (!m.escortArrive || this.escortsSpawned) this.finish(true, m.success ?? (m.role === 'gunner' ? 'The formation fought its way through. Good shooting, gunner.' : 'The bombers made it through. Outstanding work, Blue Leader.'));
      }
    }
  }

  private dropBombs() {
    for (const b of this.world.bombers()) {
      if (!b.alive) continue;
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!b.alive) return;
          const m = new THREE.Mesh(this.bombGeo, this.bombMat);
          m.rotation.x = Math.PI / 2;
          const g = new THREE.Group(); g.add(m);
          g.position.copy(b.localToWorld(new THREE.Vector3(R() * 0.3, -1.6, 1.5 - i * 0.4)));
          g.castShadow = true;
          this.engine.scene.add(g);
          this.bombs.push({ obj: g, vel: b.vel.clone(), life: 18 });
        }, i * 260 + Math.random() * 300);
      }
    }
  }

  private clearBombs() {
    for (const b of this.bombs) b.obj.removeFromParent();
    this.bombs = [];
  }

  private updateBombs(dt: number) {
    for (const b of this.bombs) {
      b.life -= dt;
      b.vel.y -= 9.81 * dt;
      b.vel.multiplyScalar(Math.exp(-0.02 * dt));
      b.obj.position.addScaledVector(b.vel, dt);
      // nose tips down as it falls
      b.obj.lookAt(b.obj.position.clone().add(b.vel));
      if (b.life <= 0) b.obj.removeFromParent();
    }
    this.bombs = this.bombs.filter((b) => b.life > 0);
  }

  private finish(success: boolean, reason: string, bailOut = false) {
    if (this.endResult) return;
    this.endResult = { success, reason };
    this.endTimer = success ? 3.5 : bailOut ? BAIL_SEQ_TIME : 5;
    this.state = 'ending';
    if (bailOut) this.startBailOut();
    else this.ui.banner(success ? 'ALL GUNS SECURE' : 'MISSION FAILED', success ? 'Mission complete' : 'Shot down', 3500);
  }

  // Gunner's B-17 shot down: the crew bails out before the debrief. Driven from the ending
  // state, so it freezes with the game; chutes are spawned from the live bomber each time,
  // so floating-origin rebases stay correct.
  private startBailOut() {
    this.bailT = 0;
    this.bailBell = 0;
    this.bailCue = 0;
    this.ui.banner('BAIL OUT! BAIL OUT!', 'Crew, abandon the aircraft', 3000);
    sound.alarmBell(BAIL_STRIKES, BAIL_GAP);
  }

  private updateBailOut(dt: number) {
    this.bailT += dt;
    // each alarm strike jolts the camera and flashes red
    if (this.bailBell < BAIL_STRIKES && this.bailT >= this.bailBell * BAIL_GAP) {
      this.bailBell++;
      this.trauma = Math.min(1, this.trauma + 0.45);
      this.damageT = Math.max(this.damageT, 0.6);
    }
    while (this.bailCue < BAIL_CHUTES.length && this.bailT >= BAIL_CHUTES[this.bailCue]) {
      this.bailCue++;
      this.releaseCrewChute();
    }
  }

  private releaseCrewChute() {
    const b = this.world.player;
    if (!b || b.remove) return;
    // crew leave through the waist, bomb bay and tail hatches: scattered along the fuselage
    const exit = new THREE.Vector3(R() * 3.5, -1.2 + Math.random() * 0.8, -5 + Math.random() * 7);
    this.world.effects.parachute(b.localToWorld(exit), b.vel.clone().multiplyScalar(0.5));
  }

  private showDebrief() {
    const m = this.mission!;
    const w = this.world;
    const r = this.endResult!;
    this.state = 'debrief';
    this.input.unlock();
    sound.stopSpeech();
    sound.music.stinger(r.success);
    sound.setMode('menu');
    const acc = w.stats.shots > 0 ? w.stats.hits / w.stats.shots : 0;
    achievements.endMission(r.success, w.stats.shots, w.stats.hits);
    const survivors = w.bombers().filter((b) => b.alive).length;
    const survival = m.duration === Infinity;
    if (r.success) this.score += 500 + survivors * 50 + Math.round(acc * 300);
    const medals: string[] = [];
    if (r.success && !survival) medals.push('Air Medal');
    if (w.stats.kills >= 5) medals.push(m.role === 'pilot' ? 'Ace in a Day' : 'Distinguished Flying Cross');
    if (w.stats.kills >= 8 && w.stats.bombersLost <= 1) medals.push('Silver Star');
    if (w.crewWounded > 0) medals.push('Purple Heart');
    if (survival) {
      this.progress.survival.push({ name: 'You', score: this.score, waves: m.round ? this.roundIdx + (r.success ? 1 : 0) : Math.max(0, this.survivalWave - (r.success ? 0 : 1)), role: m.role, date: new Date().toLocaleDateString() });
      this.progress.survival.sort((a, b) => b.score - a.score);
      this.progress.survival = this.progress.survival.slice(0, 20);
    } else {
      const idx = CAMPAIGN.findIndex((c) => c.id === m.id);
      if (r.success && idx >= 0) this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(CAMPAIGN.length - 1, idx + 1));
      const prev = new Set(this.progress.medals[m.id] ?? []);
      medals.forEach((x) => prev.add(x));
      this.progress.medals[m.id] = [...prev];
      this.progress.best[m.id] = Math.max(this.progress.best[m.id] ?? 0, this.score);
    }
    save(PROGRESS_KEY, this.progress);
    // merit for the Armory: the mission score (half if it failed)
    const merit = Math.round((this.score - this.scoreBanked) * (r.success ? 1 : 0.5) * this.loadout.scoreMult);
    this.prog.earn(merit);
    const idx = CAMPAIGN.findIndex((c) => c.id === m.id);
    const d: DebriefData = {
      success: r.success, title: m.title, reason: r.reason, kills: w.stats.kills, accuracy: acc,
      bombersLost: w.stats.bombersLost, bombersTotal: m.bombers, time: w.time, score: this.score, medals,
      survival, waves: m.round ? this.roundIdx + (r.success ? 1 : 0) : Math.max(0, this.survivalWave - 1), nextAvailable: r.success && idx >= 0 && idx < CAMPAIGN.length - 1,
      rounds: w.stats.shots, hits: w.stats.hits, bestStreak: this.tally.bestStreak,
      closestKill: this.tally.closestKill === Infinity ? null : this.tally.closestKill,
      killsByGun: m.role === 'gunner' ? this.tally.killsByGun() : undefined,
      merit, points: this.prog.points,
    };
    const h = {
      next: () => this.showBriefing(CAMPAIGN[idx + 1]),
      retry: () => this.showBriefing(m),
      menu: () => this.startMenu(),
      armory: () => this.ui.armory(this.prog, () => this.ui.debrief({ ...d, merit: undefined, points: this.prog.points }, h)),
    };
    this.ui.debrief(d, h);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.photo.exit();   // restore the camera before the pause menu takes over
    this.state = 'paused';
    this.engine.paused = true;
    this.input.unlock();
    sound.ctx?.suspend();
    this.ui.pause({
      resume: () => this.resume(),
      restart: () => { this.resume(); this.startMission(this.mission!); },
      settings: () => this.ui.settings(this.settings, (s) => { this.settings = s; this.applySettings(); }, () => {}),
      quit: () => { this.ui.hidePause(); this.engine.paused = false; sound.ctx?.resume(); sound.stopSpeech(); this.startMenu(); },
    }, this.mission?.role ?? 'gunner', this.pauseInfo());
  }

  // Snapshot of the mission state for the pause screen (same figures as the debrief)
  private pauseInfo(): PauseInfo | undefined {
    const m = this.mission;
    if (!m) return undefined;
    const w = this.world;
    const acc = w.stats.shots > 0 ? w.stats.hits / w.stats.shots : 0;
    return {
      objectives: m.objectives,
      kills: w.stats.kills,
      accuracy: acc,
      bombersAlive: w.bombers().filter((b) => b.alive).length,
      bombersTotal: m.bombers,
    };
  }

  resume() {
    this.ui.hidePause();
    this.state = 'playing';
    this.engine.paused = false;
    sound.ctx?.resume();
    this.input.lock();
  }

  // ---------------- Frame ----------------
  private frame(dt: number) {
    const w = this.world;
    const playing = !this.menuMode && (this.state === 'playing' || this.state === 'ending');
    this.input.active = playing;
    const canvas = this.engine.renderer.domElement;
    const cur = playing ? 'crosshair' : 'default';
    if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
    this.berserkT = Math.max(0, this.berserkT - dt);
    this.gunner.rateBoost = this.berserkT > 0 ? 1.4 : 1;
    // Brief slow-motion beat on a confirmed kill
    if (this.slowmo > 0) {
      this.slowmo -= dt / Math.max(0.05, this.engine.timeScale);
      this.engine.timeScale = this.slowmo > 0 ? 0.35 : 1;
    }
    // Photo mode: the mission is frozen (engine.paused) and only the free camera moves
    if (this.photo.active) {
      this.photo.update();
      sound.setListener(this.engine.camera);
      this.ui.redVignette(0);
      this.ui.ctx.clearRect(0, 0, innerWidth, innerHeight);
      this.input.endFrame();
      return;
    }
    if (this.state === 'paused') { this.drawOverlay(); this.input.endFrame(); return; }
    w.update(dt);
    this.updateBombs(dt);
    if (this.menuMode) {
      this.menuCamera(dt);
    } else if (this.state === 'playing' || this.state === 'ending' || this.state === 'debrief') {
      if (this.state !== 'debrief') this.direct(dt);
      if (this.mission?.role === 'gunner') this.gunner.update(dt);
      else this.pilot.update(dt);
      if (this.state === 'ending') {
        this.endTimer -= dt;
        if (this.bailT >= 0) this.updateBailOut(dt);
        if (this.endTimer <= 0) this.showDebrief();
      }
    }
    // trauma-based camera shake (explosions, flak, hits), applied after the controllers
    if (this.trauma > 0 && !this.menuMode) {
      const k = this.trauma * this.trauma;
      const cam = this.engine.camera;
      const tt = w.time * 40;
      // smooth (no per-frame random jitter): max ~0.3 deg, gone within ~0.4 s
      cam.rotateX(Math.sin(tt * 1.3) * 0.006 * k);
      cam.rotateY(Math.sin(tt * 1.7 + 1) * 0.006 * k);
      cam.rotateZ(Math.sin(tt * 0.9 + 2) * 0.004 * k);
      this.trauma = Math.max(0, this.trauma - dt * 2.6);
    }
    this.autoQuality(dt);
    this.floatingOrigin();
    sound.setListener(this.engine.camera);
    this.distantBattle.update(dt, this.engine.camera, this.state === 'playing' && !this.menuMode);
    sound.updateWind(dt);
    w.listener = this.engine.camera.position;
    sound.updateFighterVoices(w.fighterSoundInfo());
    // damaged B-17 engines change the interior drone (Sound.setEngineHealth caches repeats)
    if (this.mission?.role === 'gunner' && w.playerBomber) sound.setEngineHealth(4 - w.playerBomber.enginesOut);
    // screen effects
    this.damageT = Math.max(0, this.damageT - dt * 1.8);
    this.engine.post.damageFlash = this.damageT * 0.18;
    // wounded gunner (crewWounded 0..4): the picture drains of colour, easing in and out slowly
    const woundTarget = this.menuMode ? 0 : Math.min(1, w.crewWounded / 4);
    this.woundT += (woundTarget - this.woundT) * (1 - Math.exp(-dt * 0.6));
    this.engine.post.desat = this.woundT < 0.002 ? 0 : this.woundT;
    this.cracks.update(dt);
    this.ui.redVignette(Math.min(0.35, this.damageT * 0.45 + (this.mission?.role === 'gunner' && !this.menuMode ? w.crewWounded * 0.05 : 0)));
    if (this.mission?.role === 'pilot' && !this.menuMode) { /* pilot sets exposure/vignette */ }
    else { this.engine.post.vignette = 0.9; this.engine.post.exposure = 1; }
    this.hitMarkerT -= dt;
    this.killMarkerT -= dt;
    if (!this.menuMode) this.combo.update(dt);
    for (const p of this.popups) { p.life -= dt; p.pos.addScaledVector(this.world.formationForward, 75 * dt); }
    this.popups = this.popups.filter((p) => p.life > 0);
    this.hudAcc += dt;
    if (!this.menuMode && this.hudAcc > 0.08 && (this.state === 'playing' || this.state === 'ending')) { this.hudAcc = 0; this.updateHud(); }
    this.drawOverlay();
    this.input.endFrame();
    // fade during station crawl
    if (!this.menuMode && this.mission?.role === 'gunner') {
      const tr = this.gunner.transition;
      if (tr > 0) this.ui.fadeTo(Math.min(1, Math.sin((1 - tr / 0.9) * Math.PI) * 1.4));
    }
  }

  // Step graphics quality down (this session only, never saved) if the machine really
  // can't keep up: sustained <28 fps for 10 s of visible gameplay.
  private autoQuality(dt: number) {
    if (this.autoQualityDone || dt <= 0 || this.state !== 'playing' || document.hidden) return;
    // dynamic resolution handles most of it; drop the quality tier only when that is not enough
    if (this.engine.fps < 40 && this.engine.renderScale <= 0.56) this.slowFrames += dt; else this.slowFrames = Math.max(0, this.slowFrames - dt);
    if (this.slowFrames > 10 && this.engine.quality !== 'low') {
      const q = this.engine.quality === 'high' ? 'medium' : 'low';
      this.engine.setQuality(q);
      this.slowFrames = 0;
      this.autoQualityDone = true;
      this.ui.tip(`Graphics set to <kbd>${q}</kbd> to keep the frame rate up (change in Settings)`, 4500);
    }
  }

  private floatingOrigin() {
    const cam = this.engine.camera;
    const d = Math.hypot(cam.position.x, cam.position.z);
    if (d > 4000) {
      const off = new THREE.Vector3(cam.position.x, 0, cam.position.z);
      this.engine.rebase(off);
      this.world.rebase(off);
      for (const p of this.popups) p.pos.sub(off);
      cam.position.sub(off);
      this.engine.post.resetHistory();
    }
  }

  private updateHud() {
    const m = this.mission!;
    const w = this.world;
    const alive = w.bombers().filter((b) => b.alive).length;
    const enemies = w.activeEnemies().length;
    let objective = m.objectives[0];
    if (m.round) {
      const r = roundDef(m, this.roundIdx);
      const left = Math.max(0, Math.ceil(r.duration - (w.time - this.roundT0)));
      const rn = Number.isFinite(m.rounds ?? 1) ? `Round ${this.roundIdx + 1}/${m.rounds}` : `Round ${this.roundIdx + 1}`;
      objective = left > 0 ? `${rn} — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${enemies} fighters` : `${rn} — clear the last ${enemies} fighter${enemies === 1 ? '' : 's'}`;
    }
    else if (m.duration === Infinity) objective = this.survivalWave ? `Wave ${this.survivalWave} — ${enemies} fighters remaining` : 'Stand by — enemy fighters approaching';
    else if (m.flak && w.time >= m.flak.start && w.time <= m.flak.end) objective = 'Hold steady through the flak';
    else if (m.escortArrive && !this.escortsSpawned) objective = `Hold out — escort ETA ${Math.max(0, Math.ceil(m.escortArrive - w.time))}s`;
    else if (enemies > 0) objective = `${enemies} enemy fighter${enemies > 1 ? 's' : ''} attacking`;
    else if (this.waveIdx < m.waves.length) objective = 'Scan the sky — more fighters expected';
    const mm = Math.floor(w.time / 60), ss = Math.floor(w.time % 60);
    this.ui.updateCommon({
      mission: `${m.title.toUpperCase()} · ${mm}:${String(ss).padStart(2, '0')}`,
      objective, kills: w.stats.kills, score: this.score, formation: `${alive}/${m.bombers} B-17s`,
    });
    this.ui.updateCombo(this.combo.mult, this.combo.fraction);
    if (m.role === 'gunner') {
      const s = this.gunner.state;
      const zones: Record<string, number> = {};
      for (const z of w.playerBomber!.zones) zones[z.name] = Math.max(0, z.hp) / z.maxHp;
      const crew = w.crewWounded ? `Gunner wounded (${w.crewWounded}/4)` : '';
      // seat finder: which gun positions have fighters in their field of fire
      this.gunner.threatsByStation(this.threats);
      let best: StationId | null = null, bn = 0;
      for (const id of STATION_ORDER) { const n = this.threats[id] ?? 0; if (n > bn) { bn = n; best = id; } }
      const here = this.threats[this.gunner.station] ?? 0;
      this.idleSeatT = here === 0 && bn > 0 ? this.idleSeatT + 0.08 : 0;
      if (best && this.idleSeatT > 2.5 && w.time - this.lastSeatTip > 7) {
        this.lastSeatTip = w.time;
        this.ui.tip(`${bn} fighter${bn > 1 ? 's' : ''} in the ${STATIONS[best].label.toUpperCase()} arc — press <kbd>${STATIONS[best].key}</kbd>`, 2600);
      }
      this.ui.updateGunnerHud({ station: this.gunner.station, threats: this.threats, best, ammo: s.ammo, heat: s.heat, overheated: s.overheated, reloading: s.reload, zones, crew, wounded: w.crew.wounded });
    } else if (w.playerFighter) {
      const f = w.playerFighter;
      const zones: Record<string, number> = {};
      for (const z of f.zones) zones[z.name] = Math.max(0, z.hp) / z.maxHp;
      this.ui.updatePilotHud({
        speed: f.fm.speed, alt: f.pos.y, thr: f.fm.throttle, g: f.fm.gLoad, ammo: f.guns.reduce((a, g) => a + g.ammo, 0),
        mode: (this.pilot.mode === 'mouseAim' ? 'MOUSE AIM' : 'DIRECT') + ' · ' + (this.pilot.view === 'cockpit' ? 'COCKPIT' : 'CHASE') + (f.fm.stalled ? ' · STALL' : ''), zones,
      });
    }
  }

  private drawLeadPip(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const w = this.world, cam = this.engine.camera;
    const pilot = this.mission?.role === 'pilot';
    const shooter = pilot ? w.playerFighter! : w.playerBomber!;
    const origin = pilot ? shooter.pos : cam.position;
    const aim = pilot ? shooter.forward(new THREE.Vector3()) : this.gunner.aimDirection();
    const muzzle = pilot ? 880 : 870;
    let best: Fighter | null = null, bestAng = THREE.MathUtils.degToRad(pilot ? 18 : 25);
    for (const f of w.fighters('axis')) {
      if (!f.alive) continue;
      const to = f.pos.clone().sub(origin);
      const d = to.length();
      if (d > 1300) continue;
      const ang = to.normalize().angleTo(aim);
      if (ang < bestAng) { bestAng = ang; best = f; }
    }
    if (!best) return;
    const rel = best.vel.clone().sub(shooter.vel);
    let t = best.pos.distanceTo(origin) / muzzle;
    const p = new THREE.Vector3();
    for (let i = 0; i < 3; i++) { p.copy(best.pos).addScaledVector(rel, t); t = p.distanceTo(origin) / muzzle; }
    p.y += 0.5 * 9.81 * t * t;
    const sp = p.clone().project(cam), tp = best.pos.clone().project(cam);
    if (sp.z > 1 || Math.abs(sp.x) > 1.1 || Math.abs(sp.y) > 1.1) return;
    const x = (sp.x * 0.5 + 0.5) * W, y = (-sp.y * 0.5 + 0.5) * H;
    const tx = (tp.x * 0.5 + 0.5) * W, ty = (-tp.y * 0.5 + 0.5) * H;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,90,0.55)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,200,90,0.95)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  // 2D overlay: target markers, gunsight, hit markers
  private drawOverlay() {
    const ctx = this.ui.ctx;
    const W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    if (this.menuMode || !(this.state === 'playing' || this.state === 'ending' || this.state === 'paused')) return;
    const cam = this.engine.camera;
    const w = this.world;
    const pl = w.player;
    if (this.settings.markers && pl) {
      for (const a of w.aircraft) {
        if (a === pl || !a.alive) continue;
        const enemy = a.team === 'axis';
        const d = a.pos.distanceTo(cam.position);
        if (d > (enemy ? 2800 : 1800)) continue;
        const p = a.pos.clone().project(cam);
        const col = enemy ? 'rgba(255,70,45,0.95)' : 'rgba(110,190,255,0.85)';
        if (!enemy) {
          // Friendlies: a small blue chevron above the aircraft, no brackets, so they never read as targets
          if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
            const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
            const up = THREE.MathUtils.clamp((a instanceof Fighter ? 1400 : 3200) / d, 10, 46);
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(x - 6, y - up - 8); ctx.lineTo(x + 6, y - up - 8); ctx.lineTo(x, y - up); ctx.closePath(); ctx.fill();
            if (d < 900) {
              ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
              ctx.fillText(a instanceof Fighter ? 'P-51' : 'B-17', x, y - up - 12);
            }
          }
          continue;
        }
        if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
          const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
          const s = THREE.MathUtils.clamp(3200 / d, 9, 34);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath();
          const c = s * 0.45;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(x + sx * s, y + sy * s - sy * c); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s - sx * c, y + sy * s);
          }
          ctx.stroke();
          ctx.fillStyle = col; ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
          ctx.fillText(d < 1600 ? `${a.label.toUpperCase()}  ${Math.round(d)}m` : a.label.toUpperCase(), x, y + s + 13);
        } else if (enemy && d < 1500) {
          // edge arrow toward off-screen attacker
          let ex = p.x, ey = p.y;
          if (p.z > 1) { ex = -ex; ey = -ey; }
          const ang = Math.atan2(-ey, ex);
          const r = Math.min(W, H) * 0.42;
          const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
    // Health bars on enemies the player has been hitting
    for (const f of w.fighters('axis')) {
      if (!f.alive || w.time - f.lastPlayerHit > 6) continue;
      const p = f.pos.clone().project(cam);
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const d = f.pos.distanceTo(cam.position);
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      const s = THREE.MathUtils.clamp(2400 / d, 9, 30);
      const bw = 46, frac = f.structureFrac;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - bw / 2 - 1, y - s - 13, bw + 2, 6);
      ctx.fillStyle = frac > 0.5 ? 'rgba(230,200,90,0.95)' : frac > 0.25 ? 'rgba(240,140,50,0.95)' : 'rgba(235,70,50,0.95)';
      ctx.fillRect(x - bw / 2, y - s - 12, bw * frac, 4);
    }
    // Score pop-ups
    for (const pop of this.popups) {
      const p = pop.pos.clone().project(cam);
      if (p.z > 1) continue;
      const a = Math.min(1, pop.life / 0.6);
      ctx.fillStyle = `rgba(255,214,120,${a})`;
      ctx.font = '600 20px Oswald, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(pop.text, (p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H - (1.6 - pop.life) * 40);
    }
    // Radar plot (bottom-left; Tab expands it into the big map)
    this.mapT += ((this.mapOpen ? 1 : 0) - this.mapT) * Math.min(1, (1 / 60) * 9);
    if (this.mission) Radar.draw(ctx, W, H, w, this.mapT, this.incoming, w.time);
    // Lead indicator aim aid: pip for the enemy nearest the line of fire ('recruit' = only on Recruit difficulty)
    const leadMode = this.settings.leadPip ?? 'recruit';
    if (pl?.alive && (this.loadout.leadPip || leadMode === 'always' || (leadMode === 'recruit' && this.settings.difficulty === 'recruit'))) this.drawLeadPip(ctx, W, H);
    // Gunner hip reticle: waist guns without the ring sight up (fades as RMB brings the eye down)
    if (this.mission?.role === 'gunner' && this.gunner.def.type === 'waist' && this.gunner.ads < 0.6) {
      const a = 0.85 * (1 - this.gunner.ads / 0.6);
      const r = Math.min(W, H) * 0.05;
      ctx.save();
      ctx.strokeStyle = `rgba(255,236,190,${a})`; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath(); ctx.moveTo(W / 2 + dx * r * 0.45, H / 2 + dy * r * 0.45); ctx.lineTo(W / 2 + dx * r * 0.85, H / 2 + dy * r * 0.85); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Pilot gunsight
    if (this.mission?.role === 'pilot' && w.playerFighter?.alive) {
      const g = this.pilot.gunsight;
      if (g.aimVisible) {
        const x = (g.aimX * 0.5 + 0.5) * W, y = (-g.aimY * 0.5 + 0.5) * H;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      }
      if (g.visible) {
        const x = (g.x * 0.5 + 0.5) * W, y = (-g.y * 0.5 + 0.5) * H;
        const r = Math.min(W, H) * 0.075;
        ctx.save();
        ctx.shadowColor = 'rgba(255,150,40,0.9)'; ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,170,70,0.95)'; ctx.strokeStyle = 'rgba(255,170,70,0.95)';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
          ctx.beginPath(); ctx.moveTo(x + dx, y + dy - 4); ctx.lineTo(x + dx + 3, y + dy); ctx.lineTo(x + dx, y + dy + 4); ctx.lineTo(x + dx - 3, y + dy); ctx.closePath(); ctx.fill();
        }
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(W / 2, H / 2 - 0, 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // Hit / kill markers at the aim point
    let hx = W / 2, hy = H / 2;
    if (this.mission?.role === 'pilot') { const g = this.pilot.gunsight; hx = (g.x * 0.5 + 0.5) * W; hy = (-g.y * 0.5 + 0.5) * H; }
    if (this.hitMarkerT > 0 || this.killMarkerT > 0) {
      const kill = this.killMarkerT > 0;
      ctx.strokeStyle = kill ? 'rgba(255,90,60,0.95)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = kill ? 2.5 : 1.8;
      const a = kill ? 16 : 10, b = kill ? 6 : 4;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(hx + sx * b, hy + sy * b); ctx.lineTo(hx + sx * a, hy + sy * a); }
      ctx.stroke();
    }
    // Cracked glass sits in front of everything else on the gunner's view
    this.cracks.draw(ctx, W, H);
  }
}

export { Aircraft, Bomber, STATIONS };
