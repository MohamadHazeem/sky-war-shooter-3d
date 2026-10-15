import { FormationReturn } from './FormationReturn';
import { setHudDetail } from '../ui/HudDetail';
import { SimpleMenu } from './SimpleMenu';
import { Atmos } from '../render/Atmosphere';
import { weatherNow } from '../render/WeatherState';
import type { WeatherPreset } from '../render/WeatherPresets';
import { AADefence } from './AADefence';
import { BombRun } from './BombRun';
import { Bombardier } from './Bombardier';
import * as THREE from 'three';
import { B17DamageCrew } from './B17DamageCrew';
import { Engine, lowerQuality } from '../core/Engine';
import { Input } from '../core/Input';
import { UI, Settings, Progress, PauseInfo } from '../ui/UI';
import { World, ALTITUDE } from '../world/World';
import { Aircraft, Bomber } from '../world/Aircraft';
import { GunnerController } from './GunnerController';
import { PilotController } from './PilotController';
import { PilotOps } from './PilotOps';
import { PhotoMode } from './PhotoMode';
import { Mission } from './Missions';
import { STATIONS } from '../world/B17Layout';
import { sound } from '../audio/Sound';
import { DistantBattle } from '../audio/DistantBattle';
import { computeThreat, finalStretch } from '../audio/Threat';
import { applyWeather, presetWeather, stormStrike, weatherEvents, DEFAULT_WEATHER, Weather } from '../render/Weather';
import { Progression } from './Upgrades';
import { mountCloudSave } from '../ui/CloudSavePanel';
import { Adaptive } from './Adaptive';
import { GlassCracks } from '../ui/Cracks';
import { Combo } from './Combo';
import { CombatTally } from './CombatTally';
import { GameFeel } from './GameFeel';
import { CombatFeedback } from '../ui/CombatFeedback';
import { Onboarding } from './Onboarding';
import { Abilities } from './Abilities';
import { MidRound } from './MidRound';
import { BossBattle } from './BossBattle';
import { access } from '../core/Accessibility';
import { TargetArea } from '../world/TargetArea';
import { Cinematics } from './Cinematics';
import { Ditching } from './Ditching';
import { Bookends } from './Bookends';
import { ServiceRecord } from './ServiceRecord';
import { SkillRuntime } from './SkillRuntime';
import { Pacing } from './Pacing';
import { ModeRunner } from './Modes';
import { SpecialEvents } from './SpecialEvents';
import { mountShare, shareStamp } from './Share';
import { mountStatsToggle } from '../net/Analytics';
import { showCampaignMap, prepareCampaignMission, isSideRaid } from '../ui/CampaignMap';
import '../ui/CustomBattleScreen'; // registers the Custom Battle and Weekly Challenge modes + their Survival-screen tabs
import { CoopSession } from './CoopSession';
import { qualityFallbackReady } from '../render/FrameTiming';
import { syncSurfaceDetail } from '../render/SurfaceDetail';
import { syncHeroLod } from '../world/HeroLook';
import { Director } from './Director';
import { MissionFlow } from './MissionFlow';
import { GameHud } from './GameHud';
import { MenuScene } from './MenuScene';
import { WorldEvents } from './WorldEvents';
import { TitleExtras } from './TitleExtras';
import { FeatWatch } from './FeatWatch';
import { firstRunGraphics } from './AutoGraphics';

type State = 'menu' | 'briefing' | 'playing' | 'paused' | 'ending' | 'debrief';

const SETTINGS_KEY = 'sws3d.settings.v2';
const PROGRESS_KEY = 'sws3d.progress.v1';

function load<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? { ...def, ...JSON.parse(s) } : def; } catch { return def; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

const R = () => Math.random() * 2 - 1;

// The game hub: owns the world, the controllers and every gameplay system, runs the frame
// loop and the menus, and holds the settings and the shared mission state. The heavy parts
// live in focused modules that get a reference to the Game (see docs/ARCHITECTURE.md):
//   Director     the battle director: waves, groups, rounds, adaptive pacing, end conditions
//   MissionFlow  startMission, endRound / startNextRound, finish, bail-out, showDebrief
//   WorldEvents  world.events handlers: kill scoring, streaks, slow-mo rules, crew radio
//   GameHud      HUD panels and the 2D overlay (markers, radar, lead pip, gunsights)
//   MenuScene    the cinematic camera behind the menus
export class Game {
  state: State = 'menu';
  readonly world: World;
  readonly gunner: GunnerController;
  readonly pilot: PilotController;
  readonly aa: AADefence;
  readonly pilotOps: PilotOps;   // P-51 missions: scripted rounds, bomber-protection score (PilotOps.ts)
  readonly photo: PhotoMode;
  readonly onboarding: Onboarding;
  readonly abilities: Abilities;
  readonly midRound: MidRound;   // mid-round bonus objectives + random events
  readonly boss: BossBattle;
  readonly service: ServiceRecord; // career, medal rewards, daily orders, trophies (ServiceRecord.ts)
  readonly skills: SkillRuntime;   // skill tree effects + title entry (SkillRuntime.ts)
  readonly modes: ModeRunner;   // Ace Hunt / Time Attack rules and scores (Modes.ts)
  readonly pacing: Pacing;      // build -> breather -> final wave inside each round (Pacing.ts)
  readonly specials: SpecialEvents; // special events (ace squadron, Zerstörer wave, rocket barrage) + enemy group tactics
  readonly coop: CoopSession;   // online co-op (beta): host/guest session, see CoopSession.ts
  readonly director: Director;    // waves, groups, rounds and end conditions (Director.ts)
  readonly flow: MissionFlow;     // mission start, rounds, ending, debrief (MissionFlow.ts)
  readonly hud: GameHud;          // HUD panels + 2D overlay (GameHud.ts)
  readonly menuScene: MenuScene;  // menu camera shots (MenuScene.ts)
  readonly worldEvents: WorldEvents; // world.events handlers: kill scoring, radio (WorldEvents.ts)
  readonly extras: TitleExtras;   // What's new bulletin + aircraft recognition gallery (TitleExtras.ts)
  readonly feats: FeatWatch;      // Phase 5 achievements: mission watcher + kill / frame hooks (FeatWatch.ts)
  settings: Settings;
  progress: Progress;
  mission: Mission | null = null;
  readonly prog = new Progression();
  // ---- Mission state shared with the modules above (Director, MissionFlow, WorldEvents, GameHud) ----
  score = 0;
  roundIdx = 0;                // rounds: harder each time, a hangar break between them
  roundT0 = 0;
  killsSincePerk = 0;          // every 5 kills also earns a perk
  endResult: { success: boolean; reason: string } | null = null;
  menuMode = true;
  slowmo = 0;
  trauma = 0;
  damageT = 0;
  berserkT = 0;
  baseDamageScale = 1;
  loadout = this.prog.loadout();
  readonly adaptive = new Adaptive();
  readonly combo = new Combo();
  readonly tally = new CombatTally();
  readonly cracks = new GlassCracks();
  readonly feel: GameFeel;          // kill juice, streak meter / ON FIRE (GameFeel.ts)
  readonly combat: CombatFeedback;  // damage arcs, lining-up warning (CombatFeedback.ts)
  readonly cine: Cinematics;       // kill cam, mission fly-by, best-moment replay (Cinematics.ts)
  readonly ditching: Ditching;
  readonly formationReturn = new FormationReturn(this);
  readonly b17Damage: B17DamageCrew;
  readonly bookends: Bookends;     // take-off / landing scenes at Deenethorpe (Bookends.ts)
  readonly distantBattle = new DistantBattle();
  readonly bombardier: Bombardier;
  readonly bombRun: BombRun;
  readonly target: TargetArea;      // bomb run: target city, bomb stream, impacts (TargetArea.ts)
  // ---- Game-only state ----
  private woundT = 0;   // eased wounded-crew amount for the PostFX desaturation
  private slowFrames = 0;
  private autoQualityDone = false;
  private bombGeo = new THREE.CapsuleGeometry(0.2, 1.1, 4, 8);
  private bombMat = new THREE.MeshStandardMaterial({ color: 0x3c3f33, roughness: 0.6, metalness: 0.4 });

  constructor(readonly engine: Engine, readonly input: Input, readonly ui: UI) {
    this.director = new Director(this);
    this.flow = new MissionFlow(this);
    this.hud = new GameHud(this);
    this.menuScene = new MenuScene(this);
    this.worldEvents = new WorldEvents(this);
    this.world = new World(engine);
    this.target = new TargetArea(engine, this.world);
    this.bombardier = new Bombardier(this);
    this.bombRun = new BombRun(this);
    this.gunner = new GunnerController(engine, this.world, input);
    this.pilot = new PilotController(engine, this.world, input);
    this.pilotOps = new PilotOps(this.world, ui, input, this.pilot); // + Blue Two's orders (keys) and the padlock target
    this.photo = new PhotoMode(engine, input, this.world);
    this.feel = new GameFeel(engine, this.world, ui, this.combo); this.combat = new CombatFeedback(engine, this.world);
    this.cine = new Cinematics(engine, input, ui, this);
    this.bookends = new Bookends(engine, ui, this);
    this.ditching = new Ditching(this);
    this.b17Damage = new B17DamageCrew(this);
    this.abilities = new Abilities(engine, input, ui, this);
    this.boss = new BossBattle(this.world, ui, { score: (n) => { this.score += n; }, slowmo: (s) => { this.slowmo = Math.max(this.slowmo, s); }, perk: (l) => this.awardPerk(l), merit: (n) => this.prog.earn(n) });
    this.settings = load<Settings>(SETTINGS_KEY, { sensitivity: 1, invertY: false, volume: 0.8, musicVolume: 1, sfxVolume: 1, ambVolume: 1, radio: true, music: true, quality: 'high', markers: true, leadPip: 'always', aimAssist: 'high', flightMode: 'mouseAim', difficulty: 'veteran', fov: 65 });
    // settings saved before aim assist existed: switch the lead indicator on with it
    let raw = ''; try { raw = localStorage.getItem(SETTINGS_KEY) ?? ''; } catch { /* */ }
    if (raw && !raw.includes('aimAssist')) { this.settings.aimAssist = 'high'; this.settings.leadPip = 'always'; if (this.settings.fov === 62) this.settings.fov = 65; }
    // wider view by default (enemies were enlarged to match): move old 55/62 defaults to 65
    if (raw && !raw.includes('"fovV"')) { if (this.settings.fov === 55 || this.settings.fov === 62) this.settings.fov = 65; (this.settings as any).fovV = 2; }
    // first launch: a device-class guess now, the menu benchmark picks the preset (AutoGraphics.ts)
    if (!raw.includes('"quality"')) firstRunGraphics(this.settings);
    this.progress = load<Progress>(PROGRESS_KEY, { unlocked: 0, medals: {}, best: {}, survival: [] });
    this.applySettings();
    ui.openSettings = (onBack) => {
      ui.settings(this.settings, (s) => { this.settings = s; this.applySettings(); }, onBack);
      this.mountCloud();
      this.extras.onSettings(() => this.menus.settings(onBack));
    };
    this.worldEvents.wire();
    this.modes = new ModeRunner(this.world, ui, { comboMult: () => this.combo.scoreMult, setScore: (n) => { this.score = n; } });
    this.pacing = new Pacing(this.world, ui, engine, this.modes, { spawn: (wv) => { this.director.incomingOff = null; this.director.spawnWave(wv); }, score: (n) => { this.score += n; }, adaptive: this.adaptive, station: () => (this.mission?.role === 'gunner' ? this.gunner.station : null) });
    this.midRound = new MidRound(this, engine, input, ui);
    this.specials = new SpecialEvents(this, engine, ui);
    this.gunner.onNotice = (t) => this.ui.tip(t, 2200);
    // Esc releases pointer lock -> pause. If the browser never granted the lock the game
    // simply runs in free-cursor mode (no pause loop).
    input.onLockChange = (locked) => {
      if (this.state === 'playing' && !locked && this.input.everLocked && !this.aa?.choosing) this.pause();
      this.ui.showLockHint(false);
    };
    engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked) this.pause();
      if (e.code === 'KeyP' && this.state === 'playing') this.pause();
      if (e.code === 'KeyF' && !e.repeat && this.state === 'playing' && !this.coop.role) this.photo.toggle();
      if (e.code === 'Tab' && !e.repeat && (this.state === 'playing' || this.state === 'ending')) { e.preventDefault(); this.hud.toggleMap(); }
    });
    engine.onFrame = (dt) => this.frame(dt);
    // Browsers only allow audio after a user gesture: start it on the first one
    const unlock = () => { sound.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.onboarding = new Onboarding(this, engine, input, ui, { awardPerk: (l) => this.awardPerk(l), showCampaign: () => this.showCampaign() });
    this.service = new ServiceRecord(this, ui, { showBriefing: (m) => this.showBriefing(m) });
    this.skills = new SkillRuntime(this, ui);
    this.coop = new CoopSession(this, engine, ui);
    this.extras = new TitleExtras(this, engine);
    this.aa = new AADefence(this);
    this.feats = new FeatWatch(this); // after worldEvents.wire / service: chains world.events.kill
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
  readonly weatherNow = weatherNow;
  setWeather(w: Weather | WeatherPreset) {
    if (typeof w === 'string') w = presetWeather(w, this.mission?.weather ?? DEFAULT_WEATHER);
    const key = JSON.stringify(w);
    this.world.contrails.enabled = w.contrails !== false;
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    applyWeather(this.engine, w);
  }

  // Storm rounds: lightning flashes through the cloud, thunder rolls in a moment later
  private lightningT = 8;
  private flashT = 0;
  private storm(dt: number) {
    if (weatherNow.lightning < .5 || this.menuMode || this.state === 'paused') { if (this.flashT > 0) { this.flashT = 0; this.feel.ambientFlash = 0; } return; }
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = 5 + Math.random() * 9;
      this.flashT = 0.22;
      const dist = 800 + Math.random() * 4000;
      weatherEvents.thunder?.(dist);
      if (weatherNow.effects) stormStrike(this.engine);
      if (Math.random() < .15 && access.flash > .5) this.engine.precipitation.strike(this.engine.camera);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      // double-stroke flicker
      const k = Math.max(0, this.flashT) / 0.22;
      this.feel.ambientFlash = (weatherNow.effects ? access.flash : 0) * (k > 0.6 || (k > 0.2 && k < 0.4) ? 0.55 : 0.08) * k;
    } else this.feel.ambientFlash = 0;
  }

  applySettings() {
    const s = this.settings;
    setHudDetail(s.hudDetail);
    sound.setVoiceVolume(s.voiceVolume ?? 1);
    weatherNow.effects = s.weatherEffects !== false;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    sound.setVolume(s.volume);
    sound.setMusicVolume(s.musicVolume);
    sound.setSfxVolume(s.sfxVolume);
    sound.setAmbVolume(s.ambVolume);
    sound.radioEnabled = s.radio;
    sound.setMusic(s.music);
    sound.setDetail(s.audioDetail ?? 'normal');
    sound.setBreathing(s.breathing !== false);
    this.pilot.mode = s.flightMode;
    if (this.loadout) this.applyAssist();
    // Base FOV from Settings (clamped; the views derive their zoom from it each frame)
    const fov = THREE.MathUtils.clamp(Number.isFinite(s.fov) ? s.fov : 62, 50, 80);
    this.gunner.baseFov = fov;
    this.pilot.baseFov = fov;
    this.engine.applyGraphics(s.quality, !!s.fpsCounter);
    this.engine.post.film.setLook(s.filmLook);   // Settings "Film look" (render/FilmLook.ts)
    this.engine.post.lensDirt = s.lensDirt !== false;
    syncSurfaceDetail(this.engine.quality);   // aircraft panel lines / weathering level (render/SurfaceDetail.ts)
    syncHeroLod(this.engine.quality);         // Low: hero aircraft on their far LOD (world/HeroLook.ts)
    save(SETTINGS_KEY, s);
  }

  // ---------------- Menu ----------------
  readonly menus = new SimpleMenu(this);

  startMenu() {
    this.pilotOps.sea.stop();
    this.aa.release();
    this.formationReturn.release();
    this.ditching.release();
    this.bookends.release();   // the parked field behind a debrief gives the world back first
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
    this.menuScene.reset();
    sound.setMode('menu');
    this.coop.onTitle();
    this.service.onTitle();
    this.menus.title();
    this.onboarding.onTitle();
    this.ui.fade(false);
  }

  showCampaign(back = () => this.startMenu()) {
    showCampaignMap(this.progress, (m) => this.showBriefing(m, () => this.showCampaign(back)), back); // campaign map (CampaignMap.ts) replaces ui.campaign
  }

  showBriefing(m: Mission, back = () => (m.number || isSideRaid(m) ? this.showCampaign() : this.startMenu())) {
    this.aa.release();
    this.formationReturn.release();
    this.ditching.release();
    this.bookends.release();
    sound.init();
    this.state = 'briefing';
    prepareCampaignMission(m, this.progress); // campaign state modifiers (CampaignState.ts)
    this.ui.briefing(m, () => this.startMission(m), () => { this.bookends.release(); this.state = 'menu'; back(); });
    this.bookends.prepare(m); // take-off scene: build the base behind the sheet, prewarm its shaders
  }

  // ---------------- Missions (MissionFlow.ts) ----------------
  startMission(m: Mission) { this.flow.startMission(m); }

  finish(success: boolean, reason: string, bailOut = false) { this.flow.finish(success, reason, bailOut); }

  showDebrief() { this.flow.showDebrief(); }

  saveProgress() { save(PROGRESS_KEY, this.progress); }

  // Armory levels + this mission's perks -> guns, ammo, fire, aim aid
  applyLoadout(refill = false) {
    const l = this.loadout = this.prog.loadout();
    this.gunner.applyLoadout(l, refill);
    this.skills?.applyLoadout(l);
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
    this.gunner.assist = this.settings.difficulty === 'ace' ? 0 : Math.min(1.6, a * this.loadout.assist);
    this.pilot.assist = Math.min(1.6, a * this.loadout.assist);
    this.world.ballistics.playerHitScale = this.settings.difficulty === 'ace' && this.mission?.role === 'gunner' ? 1 : (1 + 0.4 * a) * this.loadout.hitScale;
  }

  private mountCloud() {
    const host = document.querySelector<HTMLElement>('#settings .settings-advanced');
    if (host) mountCloudSave(host);
    mountStatsToggle(host);
  }

  // Field upgrade: a random perk, applied on the spot with a short card (no pause)
  awardPerk(label: string) {
    const p = this.prog.award();
    if (p.id === 'repair') {
      const pl = this.world.player;
      if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.35);
    }
    this.applyLoadout();
    this.ui.perkToast(label, p.name, p.desc);
    sound.confirm('kill_confirm');
  }

  dropBombs() { this.target.bombsAway(); }

  clearBombs() { this.bombardier.reset(); this.bombRun.reset(); this.target.clear(); }

  private updateBombs(dt: number) { this.target.update(dt, this.menuMode ? null : this.mission, this.bombRun.enabled); }

  get currentScore() { return this.score; }   // share stamp / analytics

  pause() {
    if (this.state !== 'playing') return;
    if (this.coop.phase === 'mission' && this.coop.partnerSeat !== null || this.coop.flying) { this.ui.tip('Pause is disabled in co-op', 2200); return; }
    this.photo.exit();   // restore the camera before the pause menu takes over
    this.state = 'paused';
    this.engine.paused = true;
    this.input.unlock();
    sound.ctx?.suspend();
    this.ui.pause({
      resume: () => this.resume(),
      restart: () => { this.resume(); if (!this.coop.restart()) this.startMission(this.mission!); },
      settings: () => this.ui.openSettings!(() => {}),
      quit: () => { this.ui.hidePause(); this.engine.paused = false; sound.ctx?.resume(); sound.stopSpeech(); this.startMenu(); },
    }, this.mission?.role ?? 'gunner', this.pauseInfo());
    mountShare(document.querySelector('#pause .box'), this.engine, () => shareStamp(this));
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
    this.engine.precipitation.velocity.copy(w.player?.vel ?? Atmos.wind);
    this.world.effects.setQuality(this.engine.quality);   // Effects 2.0 on above Low (lazy-loads the flipbooks)
    this.pilotOps.sea.setQuality(this.engine.quality === 'low');
    syncSurfaceDetail(this.engine.quality);   // follows auto-quality drops (no-op unless the tier changed)
    const playing = !this.menuMode && (this.state === 'playing' || this.state === 'ending');
    this.input.active = playing;
    this.onboarding.update(dt);
    const canvas = this.engine.renderer.domElement;
    const cur = playing ? 'crosshair' : 'default';
    if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
    this.storm(dt);
    if (this.aa.active) { this.aa.frame(dt); return; }
    this.berserkT = Math.max(0, this.berserkT - dt);
    this.gunner.rateBoost = this.berserkT > 0 ? 1.4 : 1;
    // Brief slow-motion beat on a confirmed kill
    if (this.coop.flying) { this.slowmo = 0; this.engine.timeScale = 1; }
    if (access.prefs.reduceMotion) this.slowmo = 0;   // Reduce motion: no slow-motion beats
    if (this.slowmo > 0) {
      this.slowmo -= dt / Math.max(0.05, this.engine.timeScale);
      this.engine.timeScale = this.slowmo > 0 ? 0.35 : 1;
    }
    this.cine.preFrame(dt);
    this.abilities.update(dt);
    if (this.coop.flying) this.engine.timeScale = 1; // both pilots keep the same real-time flight clock
    this.skills.update(dt);
    // Photo mode: the mission is frozen (engine.paused) and only the free camera moves
    if (this.photo.active) {
      this.photo.update();
      sound.setListener(this.engine.camera);
      this.ui.redVignette(0);
      this.ui.ctx.clearRect(0, 0, innerWidth, innerHeight);
      this.input.endFrame();
      return;
    }
    if (this.formationReturn.frame(dt)) { this.input.endFrame(); return; }
    if (this.ditching.frame(dt)) { this.input.endFrame(); return; }
    if (this.bookends.frame(dt)) { this.input.endFrame(); return; } // take-off / landing scene owns the frame
    if (this.state === 'paused') { this.hud.drawOverlay(); this.input.endFrame(); return; }
    this.bombRun.prepare(dt);
    this.coop.beforeWorld(dt);
    w.update(dt);
    this.coop.update(dt);
    this.bombardier.update(dt);
    this.updateBombs(dt);
    this.bombRun.update();
    if (this.menuMode) {
      this.menuScene.update(dt);
    } else if (this.state === 'playing' || this.state === 'ending' || this.state === 'debrief') {
      if (this.state !== 'debrief') this.director.direct(dt);
      if (this.formationReturn.active || this.ditching.active) { this.input.endFrame(); return; }
      if (this.mission?.role === 'gunner') { this.gunner.bombsAboard = !this.director.bombsDropped; if (!this.bombardier.active) this.gunner.update(dt); }
      else { this.pilot.update(dt); this.coop.afterPilot(); }
      if (this.state === 'ending') this.flow.updateEnding(dt);   // count down to the debrief (bail-out / fly-by)
    }
    if (playing && weatherNow.turbulence > 0) {
      const k = weatherNow.turbulence * .002 * access.shake;
      this.engine.camera.rotateX(Math.sin(w.time * 7.1) * k);
      this.engine.camera.rotateZ(Math.sin(w.time * 5.3) * k);
    }
    // trauma-based camera shake (explosions, flak, hits), applied after the controllers
    if (this.trauma > 0 && !this.menuMode) {
      const k = this.trauma * this.trauma * access.shake;
      const cam = this.engine.camera;
      const tt = w.time * 40;
      // smooth (no per-frame random jitter): max ~0.3 deg, gone within ~0.4 s
      cam.rotateX(Math.sin(tt * 1.3) * 0.006 * k);
      cam.rotateY(Math.sin(tt * 1.7 + 1) * 0.006 * k);
      cam.rotateZ(Math.sin(tt * 0.9 + 2) * 0.004 * k);
      this.trauma = Math.max(0, this.trauma - dt * 2.6);
    }
    this.feel.update(dt, !this.menuMode && (this.state === 'playing' || this.state === 'ending'));
    this.combat.update(dt, !this.menuMode && this.state === 'playing');
    this.cine.update(dt);
    this.bombardier.camera();
    this.bombardier.capture();
    this.autoQuality(dt);
    this.floatingOrigin();
    sound.setListener(this.engine.camera);
    // tracer streaks are rebuilt every frame from the live rounds (camera-facing ribbons)
    w.ballistics.renderTracers(this.engine.camera, Math.max(1, this.engine.renderer.domElement.height));
    this.distantBattle.update(dt, this.engine.camera, this.state === 'playing' && !this.menuMode);
    sound.updateWind(dt);
    w.listener = this.engine.camera.position;
    sound.updateFighterVoices(w.fighterSoundInfo());
    // adaptive score (src/audio/Threat.ts -> Music.setThreat) and airframe strain (wind, creaks)
    sound.music.setContext(this.menuMode ? undefined : this.mission?.id, !this.menuMode && this.boss.active, this.pilotOps.raid.lights.coned.size);
    sound.music.setThreat(computeThreat({ active: this.state === 'playing' && !this.menuMode, enemies: w.activeEnemies(), listener: w.player?.pos ?? this.engine.camera.position, integrity: w.player?.integrity ?? 1, onFire: this.combo.onFire, finalWave: finalStretch(this.mission, this.roundIdx, w.time - this.roundT0, this.director.waveIdx) }));
    sound.setManeuver(this.menuMode ? 0 : w.maneuverLevel);
    this.boss.update(dt);
    this.pacing.frame(dt);
    // damaged B-17 engines change the interior drone (Sound.setEngineHealth caches repeats)
    if (this.mission?.role === 'gunner' && w.playerBomber) sound.setBomberDamage(w.playerBomber.engineDead, w.playerBomber.zones);
    // waist-window wind roar follows the gunner's cabin (Sound.setCabin; no-op outside the bomber)
    sound.setStation(this.mission?.role === 'gunner' && !this.menuMode ? w.playerStationId() : null);   // Spatial2: occlusion + compartment reverb
    sound.setCabin(this.mission?.role === 'gunner' && !this.menuMode ? w.playerBomber?.root ?? null : null);
    // screen effects
    this.damageT = Math.max(0, this.damageT - dt * 1.8);
    this.engine.post.damageFlash = this.damageT * 0.18;
    // wounded gunner (crewWounded 0..4): the picture drains of colour, easing in and out slowly
    const woundTarget = this.menuMode ? 0 : Math.min(1, w.crewWounded / 4);
    this.woundT += (woundTarget - this.woundT) * (1 - Math.exp(-dt * 0.6));
    this.engine.post.hypoxia = !this.menuMode && this.mission?.role === 'gunner' && this.state === 'playing' ? this.gunner.survival.hypoxia : 0;
    this.engine.post.desat = this.woundT < 0.002 ? 0 : this.woundT;
    if (this.bombRun.holding) {
      this.midRound.hud.hideAll(); this.specials.hud.hideAll();
    } else {
      this.midRound.update(dt, this.roundIdx, this.roundT0);
      this.specials.update(dt, this.roundIdx, this.roundT0);
    }
    this.b17Damage.update(dt);
    this.cracks.update(dt);
    this.ui.redVignette(Math.min(0.35, this.damageT * 0.45 + (this.mission?.role === 'gunner' && !this.menuMode ? w.crewWounded * 0.05 : 0)));
    if (this.mission?.role === 'pilot' && !this.menuMode) { /* pilot sets exposure/vignette */ }
    else { this.engine.post.vignette = 0.9; this.engine.post.exposure = 1; }
    this.hud.tickMarkers(dt);
    if (!this.menuMode) this.combo.update(dt);
    this.hud.frame(dt);   // score pop-ups, HUD panels (every 0.08 s), then the 2D overlay
    this.input.endFrame();
    // fade during station crawl
    if (!this.menuMode && this.mission?.role === 'gunner') {
      const tr = this.gunner.transition;
      if (tr > 0) this.ui.fadeTo(Math.min(1, Math.sin((1 - tr / 0.9) * Math.PI) * 1.4));
    }
  }

  // Step graphics quality down (this session only, never saved) if the machine really
  // can't keep up: sustained <40 fps for 10 s of visible gameplay.
  private autoQuality(dt: number) {
    if (this.autoQualityDone || dt <= 0 || this.state !== 'playing' || document.hidden) return;
    // dynamic resolution handles most of it; drop the quality tier only when that is not enough
    if (qualityFallbackReady(this.engine.fps, this.engine.renderScale, this.engine.targetMs)) this.slowFrames += dt; else this.slowFrames = Math.max(0, this.slowFrames - dt);
    if (this.slowFrames > 10 && this.engine.quality !== 'low') {
      const q = lowerQuality(this.engine.quality);
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
      this.hud.rebase(off);
      cam.position.sub(off);
      this.engine.post.resetHistory();
    }
  }
}

export { Aircraft, Bomber, STATIONS };
