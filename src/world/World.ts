import { fitNewEnemyWeapons } from './NewEnemyWeapons';
import { ESCORT_TYPES, type EscortKind } from './EscortTypes';
import { warmDustMotes } from '../game/DustMotes';
import { warmHeroLODs } from './HeroB17';
import { limitPlayerStraggle } from './FormationRules';
import { LivingFormation } from './LivingFormation';
import { FormationDress } from './FormationDress';
import { onContact } from '../game/RadioChatter';
import { warmAAGuns } from '../game/AADefenceScene';
import * as THREE from 'three';
import { DitchingSea } from './DitchingSea';
import { warmTargetSmoke } from '../render/TargetSmoke';
import { Engine } from '../core/Engine';
import { Aircraft, Bomber, Fighter, makeGun } from './Aircraft';
import { hasModel, instantiateCompactBomber, ModelKind } from './Models';
import { disposeOwned } from '../render/Dispose';
import { Ballistics, HitEvent } from './Ballistics';
import { Effects } from './Effects';
import { EnemyPilot, EscortPilot, AttackType, WorldView } from './AI';
import { ENEMY_VARIANTS, EnemyType, tintModel } from './EnemyTypes';
import { AI_EXTRA, dirFromYawPitch, inArc, STATIONS, STATION_ORDER, StationDef } from './B17Layout';
import { sound } from '../audio/Sound';
import { playRicochet } from '../audio/Ricochet';
import { Contrails } from '../render/Contrails';
import { Wrecks } from './Wrecks';
import { attachEngineHaze, updateExhausts } from './Exhaust';
import { heatHaze } from '../render/HeatHaze';
import { WingVapor } from './WingVapor';
import { makeDropTank } from './Props';
import { startBomberDeath, updateBomberDeath, clearBomberDeath } from './BomberDeath';
import { startFighterDeath, updateFighterDeath, clearFighterDeath, rebaseFighterDeath, deathOwned } from './FighterDeath';
import { Destruction } from './destruction/Destruction';
import { hitSounds } from '../audio/HitSounds';
import { setup as setupDamageLook, update as updateDamageLook } from './DamageLook';
import { update as updateDamageStages, stageOf, damageStage, impact as panelImpact, warmDamageStages } from './DamageStages';
import { Crew, STATION_CREW } from './Crew';
import { prewarmBoss } from './BossShip';
import { prewarmSea } from './SeaWorld';
import { warmInteriorDamage } from '../game/InteriorDamage';
import { warmGlassFx } from '../game/GlassFx';
import { bomberName, dressPlayerBomber } from '../game/Customize';
import { aiGunnerSkill, crewRoster } from '../game/CrewRoster';
import { warmTurretViewmodels } from '../game/Viewmodels';
import { warmLivingInterior } from '../game/LivingInterior';
import { warmBailOutCanopy } from '../game/BailOutCanopy';
import { warmInteriorAssets } from '../game/InteriorAssets';
import { PlayerBomberDamage } from './PlayerBomberDamage';
import { dressEnemy } from './EnemyDress';
import { updateWeather, weatherRestart, weatherEvents, frontState, FRONT_EVENT } from '../render/Weather';
import { access } from '../core/Accessibility';

export const ENEMY_SCALE = 6.0;      // Fw 190s are drawn (and hit) larger so they read clearly on screen
// Player gunner wounds (4 = the mission is over; Director.ts) — docs/BALANCE.md
const DRESSING = 85;        // s without a new wound before a crewmate patches one up (was 100)
const DRESSING_BOSS = 65;   // ... during a battle-group fight
const BOSS_WOUND = 0.5;     // wound chance x this during a battle-group fight
export const ENEMY_STRUCTURE = 460; // ~40 hits from a .50 to wear one down
export const ENEMY_ZONE_HP = 2.2;   // vital zones (cockpit, engine, wings) toughened to match
const FORMATION_SPREAD = 1.8;       // spacing between B-17s, so friends never crowd the sight picture

export const CRUISE = 75;          // m/s formation speed (~170 mph)
export const ALTITUDE = 7600;      // m (25,000 ft)

const _v = new THREE.Vector3();
const _damagePos = new THREE.Vector3(), _gunPos = new THREE.Vector3(), _gunAim = new THREE.Vector3();
const GUNNER_COLOR: [number, number, number] = [9, 2.4, 0.8];
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
// Per-bomber phases for the hold-station drift, so a box of B-17s never moves in lockstep
const holdPhase = new WeakMap<Bomber, { surge: number; yaw: number }>();
const stragglerHome = new WeakMap<Bomber, THREE.Vector3>();   // the slot the player's ship straggled from
const R = () => Math.random() * 2 - 1;

export interface WorldEvents {
  radio(speaker: string, text: string, priority?: number): void;
  kill(victim: Aircraft, byPlayer: boolean, cause?: string): void;
  bomberLost(b: Bomber): void;
  playerHit(zone: string, heavy: boolean): void;
  hitMarker(kill: boolean): void;
  playerHitFrom(e: HitEvent): void;   // every hit on the player's aircraft, with shooter / bullet velocity (combat feedback)
  fuselageHit(local: THREE.Vector3, dir: THREE.Vector3): void;
  shake(amount: number): void;
}

interface AIGunner { key: string; def: { pivot: THREE.Vector3; rest: { yaw: number; pitch: number }; yaw: [number, number]; pitch: [number, number] }; station?: StationDef; cooldown: number; burst: number; target: Fighter | null; retarget: number }

interface Rocket { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; fuse: number; age: number; owner: Fighter }

const BOMBER_NAMES = ['Sky Queen', 'Miss Fortune', 'Ole Rattler', 'Hell\'s Angel II', 'Dinah Might', 'Lucky Lady', 'Iron Maiden', 'Sweet Sue', 'Big Stoop', 'Night Owl', 'Wabash Cannonball', 'Patches', 'Belle of Ohio', 'Tondelayo II', 'Blue Streak', 'Short Snorter'];

// The air battle: bomber formation, fighters, guns, damage, flak and effects.
export class World implements WorldView {
  readonly scene: THREE.Scene;
  aircraft: Aircraft[] = [];
  readonly ballistics = new Ballistics(6000);
  readonly effects: Effects;
  readonly contrails = new Contrails(64);
  private wingVapor: WingVapor;
  readonly wrecks: Wrecks;
  playerFocus = 0.7;
  playerAimDir = new THREE.Vector3(1, 0, 0);
  playerIncendiary = 0;       // perk/weapon: chance a player hit sets an enemy engine alight
  playerLucky = 0;            // perk: share of hits on the player that glance off
  playerWingDmg = 1;          // perk: damage multiplier on wings and tails
  playerExplosive = 0;        // perk: chance a player hit explodes for triple damage
  playerSplash = 0;           // cannon shells: extra structure damage per hit
  enemyAimMult = 1;           // perk: >1 spoils the enemy's aim
  crewWoundMult = 1; extinguishChance = 0.75; extinguisherBottles = 1; // skill tree (SkillRuntime.ts)
  // Action flying: the whole box drifts and climbs, and the player's ship jinks under attack
  private formOff = new THREE.Vector3();
  private formRoll = 0;
  private jinkT = 0;
  private jinkDur = 0;
  private jinkSide = 1;
  private nextJink = 12;
  private lurch = 0;
  playerExecute = 1;          // perk: damage multiplier vs fighters below half structure   // perk: player hits can set enemy engines alight
  // Can the player see this enemy (HUD brackets, radar, padlock, lead pip, the autoplay bot)?
  // Always, except at night: RaidDefence (Night Fighter) narrows it to coned / close / firing ones
  spotted: (a: Aircraft) => boolean = () => true;
  formationCenter = new THREE.Vector3(0, ALTITUDE, 0);
  formationForward = new THREE.Vector3(0, 0, 1);
  player: Aircraft | null = null;
  playerBomber: Bomber | null = null;
  playerFighter: Fighter | null = null;
  remoteFighter: Fighter | null = null; // co-op partner: local flight, host damage
  playerStation: StationDef | null = null;
  remoteStations = new Set<string>(); // co-op: gun positions on the player's ship manned by the remote partner (CoopSession); their AI crewmen stand down
  time = 0;
  difficulty = 1;
  aiGunnerFactor = 1; // damage multiplier for AI bomber crews
  playerDamageScale = 0.6; // incoming damage on the player's own aircraft (game balance)
  bombRunHold = false;
  bombRunLevel = false;
  bombRunLift = 0;
  private bombRunSettle = 0;
  flakIntensity = 0;   // bursts per second around the formation
  floorY = 250;        // fighters below this height crash (low-level operations lower it and run their own terrain collision: StrafeOps.ts)
  private flakAcc = 0;
  private gunners = new Map<Bomber, AIGunner[]>();
  private rockets: Rocket[] = [];
  private rocketGeo = new THREE.CylinderGeometry(0.105, 0.105, 1.0, 10).rotateX(Math.PI / 2);
  private tubeGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.3, 10).rotateX(Math.PI / 2);
  private rocketMat = new THREE.MeshStandardMaterial({ color: 0x3a3c33, roughness: 0.6, metalness: 0.4 });
  private extinguishers = new Map<string, number>(); // player engine -> bottles left
  private fireTimers = new Map<string, number>();
  private pilots = new Map<Fighter, EnemyPilot | EscortPilot>();
  private tankProto: THREE.Object3D;
  private radioCooldown = 0;
  private lastCallout = new Map<string, number>();
  events: Partial<WorldEvents> = {};
  stats = { kills: 0, shots: 0, hits: 0, damage: 0, bombersLost: 0, scriptedLost: 0, assists: 0, enemiesSpawned: 0 };
  private warmKeep: THREE.Material[] = [];   // warm-up wreck materials kept alive so their shaders stay compiled
  crewWounded = 0;
  bossFight = false;          // a battle group is up (BossBattle): gentler crew wounds, quicker field dressing
  private lastWound = -99;
  readonly crew = new Crew();   // crew positions and who is wounded (gunner missions)
  private lastCrewWound = -99;
  lastKillCause = '';
  private lastConfirm = 0;
  listener: THREE.Vector3 | null = null; // camera position (set by the game)
  readonly livingFormation = new LivingFormation(this);
  readonly bomberDamage = new PlayerBomberDamage(this); // visible damage on the player's own B-17
  readonly destruction = new Destruction(this);          // enemy aircraft breaking up where they are hit (destruction/)

  constructor(private engine: Engine) {
    this.scene = engine.scene;
    this.effects = new Effects(this.scene);
    this.effects.explosionScale = Math.max(1, ENEMY_SCALE / 3); // blasts sized to the enlarged aircraft
    this.wrecks = new Wrecks(this.scene, this.effects);
    this.wingVapor = new WingVapor(this.effects);
    this.scene.add(this.ballistics.tracers.mesh);
    this.scene.add(this.contrails.mesh);
    this.ballistics.onHit = (e) => this.onHit(e);
    this.ballistics.onNearMiss = (p, cannon) => {
      sound.whizby(p, cannon ? 0.6 : 0.4);
      if (Math.random() < 0.35) sound.play('crack', p, { gain: cannon ? 0.5 : 0.3, delay: false });
    };
    // Yellow 300 L drop tank prototype, cloned per fighter
    this.tankProto = makeDropTank();
    // a weather front's storm (Weather.ts): thunder rolls in after its lightning
    weatherEvents.thunder = (dist) => setTimeout(() => sound.play('explosionFar', null, { gain: 0.9, rate: 0.45 + Math.random() * 0.15, reverb: 0.8 }), (dist / 343) * 1000);
  }

  // Losses that count against the mission's loss limit: set-piece losses (scriptedLoss) are
  // left out, so the formation dramas never make a mission fail. bombersLost (the debrief,
  // career totals) still counts every ship that went down.
  get combatLosses() { return this.stats.bombersLost - this.stats.scriptedLost; }

  // ---------- WorldView ----------
  bombers(): Bomber[] { return this.aircraft.filter((a): a is Bomber => a instanceof Bomber && !a.remove); }
  fighters(team: 'allied' | 'axis'): Fighter[] { return this.aircraft.filter((a): a is Fighter => a instanceof Fighter && a.team === team && !a.remove); }

  // World direction covered by the player's current gun position (gunner missions)
  playerArc(): THREE.Vector3 | null {
    const b = this.playerBomber, st = this.playerStation;
    if (!b || !b.alive || !st || this.player !== b) return null;
    if (st.type === 'turret') return this.playerAimDir.clone().setY(Math.max(-0.4, Math.min(0.5, this.playerAimDir.y))).normalize();
    return dirFromYawPitch(st.rest.yaw, st.rest.pitch).applyQuaternion(b.quat).normalize();
  }

  stationArc(id: string): THREE.Vector3 | null {
    const b = this.playerBomber, st = (STATIONS as any)[id] as StationDef | undefined;
    if (!b || !b.alive || !st || this.player !== b) return null;
    return dirFromYawPitch(st.rest.yaw, st.type === 'turret' ? Math.max(st.rest.pitch, st.id === 'ball' ? -0.5 : 0.25) : st.rest.pitch).applyQuaternion(b.quat).normalize();
  }

  stationGunPos(id: string): THREE.Vector3 | null {
    const b = this.playerBomber, st = (STATIONS as any)[id] as StationDef | undefined;
    if (!b || !b.alive || !st || this.player !== b) return null;
    return b.localToWorld(st.pivot.clone());
  }

  // Living interior (GunnerController): the AI gunner at one of the player's own gun positions
  crewGunner(key: string): Readonly<{ target: Fighter | null; burst: number }> | undefined { const gs = this.playerBomber ? this.gunners.get(this.playerBomber) : undefined; if (gs) for (let i = 0; i < gs.length; i++) if (gs[i].key === key) return gs[i]; return undefined; }

  enemyPilot(f: Fighter): EnemyPilot | undefined { const p = this.pilots.get(f); return p instanceof EnemyPilot ? p : undefined; }

  // gunner missions: send this fighter at a particular gun position on the player's ship
  assignStation(f: Fighter, id: string) {
    const p = this.pilots.get(f);
    if (p instanceof EnemyPilot) p.station = id;
  }

  // Swap a fighter's AI (Abilities: the called-in Mustang sweep flies its own EscortPilot)
  setPilot(f: Fighter, p: EnemyPilot | EscortPilot) { this.pilots.set(f, p); }
  // No AI at all: a set piece (SetPieces.ts) flies this aircraft on a scripted path
  clearPilot(f: Fighter) { this.pilots.delete(f); }

  playerStationId(): string | null { return this.player === this.playerBomber && this.playerStation ? this.playerStation.id : null; }

  playerGunPos(): THREE.Vector3 | null {
    const b = this.playerBomber, st = this.playerStation;
    if (!b || !b.alive || !st || this.player !== b) return null;
    return b.localToWorld(st.pivot.clone());
  }

  // Enemies still pressing the attack (withdrawing/damaged stragglers don't hold up a wave)
  activeEnemies(): Fighter[] {
    return this.fighters('axis').filter((f) => {
      if (!f.alive) return false;
      const p = this.pilots.get(f) as EnemyPilot | undefined;
      return !(p && p.state === 'withdraw') && f.pos.distanceTo(this.formationCenter) < 7000;
    });
  }

  dropTank(f: Fighter) {
    if (!f.dropTankAttached || !f.dropTank) return;
    f.dropTankAttached = false;
    const t = f.dropTank;
    const wp = t.getWorldPosition(new THREE.Vector3());
    const wq = t.getWorldQuaternion(new THREE.Quaternion());
    f.model.remove(t);
    t.position.copy(wp); t.quaternion.copy(wq);
    this.effects.dropTank(t, f.vel);
    this.callout('tanks', 'Navigator', 'They\'re dropping their belly tanks — here they come!', 20);
  }

  // ---------- setup ----------
  reset() {
    this.engine.submission.reset();
    this.livingFormation.reset();
    for (const a of this.aircraft) { this.scene.remove(a.root); disposeOwned(a.root); }
    this.aircraft = [];
    this.gunners.clear();
    this.pilots.clear();
    this.ballistics.clear();
    this.effects.clear();
    this.contrails.clear();
    this.wrecks.clear();
    this.destruction.clear();
    clearBomberDeath();
    clearFighterDeath();
    for (const r of this.rockets) r.obj.removeFromParent();
    this.rockets = [];
    this.extinguishers.clear();
    this.fireTimers.clear();
    this.player = this.playerBomber = this.playerFighter = this.remoteFighter = null;
    this.formationCenter.set(0, ALTITUDE, 0);
    this.formationForward.set(0, 0, 1);
    this.time = 0;
    this.flakIntensity = 0;
    this.bombRunHold = this.bombRunLevel = false; this.bombRunLift = this.bombRunSettle = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, damage: 0, bombersLost: 0, scriptedLost: 0, assists: 0, enemiesSpawned: 0 };
    this.crewWounded = 0;
    this.lastWound = -99;
    this.crew.reset();
    this.lastCrewWound = -99;
    this.lastKillCause = '';
    this.lastCallout.clear();
    this.bomberDamage.reset();
    weatherRestart();   // a restarted mission under the same weather starts its front over
  }

  // Compile every shader variant a kill can need (clipped wreck materials, shadow casters,
  // fire, chutes) before play, so the first kill doesn't freeze the game for half a second.
  // Pieces are put in front of the camera, rendered once (behind the mission fade) and cleared.
  readonly ditchingSea = new DitchingSea();

  prewarm(render: (scene?: THREE.Scene) => void, camera: THREE.Camera) {
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const dummies: Fighter[] = [];
    // every enemy model that loaded: split into its structural parts now, so the first kill of a
    // new type doesn't stall (the pieces reuse the aircraft's own materials: nothing new to compile)
    const models = [...new Set(Object.values(ENEMY_VARIANTS).map((v) => v.model))].filter((m) => hasModel(m as ModelKind));
    const splitDummies = models.map((m) => new Fighter(m as ModelKind, 'axis', ENEMY_VARIANTS.fw190.params));
    // Intact fighters need their unclipped colour/shadow variants as well as the fragments.
    for (const fighter of splitDummies) {
      setupDamageLook(fighter);
      fighter.root.position.copy(camera.position).addScaledVector(fwd, 60);
      this.scene.add(fighter.root); dummies.push(fighter);
    }
    // B-17 break-ups of the formation set pieces (one, two and three clip planes on its materials)
    const b17 = new Bomber();
    b17.root.position.copy(camera.position).addScaledVector(fwd, 45);   // close: inside the shadow frustum, so the clipped shadow-depth programs compile too
    this.scene.add(b17.root);
    const unwarmHero = warmHeroLODs(b17.model);
    const compact = instantiateCompactBomber();
    if (compact) { compact.position.copy(b17.pos); compact.userData.formationBatch = true; this.scene.add(compact); }
    // Every escort skin/prop variant, including gunner missions with no starting escort
    for (const kind of ['p51d', 'p47d', 'spitfire9'] as const) {
      const spec = ESCORT_TYPES[kind];
      const escort = new Fighter(kind, 'allied', spec.params, spec.propRadius);
      escort.root.position.copy(camera.position).addScaledVector(fwd, 35);
      this.scene.add(escort.root); dummies.push(escort);
    }
    const at = camera.position.clone().addScaledVector(fwd, 80);
    this.effects.explosion(at, new THREE.Vector3(), 1);
    this.effects.parachute(at, new THREE.Vector3());
    // The real instanced bomb stream, including its instancing program, before release.
    const bombs = this.scene.getObjectByName('target_bombs') as THREE.InstancedMesh | undefined;
    const bombCount = bombs?.count ?? 0;
    if (bombs) { bombs.count = 1; bombs.setMatrixAt(0, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)); bombs.instanceMatrix.needsUpdate = true; }
    // Untextured, non-instanced fragments from the flak-damaged neighbour cast shadows too.
    const plainCaster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ side: THREE.BackSide }));
    plainCaster.position.copy(at); plainCaster.castShadow = true; plainCaster.frustumCulled = false;
    plainCaster.userData.formationBatch = true; this.scene.add(plainCaster);
    // Torn/debris sheets use the double-sided depth program even without a map.
    const bothCaster = new THREE.Mesh(plainCaster.geometry, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    bothCaster.position.copy(at); bothCaster.castShadow = true; bothCaster.frustumCulled = false;
    bothCaster.userData.formationBatch = true; this.scene.add(bothCaster);
    const depthMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); depthMap.needsUpdate = true;
    const mappedCaster = new THREE.Mesh(plainCaster.geometry, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: depthMap }));
    mappedCaster.position.copy(at); mappedCaster.castShadow = true; mappedCaster.frustumCulled = false;
    mappedCaster.userData.formationBatch = true; this.scene.add(mappedCaster);
    const tintedCaster = new THREE.Mesh(plainCaster.geometry, new THREE.MeshStandardMaterial());
    tintedCaster.position.copy(at); tintedCaster.castShadow = true; tintedCaster.frustumCulled = false;
    tintedCaster.userData.formationBatch = true; tintedCaster.userData.batchTint = new THREE.Color(); this.scene.add(tintedCaster);
    const unwarmSea = prewarmSea(this.scene, at);
    const unwarmBoss = prewarmBoss(this.scene, camera.position, fwd);
    const unwarmFormation = FormationDress.warm(this.scene, at);
    const unwarm = this.bomberDamage.warmup(this.scene, at);
    const unwarmDust = warmDustMotes(this.scene, at);
    const effectObjects = this.effects.warmupObjects();
    for (const o of effectObjects) { o.position.copy(at); o.frustumCulled = false; this.scene.add(o); }
    const unwarmCanopy = warmBailOutCanopy(this.scene, at);
    const unwarmCrew = warmLivingInterior(this.scene, at); // gunner interior: crew, brass, shafts, frost, breath
    const unwarmInterior2 = warmInteriorAssets(this.scene, at); // interior 2.0 kit + skinned crew, when loaded
    const unwarmTurrets = warmTurretViewmodels(this.scene, at);
    const unwarmAA = warmAAGuns(this.scene, at);
    const unwarmInteriorDamage = warmInteriorDamage(this.scene, at);
    const unwarmDamage = warmDamageStages(this.scene, at);
    const unwarmDestruction = this.destruction.warm(this.scene, at, [...dummies, b17].map((f) => ({ kind: f.kind, model: f.model })));
    const unwarmGlass = warmGlassFx(this.scene, at);       // canopy / turret glass overlay
    const unwarmTargetSmoke = warmTargetSmoke(this.scene);
    const unwarmStream = this.engine.bomberStream.warm();   // the stream's near-LOD programs
    this.engine.precipitation.warm(render);
    this.engine.clouds.warmProbe(this.engine.renderer);   // in-cloud probe (glass condensation, sun dimming)
    this.ditchingSea.warm(render, this.playerBomber?.root ?? b17.root);
    this.engine.renderer.shadowMap.needsUpdate = true;
    this.engine.warmRenderer();
    render();
    unwarmTargetSmoke();
    unwarmStream();
    if (bombs) bombs.count = bombCount;
    this.scene.remove(plainCaster, bothCaster, mappedCaster, tintedCaster); plainCaster.geometry.dispose(); this.warmKeep.push(plainCaster.material, bothCaster.material, mappedCaster.material, tintedCaster.material);
    unwarmHero(); b17.root.removeFromParent(); compact?.removeFromParent();
    unwarmFormation();
    unwarm(); unwarmDust();
    for (const o of effectObjects) {
      o.removeFromParent();
      if (o instanceof THREE.LineSegments) o.geometry.dispose();
    }
    unwarmCrew(); unwarmCanopy();
    unwarmInterior2();
    unwarmTurrets();
    unwarmGlass();
    unwarmDamage();
    unwarmDestruction();
    unwarmInteriorDamage();
    unwarmAA();
    unwarmBoss();
    unwarmSea();
    for (const f of dummies) this.scene.remove(f.root);
    this.warmKeep.push(...this.wrecks.clearKeepMaterials()); // keep the compiled wreck programs (Wrecks.clearKeepMaterials)
    this.effects.clear();
  }

  // Refresh only mission-owned/lazy materials after the first complete prewarm. Do not
  // rebuild the retained wreck pools or accumulate another set of warmKeep materials.
  warmMission(camera: THREE.Camera) {
    const at = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(80).add(camera.position);
    const damage = this.bomberDamage.warmup(this.scene, at);
    const dust = warmDustMotes(this.scene, at);
    const interior = warmInteriorAssets(this.scene, at);
    const objects = this.effects.warmupObjects();
    for (const o of objects) { o.position.copy(at); o.frustumCulled = false; this.scene.add(o); }
    try { this.engine.warmRenderer(); }
    finally {
      damage(); dust(); interior();
      for (const o of objects) { o.removeFromParent(); if (o instanceof THREE.LineSegments) o.geometry.dispose(); }
    }
  }

  // Combat box: lead element + high and low elements, 3-ship vics, offsets in meters
  spawnFormation(count: number, playerSlot = 1) {
    const slots: THREE.Vector3[] = [];
    const vic = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(36, -8, -34), new THREE.Vector3(-36, -8, -34)];
    const elements = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(95, 45, -70), new THREE.Vector3(-95, -45, -80), new THREE.Vector3(0, -90, -160), new THREE.Vector3(120, 30, -220), new THREE.Vector3(-120, 60, -230)];
    for (const e of elements) for (const v of vic) slots.push(e.clone().add(v).multiplyScalar(FORMATION_SPREAD));
    const names = BOMBER_NAMES.map((n) => (n === bomberName() ? 'Sky Queen' : n));  // no AI ship shares the player's name
    for (let i = 0; i < count && i < slots.length; i++) {
      const b = new Bomber();
      b.slot.copy(slots[i]);
      b.name = i === playerSlot ? 'Sky Queen' : names.splice(1 + Math.floor(Math.random() * (names.length - 1)), 1)[0] ?? `B-17 #${i}`;
      b.wobbleAmp = 0.6 + Math.random() * 0.8;
      if (i === playerSlot) {
        b.isPlayer = true; this.playerBomber = b; this.player = b;
        dressPlayerBomber(b);  // name, paint scheme, nose art (Customize.ts)
        // The player's ship is tougher than the rest: one bad pass shouldn't end the mission
        for (const z of b.zones) { const k = z.name.startsWith('wing') && z.critical ? 3.5 : z.critical ? 2.4 : 1.5; z.hp *= k; z.maxHp *= k; }
      } else {
        for (const z of b.zones) { z.hp *= 1.3; z.maxHp *= 1.3; }
      }
      this.placeBomber(b, 0);
      this.add(b);
      this.livingFormation.add(b);
      // contrails from behind each engine nacelle
      const engines = [[6.5, -0.05, 0.6], [3.02, -0.4, 1.0], [-3.02, -0.4, 1.0], [-6.5, -0.05, 0.6]];
      engines.forEach(([x, y, z], k) => this.contrails.add(() => (b.remove || b.engineDead[k] ? null : b.localToWorld(new THREE.Vector3(x, y, z)))));
      for (const gun of b.guns.values()) gun.want = gun.rest.clone();
      const gs: AIGunner[] = [];
      for (const id of STATION_ORDER) gs.push({ key: id, def: STATIONS[id], station: STATIONS[id], cooldown: Math.random(), burst: 0, target: null, retarget: Math.random() });
      for (const x of AI_EXTRA) gs.push({ key: 'chin', def: x, cooldown: Math.random(), burst: 0, target: null, retarget: Math.random() });
      this.gunners.set(b, gs);
    }
  }

  // Formation weave (~50 s side to side, slow climbs and dives) plus the player's evasive
  // jinks, which come more often while fighters are pressing an attack.
  private maneuver(dt: number) {
    if (this.bombRunLevel) { this.bombRunSettle = 1; this.jinkT = this.jinkDur; this.formRoll *= Math.exp(-dt * 3); this.lurch *= Math.exp(-dt * 2.5); return; }
    const t = this.time;
    const wx = 0.12, wy = 0.09;
    const settle = this.bombRunSettle > .001 ? 1 - Math.exp(-dt * .8) : 1;
    this.bombRunSettle *= Math.exp(-dt);
    this.formOff.lerp(_v.set(Math.sin(t * wx) * 60, Math.sin(t * wy + 1) * 35, 0), settle);
    // bank into the weave: lateral acceleration over g
    this.formRoll += (Math.atan((60 * wx * wx * Math.sin(t * wx)) / 9.81) * 1.1 - this.formRoll) * settle;
    const pb = this.playerBomber;
    if (!pb || !pb.alive) return;
    let near = 0;
    for (const f of this.fighters('axis')) if (f.alive && f.pos.distanceTo(pb.pos) < 900) near++;
    this.nextJink -= dt * crewRoster.effects().jink * (near >= 3 ? 1.8 : near >= 1 ? 1.2 : 0.6);
    if (this.jinkT >= this.jinkDur && this.nextJink <= 0) {
      this.jinkT = 0; this.jinkDur = 4 + Math.random() * 2.5; this.jinkSide = Math.random() < 0.5 ? -1 : 1;
      this.nextJink = 9 + Math.random() * 9;
      if (near >= 2 && Math.random() < 0.5) this.callout('jink', 'Pilot', 'Hang on — evasive action!', 1, 2);
    }
    if (this.jinkT < this.jinkDur) this.jinkT += dt;
    this.lurch *= Math.exp(-dt * 2.5);
  }

  private placeBomber(b: Bomber, dt: number) {
    const t = this.time + b.wobblePhase;
    let ph = holdPhase.get(b);
    if (!ph) holdPhase.set(b, ph = { surge: Math.random() * Math.PI * 2, yaw: Math.random() * Math.PI * 2 });
    const wob = _v.set(Math.sin(t * 0.31) * 2.2, Math.sin(t * 0.47) * 1.4 + Math.sin(t * 1.3) * 0.25, Math.sin(t * 0.23) * 2.5).multiplyScalar(b.wobbleAmp);
    // Slow independent surge along the formation (+-3 m, ~1 min period); absolute, so not scaled by wobbleAmp
    const surge = Math.sin(this.time * 0.11 + ph.surge) * 3;
    wob.z += surge;
    if (b.straggling) {
      let home = b.isPlayer ? stragglerHome.get(b) : undefined;
      if (b.isPlayer && !home) stragglerHome.set(b, home = b.slot.clone());   // once per straggle
      b.slot.z -= dt * 3.5 * Math.max(1, b.enginesOut);
      b.slot.y -= dt * 2.0 * b.enginesOut;
      if (home) limitPlayerStraggle(b.slot, home);
    } else if (b.isPlayer) stragglerHome.delete(b);
    if (b.isPlayer) wob.multiplyScalar(crewRoster.effects().formation);
    if (b.isPlayer && b.damageControl) {
      const damage = b.damageControl.controls;
      wob.x += Math.sin(this.time * .18) * damage * 14;
      wob.y -= damage * (3 + Math.sin(this.time * .31) * 2);
      wob.z -= damage * 18;
    }
    wob.add(this.formOff);
    wob.y += this.bombRunLift * (b.isPlayer ? 1 : .35);
    // player's ship: jink sideways and down, banking into it (sin^2 profile, bank leads the slide)
    let jinkRoll = 0, jinkPitch = 0, turb = 0;
    if (b.isPlayer && this.jinkT < this.jinkDur) {
      const u = this.jinkT / this.jinkDur, s = Math.sin(Math.PI * u);
      wob.x += this.jinkSide * 24 * s * s;
      wob.y -= 14 * s;
      jinkRoll = -this.jinkSide * 0.17 * Math.sin(2 * Math.PI * u);
      jinkPitch = -0.06 * Math.sin(2 * Math.PI * u);
    }
    if (b.isPlayer) turb = (Math.sin(this.time * 7.3) * 0.5 + Math.sin(this.time * 11.1 + 1) * 0.3) * 0.006;
    const target = _v2.copy(b.slot).add(wob).add(this.formationCenter);
    if (dt > 0) b.vel.copy(target).sub(b.root.position).divideScalar(dt);
    else b.vel.copy(this.formationForward).multiplyScalar(CRUISE);
    b.root.position.copy(target);
    // Lateral rate of the sway (m/s), which drives the bank and yaw so they follow the drift
    const latRate = Math.cos(t * 0.31) * 0.68 * b.wobbleAmp;
    // Roll: a counter-bank against the drift plus a weak pull back toward the slot (positive roll tilts the lift toward -x)
    const roll = latRate * 0.045 + (wob.x - this.formOff.x) * 0.004 + (b.straggling ? 0.05 * b.enginesOut : 0) + this.formRoll + jinkRoll + (b.isPlayer ? this.lurch + turb : 0);
    // Yaw: slight heading wander that follows the lateral drift, plus a slow independent wander
    const yaw = Math.atan2(this.formationForward.x, this.formationForward.z) + latRate * 0.02 + Math.sin(this.time * 0.07 + ph.yaw) * 0.008;
    const pitch = Math.cos(t * 0.47) * 0.012 * b.wobbleAmp + Math.cos(this.time * 0.09 + 1) * 35 * 0.09 / CRUISE + jinkPitch + turb * 0.6 + (b.isPlayer ? this.bombRunLift * .008 : 0);
    b.root.quaternion.setFromEuler(new THREE.Euler(this.bombRunLevel ? 0 : -pitch, this.bombRunLevel ? Math.atan2(this.formationForward.x, this.formationForward.z) : yaw, this.bombRunLevel ? this.formRoll : roll, 'YXZ'));
  }

  add(a: Aircraft) {
    this.aircraft.push(a);
    this.scene.add(a.root);
    attachEngineHaze(a);   // heat haze behind the engines (HeatHaze.ts)
  }

  spawnEnemy(pos: THREE.Vector3, attack?: AttackType, skill = 1, dropTank = true, rockets = false, type: EnemyType = 'fw190'): Fighter {
    const variant = ENEMY_VARIANTS[type];
    const own = hasModel(variant.model as ModelKind);
    const f = new Fighter((own ? variant.model : 'fw190') as ModelKind, 'axis', variant.params, own ? variant.propRadius : 1.65);
    f.enemyType = type;
    f.root.position.copy(pos);
    const dir = _v.copy(this.formationCenter).sub(pos).setY(0).normalize();
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    f.fm.vel.copy(dir).multiplyScalar(180);
    f.vel.copy(f.fm.vel);
    // Bf 109 paint: done before the drop tank and rockets are fitted so they keep their colours
    if (variant.tint && !own) tintModel(f.model, variant.tint);
    dressEnemy(f, type, own); // per-type hit zones over the authored model
    // Fw 190 A-8: 2x MG 131 (13 mm) cowling, 4x MG 151/20 wing cannon
    const tracerY: [number, number, number] = [10, 8, 3.5];
    f.guns = [
      makeGun({ offset: new THREE.Vector3(0.18, 0.554, 0.9), rate: 15, muzzleVel: 750, damage: 5, spread: 0.007, tracerEvery: 3, tracerColor: tracerY }),
      makeGun({ offset: new THREE.Vector3(-0.18, 0.554, 0.9), rate: 15, muzzleVel: 750, damage: 5, spread: 0.007, tracerEvery: 3, tracerColor: tracerY }),
      makeGun({ offset: new THREE.Vector3(0.95, -0.466, 0.9), rate: 11, muzzleVel: 700, damage: 14, spread: 0.009, tracerEvery: 2, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(-0.95, -0.466, 0.9), rate: 11, muzzleVel: 700, damage: 14, spread: 0.009, tracerEvery: 2, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(2.3, -0.326, 0.7), rate: 9, muzzleVel: 700, damage: 14, spread: 0.01, tracerEvery: 3, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(-2.3, -0.326, 0.7), rate: 9, muzzleVel: 700, damage: 14, spread: 0.01, tracerEvery: 3, tracerColor: [11, 6, 2], cannon: true }),
    ];
    fitNewEnemyWeapons(f);
    if (dropTank && type !== 'me163' && type !== 'ju88g' && type !== 'me410') {
      const t = this.tankProto.clone();
      t.position.set(0, -0.98, -0.2);
      f.model.add(t);
      f.dropTank = t;
      f.dropTankAttached = true;
    }
    if (rockets && type !== 'me163' && type !== 'ju88g') {
      // two underwing Wgr. 21 mortar tubes
      f.rockets = 2;
      for (const x of [1.9, -1.9]) {
        const tube = new THREE.Mesh(this.tubeGeo, this.rocketMat);
        tube.position.set(x, -0.62, -0.1);
        tube.castShadow = true;
        f.model.add(tube);
        f.rocketTubes.push(tube);
      }
    }
    f.setScale(ENEMY_SCALE * (own ? variant.scale : variant.fallbackScale));
    for (const z of f.zones) { z.hp *= ENEMY_ZONE_HP; z.maxHp *= ENEMY_ZONE_HP; }
    f.structure = f.maxStructure = ENEMY_STRUCTURE * (0.85 + 0.15 * this.difficulty) * variant.structure;
    f.label = variant.label;
    setupDamageLook(f); // after tank/rockets so their materials are per-instance too
    this.add(f);
    this.pilots.set(f, new EnemyPilot(f, attack, skill * this.difficulty));
    this.stats.enemiesSpawned++;
    return f;
  }

  spawnPlayerFighter(pos: THREE.Vector3, dir: THREE.Vector3): Fighter {
    const f = this.makeAlliedFighter(pos, dir);
    f.isPlayer = true;
    for (const z of f.zones) { z.hp *= 1.7; z.maxHp *= 1.7; }
    this.player = f;
    this.playerFighter = f;
    return f;
  }

  spawnEscort(pos: THREE.Vector3, slot: THREE.Vector3, kind: EscortKind = 'p51d'): Fighter {
    const f = this.makeAlliedFighter(pos, this.formationForward, kind);
    // wingmen keep the enemy busy but leave the kills to the player
    for (const g of f.guns) { g.damage *= 0.3 * 6 / f.guns.length; g.tracerEvery = 3; }
    this.pilots.set(f, new EscortPilot(f, slot));
    return f;
  }

  private makeAlliedFighter(pos: THREE.Vector3, dir: THREE.Vector3, kind: EscortKind = 'p51d') {
    const spec = ESCORT_TYPES[kind];
    const f = new Fighter(kind, 'allied', spec.params, spec.propRadius);
    f.root.position.copy(pos);
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.copy(dir).normalize());
    f.fm.vel.copy(dir).normalize().multiplyScalar(140);
    f.vel.copy(f.fm.vel);
    // Authored wing muzzles, harmonised at ~300 m; escort damage is normalised above.
    const conv = 300;
    const muzzles = spec.muzzles;
    f.guns = [];
    for (const side of [1, -1]) for (const [x, y, z] of muzzles) {
      const off = new THREE.Vector3(x * side, y, z);
      const dirv = new THREE.Vector3(-off.x, -off.y + 0.45, conv).normalize();
      f.guns.push(makeGun({ offset: off, dir: dirv, rate: 13, muzzleVel: 880, damage: 14, spread: 0.0035, tracerEvery: 4, tracerColor: [9, 3, 1], ammo: 500 }));
    }
    if (kind !== 'p51d') {
      f.zone('engine')!.offset.z = kind === 'p47d' ? 3.3 : 1.5;
      f.zone('cockpit')!.offset.set(0, kind === 'p47d' ? .8 : .6, kind === 'p47d' ? 0 : -1.45);
      f.zone('tail')!.offset.z = -5.8;
    }
    f.label = spec.label;
    this.add(f);
    return f;
  }

  // ---------- radio ----------
  callout(key: string, speaker: string, text: string, cooldown = 8, priority = 1) {
    const last = this.lastCallout.get(key) ?? -999;
    if (this.time - last < cooldown) return;
    if (this.radioCooldown > 0 && priority < 2) return;
    this.lastCallout.set(key, this.time);
    this.radioCooldown = 2.5;
    this.events.radio?.(speaker, text, priority);
  }

  clockPosition(from: Aircraft, worldPos: THREE.Vector3): string {
    const local = from.worldToLocal(worldPos, _v);
    const ang = Math.atan2(-local.x, local.z); // + = right
    let clock = Math.round((ang / (Math.PI * 2)) * 12);
    if (clock <= 0) clock += 12;
    const elev = Math.atan2(local.y, Math.hypot(local.x, local.z));
    const hl = elev > 0.18 ? 'high' : elev < -0.18 ? 'low' : 'level';
    const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    return `${words[clock]} o'clock ${hl}`;
  }

  // ---------- damage ----------
  private onHit(e: HitEvent) {
    const t = e.target;
    if (t.remove) return;
    const z = e.zone;
    const wasAlive = t.alive;
    if (t === this.player || t === this.remoteFighter) {
      if (this.playerLucky && Math.random() < this.playerLucky) { this.effects.sparks(e.point, t.vel, false); return; }
      e.damage *= this.playerDamageScale;
    }
    if (e.playerShot) {
      if (/^(wing|tail)/.test(z.name)) e.damage *= this.playerWingDmg;
      if (this.playerExplosive && Math.random() < this.playerExplosive) { e.damage *= 3; this.effects.explosion(e.point, t.vel, 0.22); }
      if (this.playerSplash) { t.structure -= e.damage * this.playerSplash; this.effects.hitFlash(e.point, t.vel); }
    }
    if (e.playerShot && t instanceof Fighter && t.structureFrac < 0.5) e.damage *= this.playerExecute;
    z.hp -= e.damage;
    t.damageTaken += e.damage;
    t.hitFlash = 0.15;
    if (e.shooter) t.lastAttacker = e.shooter;
    t.structure -= e.damage;
    if (e.playerShot) {
      this.stats.hits++;
      this.stats.damage += e.damage;
      t.playerDamage += e.damage;
      t.lastPlayerHit = this.time;
      if (t instanceof Fighter && t.team === 'axis') panelImpact(t, e, this.effects, this.listener);
      else this.effects.hitFlash(e.point, t.vel);
      if (this.playerIncendiary && t instanceof Fighter && t.team === 'axis' && Math.random() < this.playerIncendiary) {
        const eng = t.zone('engine');
        if (eng && !eng.burning) { eng.burning = true; this.effects.sparks(e.point, t.vel, true); }
      }
    }
    const heavy = e.cannon;
    if (!(e.playerShot && t instanceof Fighter && t.team === 'axis')) this.effects.sparks(e.point, t.vel, heavy);
    if (t === this.playerBomber) this.bomberDamage.onHit(e);
    else this.livingFormation.onHit(e);
    if (t === this.player || t === this.playerBomber) {
      sound.playerImpact(heavy);
      this.events.playerHitFrom?.(e);
      this.events.shake?.(heavy ? 0.25 : 0.05);
      if (heavy && t === this.playerBomber) this.lurch += (Math.random() - 0.5) * 0.12;
      this.events.playerHit?.(z.name, heavy);
      if (t === this.playerBomber && /fuselage|tail|nose/.test(z.name)) {
        const local = t.worldToLocal(e.point.clone());
        const dir = e.bulletVel.clone().sub(t.vel).applyQuaternion(t.quat.clone().invert());
        this.events.fuselageHit?.(local, dir);
      }
      if (t === this.playerBomber && this.playerStation) {
        // Rounds hitting the section of fuselage you are standing in can wound you
        const near = e.point.distanceTo(t.localToWorld(this.playerStation.pivot, _v)) < 2.2;
        // (halved in a battle-group fight: the turrets' heavy rounds hit for minutes on end)
        if (near && this.time - this.lastWound > 18 && Math.random() < (heavy ? 0.05 : 0.006) * this.crewWoundMult * (this.bossFight ? BOSS_WOUND : 1)) {
          this.lastWound = this.time;
          this.crewWounded++;
          this.crew.wound(STATION_CREW[this.playerStation.id]);
          this.events.playerHit?.('gunner', true);
        }
        if (near && Math.random() < 0.3) sound.play('glass', null, { gain: 0.4 });
      }
      // Heavy cannon hits on the bomber can also wound a crewman elsewhere in the ship (rare, spaced out)
      if (t === this.playerBomber && heavy && this.time - this.lastCrewWound > 25 && Math.random() < 0.008 * this.crewWoundMult) this.woundCrewman();
    } else if (e.playerShot) {
      sound.play('hit', e.point, { gain: 0.35, delay: false, ref: 60 });
      playRicochet(e.point);
      hitSounds.onHit(t, heavy, t instanceof Fighter && stageOf(t.structureFrac) > damageStage(t));
      this.events.hitMarker?.(false);
      // visible battle damage: panels and cowling pieces tearing off
      if (z.hp < z.maxHp * 0.55 && !(z as any).shed) {
        (z as any).shed = true;
        this.effects.spawnDebris(e.point, t.vel, 3, false);
        this.effects.smoke.spawn({ pos: e.point, vel: t.vel, life: 1.6, size0: 1.2, size1: 5, color0: [0.25, 0.24, 0.22], alpha0: 0.7, alpha1: 0, drag: 1.5, lit: true });
      }
    }

    // hit location: the structural part it landed on (a wingtip can come off, a tank catch fire)
    if (t instanceof Fighter) this.destruction.onHit(t, e);
    if (z.hp <= 0 && !(z as any).destroyed) {
      (z as any).destroyed = true;
      if (z.engine !== undefined) {
        t.engineDead[z.engine] = true;
        z.burning = Math.random() < (t instanceof Bomber ? 0.35 : 0.6);
        if (t instanceof Bomber) {
          if (t.isPlayer) this.callout('eng' + z.engine, 'Pilot', `Number ${z.engine + 1} engine is hit! Feathering number ${z.engine + 1}!`, 1, 2);
          if (t.enginesOut >= 2 && !t.straggling) {
            t.straggling = true;
            if (t.isPlayer) this.callout('strag', 'Pilot', 'We can\'t hold formation. We\'re falling behind — keep those guns hot!', 1, 2);
            else this.callout('strag' + t.id, 'Tail', `${t.name} is falling out of formation!`, 1);
          }
        } else if (t instanceof Fighter) {
          // engine dead -> the fighter is effectively finished
          this.killAircraft(t, e.playerShot, 'engine');
        }
      } else if (z.critical) {
        this.killAircraft(t, e.playerShot, z.name);
      }
      if (t instanceof Bomber && t.enginesOut >= 4) this.killAircraft(t, false, 'all engines');
    }
    if (t.alive && t instanceof Fighter && t.structure <= 0) this.killAircraft(t, e.playerShot, z.name);
    if (wasAlive && !t.alive && t instanceof Fighter && t.team === 'axis' && e.shooter instanceof Bomber && !e.shooter.isPlayer) this.livingFormation.gunnerKill();
    if (wasAlive && !t.alive && e.playerShot) this.events.hitMarker?.(true);
  }

  /** Wreckage striking an aircraft (destruction/Destruction.ts): booked like a heavy round. */
  debrisHit(e: HitEvent) { if (!e.target.remove) this.onHit(e); }

  // The player's own gunner is tracked by the gunner wound above, so he is left out here
  private woundCrewman() {
    const m = this.crew.woundRandom(this.playerStation ? STATION_CREW[this.playerStation.id] : undefined);
    if (!m) return;
    this.lastCrewWound = this.time;
    this.callout('crewwound', 'Pilot', `${m.name} is hit ${m.spot}! Somebody get him some help!`, 20, 2);
  }

  // A B-17 lost in a formation set piece (SetPieces.ts). It counts in bombersLost (debrief) and
  // in scriptedLost, which combatLosses (the mission's loss limit) leaves out. No visuals, crew or
  // radio here: the set piece stages them. fall: the ship goes down on its own spin and velocity
  // (set b.spin / b.vel); false: it is replaced by wreck pieces and removed.
  scriptedLoss(b: Bomber, fall: boolean) {
    if (!b.alive) return;
    b.alive = false;
    b.scripted = true;
    b.falling = fall;
    b.fallTime = 0;
    if (!fall) b.remove = true;
    this.stats.bombersLost++;
    this.stats.scriptedLost++;
    this.events.bomberLost?.(b);
  }

  // Debris coming through (set pieces): the pilot throws the ship into an evasive jink now,
  // sliding toward formation x sign `side`. Skipped while a jink is already on.
  evade(side: number) {
    if (this.bombRunLevel || this.jinkT < this.jinkDur) return;
    this.jinkT = 0; this.jinkDur = 3.6; this.jinkSide = side < 0 ? -1 : 1;
    this.nextJink = 10 + Math.random() * 6;
  }

  // A blast close by rocks the player's ship (a roll kick; 'reduce screen shake' scales it down)
  buffet(k: number) {
    this.lurch += (Math.random() < 0.5 ? -1 : 1) * Math.min(0.16, 0.1 * k) * access.shake;
  }

  killAircraft(a: Aircraft, byPlayer: boolean, cause = '') {
    if (!a.alive) return;
    if (a === this.player) {
      this.lastKillCause = cause;
      console.info('Player aircraft lost:', cause, a.zones.map((z) => `${z.name}:${Math.round(z.hp)}/${Math.round(z.maxHp)}`).join(' '));
    }
    a.alive = false;
    a.falling = true;
    a.fallTime = 0;
    // Credit the player if they dealt a meaningful share of the damage
    const credited = byPlayer || (a.playerDamage > 0 && a.playerDamage >= a.damageTaken * 0.2);
    if (a instanceof Fighter) {
      a.spin.set(R() * 0.6, R() * 0.4, (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5));
      // axis fighters get varied endings (fireball, wing/tail shot away, engine fire, bail-out, dead pilot)
      startFighterDeath(a, cause, this);
      if (a.team === 'axis' && credited) hitSounds.onKill(a);
      if (a.team === 'axis') {
        if (credited) this.stats.kills++;
        this.events.kill?.(a, credited, cause);
      } else {
        this.events.kill?.(a, false, cause);
      }
    } else if (a instanceof Bomber) {
      if (this.livingFormation.beginLoss(a, cause)) {
        this.stats.bombersLost++; this.events.bomberLost?.(a); return;
      }
      a.spin.set(R() * 0.05, R() * 0.05, (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25));
      a.vel.copy(this.formationForward).multiplyScalar(CRUISE * 0.85);
      a.zones.forEach((z) => { if (z.engine !== undefined && Math.random() < 0.5) z.burning = true; });
      this.effects.explosion(a.localToWorld(new THREE.Vector3(R() * 6, 0, 2)), a.vel, 0.8);
      // the stricken bomber breaks up over the next few seconds: secondary blasts and a burning wing
      this.destruction.separate(a, cause === 'tail' ? 2 : cause === 'wingR' ? 5 : 3, false);
      startBomberDeath(a, this.effects, (pos, k) => { if (this.player) this.events.shake?.(Math.max(0, 1 - pos.distanceTo(this.player.pos) / 300) * k); });
      sound.play('explosion', a.pos, { gain: 1.6, ref: 200, reverb: 0.8 });
      this.stats.bombersLost++;
      this.events.bomberLost?.(a);
      // crew bailing out
      const n = a.isPlayer ? 0 : 2 + Math.floor(Math.random() * 6); // player chutes follow the escape manifest
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (a.remove) return;
          this.effects.parachute(a.localToWorld(new THREE.Vector3(R() * 0.5, -1.4, -4 + R() * 2)), a.vel.clone().multiplyScalar(0.5));
        }, 2500 + i * 900 + Math.random() * 1500);
      }
    }
  }

  // ---------- per-frame ----------
  update(dt: number) {
    if (dt <= 0) return;
    this.time += dt;
    this.radioCooldown -= dt;
    // field dressing: a crewmate patches the gunner up after a quiet spell (one wound per DRESSING s;
    // sooner in a battle-group fight, which never goes quiet)
    if (this.crewWounded > 0 && this.playerStation && this.time - this.lastWound > (this.bossFight ? DRESSING_BOSS : DRESSING) * crewRoster.effects().dressing) {
      this.crewWounded--;
      this.lastWound = this.time - 18;
      this.callout('dressing', 'Radio', 'Hold still — I\'ve patched you up. Back on that gun.', 0, 2);
    }
    this.formationCenter.addScaledVector(this.formationForward, CRUISE * dt);
    this.maneuver(dt);
    this.weatherFront(dt);
    this.livingFormation.update(dt, this.engine.quality === 'low');

    for (const a of this.aircraft) {
      if (a instanceof Bomber && a.alive) this.placeBomber(a, dt);
      const p = this.pilots.get(a as Fighter);
      if (p && a.alive) p.update(dt, this);
      a.update(dt, this.time);
      if (a instanceof Fighter) { updateDamageLook(a, this.time); updateDamageStages(a, dt, this.time, this.effects, this.listener); }
      if (a.hitFlash > 0) a.hitFlash -= dt;
      if (a instanceof Fighter && a.alive && !a.isPlayer && this.listener) {
        // close fly-by: roar of the engine and a buffet
        const d = a.pos.distanceTo(this.listener);
        if (d < 160 && this.time - ((a as any).lastWhoosh ?? -99) > 4) {
          (a as any).lastWhoosh = this.time;
          sound.play('whoosh', a.pos, { gain: 1.3, ref: 50, delay: false });
          this.events.shake?.(0.25 * (1 - d / 160));
        }
      }
      if (a instanceof Fighter && a.alive) {
        if (a.pos.y < this.floorY) { a.alive = false; a.remove = !a.isPlayer; if (a.isPlayer) { a.falling = false; } }
        else if (!a.isPlayer && a !== this.remoteFighter && a.pos.distanceTo(this.formationCenter) > ((this.pilots.get(a) as EnemyPilot | undefined)?.state === 'withdraw' ? 4500 : 9000)) a.remove = true; // left the battle
      }
      this.fireGuns(a, dt);
      this.damageEffects(a, dt);
    }
    updateExhausts(this.aircraft, this.effects.glow);
    this.wingVapor.update(this.aircraft, dt, this.listener);
    this.bomberGunners(dt);
    this.flak(dt);
    this.updateRockets(dt);
    this.fires(dt);
    this.bomberDamage.update(dt);
    updateBomberDeath(dt);
    updateFighterDeath(dt);
    this.destruction.update(dt);
    this.ballistics.update(dt, this.aircraft);
    this.effects.update(dt);
    this.wrecks.update(dt);
    this.contrails.update(this.time);
    this.radioChatter(dt);

    // cleanup
    for (const a of this.aircraft) if (a.remove) { this.scene.remove(a.root); disposeOwned(a.root); this.pilots.delete(a as Fighter); this.gunners.delete(a as Bomber); }
    this.aircraft = this.aircraft.filter((a) => !a.remove);
  }

  private launchRockets(f: Fighter) {
    f.fireRockets = false;
    if (f.rockets <= 0) return;
    const target = this.bombers().filter((b) => b.alive).sort((x, y) => x.pos.distanceTo(f.pos) - y.pos.distanceTo(f.pos))[0];
    for (const tube of f.rocketTubes) {
      const pos = tube.getWorldPosition(new THREE.Vector3());
      const dir = f.forward(new THREE.Vector3());
      // aimed slightly high (they drop a lot); time fuse set to the range of the target
      dir.y += 0.035;
      dir.normalize();
      const obj = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      obj.position.copy(pos);
      this.scene.add(obj);
      const range = target ? target.pos.distanceTo(f.pos) : 1000;
      this.rockets.push({ obj, pos: obj.position, vel: dir.multiplyScalar(320).add(f.vel), fuse: range / 330 + (Math.random() - 0.5) * 1.1, age: 0, owner: f });
      tube.removeFromParent();
    }
    f.rocketTubes = [];
    f.rockets = 0;
    sound.play('rocket', f.pos, { gain: 1.2, ref: 80 });
    this.callout('rockets', 'Tail', 'Rockets! They\'re firing rockets into the formation!', 8, 2);
  }

  private updateRockets(dt: number) {
    for (const r of this.rockets) {
      r.age += dt;
      r.vel.y -= 9.81 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.obj.lookAt(r.pos.clone().add(r.vel));
      // sizzling smoke trail and motor flame
      this.effects.smoke.spawn({ pos: r.pos, vel: r.vel.clone().multiplyScalar(0.05), life: 3.5, size0: 0.8, size1: 4.5, color0: [0.85, 0.85, 0.83], alpha0: 0.55, alpha1: 0, drag: 1, lit: true });
      if (r.age < 1.6) this.effects.glow.spawn({ pos: r.pos, life: 0.06, size0: 1.4, size1: 0.6, color0: [14, 7, 2], alpha0: 1, alpha1: 0, frame: 1 });
      let boom = r.age >= r.fuse;
      if (!boom) for (const a of this.aircraft) if (a.alive && a.team === 'allied' && a.pos.distanceTo(r.pos) < 22) { boom = true; break; }
      if (boom) {
        r.fuse = -1;
        r.obj.removeFromParent();
        this.effects.explosion(r.pos, new THREE.Vector3(), 0.9);
        sound.play('explosion', r.pos, { gain: 1.5, ref: 150, reverb: 0.7 });
        if (this.player) this.events.shake?.(Math.max(0, 1 - r.pos.distanceTo(this.player.pos) / 300));
        for (const a of this.aircraft) {
          if (!a.alive || a.team !== 'allied') continue;
          const d = a.pos.distanceTo(r.pos);
          if (d > 40) continue;
          for (let k = 0; k < 2; k++) {
            const zone = a.zones[Math.floor(Math.random() * a.zones.length)];
            this.onHit({ target: a, zone, point: a.localToWorld(zone.offset, new THREE.Vector3()), damage: (1 - d / 40) * 45, cannon: true, shooter: r.owner, bulletVel: r.vel.clone(), playerShot: false });
          }
        }
      }
    }
    this.rockets = this.rockets.filter((r) => r.fuse >= 0 && r.age < 8);
  }

  // Fires: burning engines eat into the wing; on the player's ship the pilot fights them
  private fires(dt: number) {
    // set alight by incendiary rounds: the fire eats the fighter, credited to the player
    for (const f of this.fighters('axis')) {
      if (!f.alive || !f.zone('engine')?.burning) continue;
      f.structure -= dt * 22; f.playerDamage += dt * 22;
      if (f.structure <= 0) this.killAircraft(f, true, 'fire');
    }
    for (const b of this.bombers()) {
      if (!b.alive) continue;
      for (const z of b.zones) {
        if (!z.burning || z.engine === undefined) continue;
        const wing = b.zone(z.engine < 2 ? 'wingL' : 'wingR');
        if (wing && wing.hp > 0) {
          wing.hp -= dt * (b.isPlayer ? 1.2 : 3.5);
          if (wing.hp <= 0 && !(wing as any).destroyed) { (wing as any).destroyed = true; this.killAircraft(b, false, 'fire'); }
        }
        if (!b.isPlayer) continue;
        const key = z.name;
        const t = (this.fireTimers.get(key) ?? 0) + dt;
        this.fireTimers.set(key, t);
        if (t > 0.1 && t - dt <= 0.1) this.callout('fire' + key, 'Top Turret', `Fire in number ${z.engine + 1} engine!`, 1, 3);
        if (t > 4.5 * crewRoster.effects().fireDelay) {
          const bottles = this.extinguishers.get(key) ?? this.extinguisherBottles;
          this.fireTimers.set(key, -6 * crewRoster.effects().fireDelay); // next attempt (if any) later
          if (bottles > 0) {
            this.extinguishers.set(key, bottles - 1);
            if (Math.random() < this.extinguishChance) { z.burning = false; this.fireTimers.delete(key); this.callout('fireout' + key, 'Pilot', `Extinguisher's in. Fire's out on number ${z.engine + 1}.`, 1, 3); }
            else this.callout('firestill' + key, 'Pilot', `Extinguisher didn't take! Number ${z.engine + 1} is still burning!`, 1, 3);
          }
        }
      }
    }
  }

  fireGuns(a: Aircraft, dt: number) {
    if (!(a instanceof Fighter) || !a.alive) return;
    if (a.fireRockets) this.launchRockets(a);
    for (const g of a.guns) {
      g.cooldown -= dt;
      if (!(g.oblique ? a.obliqueTrigger : a.trigger) || g.ammo <= 0) { if (g.cooldown < 0) g.cooldown = 0; continue; }
      while (g.cooldown <= 0 && g.ammo > 0) {
        g.cooldown += 1 / g.rate;
        g.count++;
        if (g.ammo !== Infinity) g.ammo--;
        const muzzle = a.localToWorld(g.offset, _v);
        const dir = _v2.copy(g.dir).applyQuaternion(a.quat);
        if (a.gunAim && !g.oblique) dir.copy(a.gunAim);
        dir.x += R() * g.spread; dir.y += R() * g.spread; dir.z += R() * g.spread;
        dir.normalize();
        const vel = dir.clone().multiplyScalar(g.muzzleVel).add(a.vel);
        this.ballistics.fire(muzzle, vel, a.team, g.damage, g.count % g.tracerEvery === 0, g.tracerColor, a, !!g.cannon, a.isPlayer);
        if (a.isPlayer) this.stats.shots++;
        if (g.count % 2 === 0) this.effects.muzzleFlash(muzzle, dir, a.isPlayer ? 0.4 : g.cannon ? 2.6 : 1.8, a.vel);
        if (a.isPlayer && g.count % 2 === 0) heatHaze.emit(muzzle, 0.45, 1, 0.14, 'shimmer', dir);   // muzzle blast shimmer
        if (g.count % 3 === 0) {
          if (a.isPlayer) sound.playerGun(true, !!g.cannon);
          else sound.play(g.cannon ? 'cannon' : 'mg131', muzzle, { gain: g.cannon ? 0.9 : 0.6, ref: 70 });
        }
      }
    }
  }

  private damageEffects(a: Aircraft, dt: number) {
    a.smokeAcc += dt;
    const far = this.listener ? a.pos.distanceToSquared(this.listener) : 0;
    if (far > 4500 * 4500) { a.smokeAcc = 0; return; }
    if (a.smokeAcc < (far > 1500 * 1500 || this.engine.quality === 'low' ? 0.12 : 0.05)) return;
    const span = a.smokeAcc;   // the trail puffs are spread back over the path flown since the last emission
    a.smokeAcc = 0;
    for (const z of a.zones) {
      const dmg = 1 - Math.max(0, z.hp) / z.maxHp;
      const smoking = z.engine !== undefined ? dmg > 0.35 : dmg > 0.85;
      if (!smoking && !z.burning) continue;
      const p = a.localToWorld(_v.copy(z.offset).add(_v2.set(0, 0.2, -0.6)), _damagePos);
      this.effects.trail(p, a.vel, Math.min(1, dmg), !!z.burning, a instanceof Bomber ? 1.3 : 0.8, span);
    }
    // worn-down fighters: staged smoke, fire and debris live in DamageStages
    if (a.falling && a instanceof Fighter && !deathOwned(a) && Math.random() < 0.6) {
      this.effects.trail(a.localToWorld(_v.set(0, 0, 1.5), new THREE.Vector3()), a.vel, 1, true, 1, span);
    }
  }

  // AI crews on every bomber, including the other stations of the player's own bomber
  private bomberGunners(dt: number) {
    for (const [b, gs] of this.gunners) {
      if (!b.alive || (this.listener && b.pos.distanceToSquared(this.listener) > 3000 * 3000)) continue;
      for (const g of gs) {
        if (b.isPlayer && g.station && this.playerStation && g.station.id === this.playerStation.id) continue;
        if (b.isPlayer && g.station && this.remoteStations.has(g.station.id)) continue;
        if (b.isPlayer && g.station && this.crew.wounded.has(STATION_CREW[g.station.id])) { g.burst = 0; continue; }
        const sk = aiGunnerSkill(b.isPlayer ? g.station?.id : null); // crew skill (CrewRoster); default elsewhere
        g.retarget -= dt;
        g.cooldown -= dt;
        if (g.retarget <= 0) {
          g.retarget = (0.4 + Math.random() * 0.4) * sk.react;
          g.target = null;
          let best = 650 + 250 * Math.random();
          const pivotW = b.localToWorld(g.def.pivot, _gunPos);
          for (const e of this.aircraft) {
            if (!(e instanceof Fighter) || e.team !== 'axis' || !e.alive || e.remove) continue;
            const d = e.pos.distanceTo(pivotW);
            if (d > best) continue;
            const local = b.worldToLocal(e.pos, _v).sub(g.def.pivot);
            if (!inArc(g.def as StationDef, local)) continue;
            best = d; g.target = e;
          }
          if (g.target && g.burst <= 0 && Math.random() < 0.35 * sk.engage) g.burst = (0.5 + Math.random() * 1.2) * sk.burst;
        }
        if (!g.target || !g.target.alive) { g.burst = 0; continue; }
        // swing the visible turret/gun toward the target
        const tg = b.guns.get(g.key);
        if (tg?.want) b.worldToLocal(g.target.pos, tg.want).sub(g.def.pivot).normalize();
        if (g.burst > 0) {
          g.burst -= dt;
          while (g.cooldown <= 0) {
            g.cooldown += 1 / (g.station?.twin ? 22 : 12);
            const pivotW = b.localToWorld(g.def.pivot, _gunPos);
            // Imperfect lead: AI gunners spray, they rarely get a clean kill
            const tp = _gunAim.copy(g.target.pos);
            const dist = tp.distanceTo(pivotW);
            const tof = dist / 860;
            tp.addScaledVector(_v.copy(g.target.vel).sub(b.vel), tof * (sk.leadC + (Math.random() * 2 - 1) * sk.leadW));
            tp.y += 0.5 * 9.81 * tof * tof;
            const dir = tp.sub(pivotW).normalize();
            const spread = 0.026 * sk.spread;
            dir.x += R() * spread; dir.y += R() * spread; dir.z += R() * spread;
            dir.normalize();
            const muzzle = pivotW.addScaledVector(dir, 1.6);
            this.ballistics.fire(muzzle, dir.multiplyScalar(860).add(b.vel), 'allied', (b.isPlayer ? 0.12 : dist < 450 ? 3.5 : 1.2) * this.aiGunnerFactor, Math.random() < 0.45, GUNNER_COLOR, b);
            if (Math.random() < 0.3) this.effects.muzzleFlash(muzzle, dir.normalize(), 0.8, b.vel);
            if (Math.random() < 0.12) sound.play('m2far', muzzle, { gain: b.isPlayer ? 0.5 : 0.35, ref: b.isPlayer ? 6 : 50 });
          }
        } else if (g.cooldown < 0) g.cooldown = 0;
      }
    }
  }

  // A weather front (Weather.ts) runs on flying time; the crew calls it, contrails follow the air
  private weatherFront(dt: number) {
    const ev = updateWeather(this.engine, dt, this.formationForward);
    if (!ev) return;
    const fs = frontState();
    const gunner = !!this.playerBomber && this.player === this.playerBomber;
    if (ev === FRONT_EVENT.sighted) {
      if (gunner) this.callout('wx_front', 'Pilot', 'Storm front dead ahead. Tighten it up — we\'re going right through it.', 30, 2);
      else this.callout('wx_front', 'Lead', 'Blue flight, storm front dead ahead. Close it up and stay on my wing in the murk.', 30, 2);
    } else if (ev === FRONT_EVENT.clearing) {
      if (gunner) this.callout('wx_clear', 'Pilot', 'We\'re breaking out of the cloud — clear sky ahead. They\'ll see us coming now.', 30, 2);
      else this.callout('wx_clear', 'Lead', 'Blue flight, the cloud\'s breaking up. Clear sky ahead — keep your eyes open.', 30, 2);
    } else if (ev === FRONT_EVENT.done && fs) {
      this.contrails.enabled = (!fs.preset || fs.preset === 'clear') && (fs.to === 'clear' || fs.to === 'dusk');
    }
  }

  // A heavy flak burst with no fragments (searchlight-directed AA at night, RaidDefence): the
  // burst, its light in the cloud, the sound and a shake when it is close
  flakBurst(p: THREE.Vector3) {
    this.effects.flak(p);
    sound.flakBurst(p);
    const dl = this.player ? p.distanceTo(this.player.pos) : 9999;
    if (dl < 400) this.events.shake?.(Math.max(0, 1 - dl / 400) * 0.6);
  }

  private flak(dt: number) {
    if (this.flakIntensity <= 0) return;
    this.flakAcc += dt * this.flakIntensity;
    while (this.flakAcc > 1) {
      this.flakAcc -= 1;
      const bs = this.bombers().filter((b) => b.alive);
      if (!bs.length) return;
      const target = Math.random() < 0.15 && this.playerBomber?.alive ? this.playerBomber : bs[Math.floor(Math.random() * bs.length)];
      const p = target.pos.clone().add(new THREE.Vector3(R() * 180, R() * 90 + 20, R() * 220 + 60));
      this.effects.flak(p);
      const dl = this.player ? p.distanceTo(this.player.pos) : 9999;
      sound.flakBurst(p);   // burst + close whump + shrapnel patter (was silent between 160 and 400 m)
      if (dl < 400) this.events.shake?.(Math.max(0, 1 - dl / 400) * 0.9);
      // shrapnel
      for (const a of this.aircraft) {
        if (!a.alive) continue;
        const d = a.pos.distanceTo(p);
        if (d < 55) {
          const dmg = (1 - d / 55) * 40;
          const zone = a.zones[Math.floor(Math.random() * a.zones.length)];
          this.onHit({ target: a, zone, point: a.localToWorld(zone.offset, new THREE.Vector3()), damage: dmg, cannon: d < 25, shooter: null, bulletVel: new THREE.Vector3(), playerShot: false });
        }
      }
    }
  }

  private radioChatter(dt: number) {
    const pl = this.player;
    if (!pl || !pl.alive) return;
    for (const f of this.fighters('axis')) {
      if (!f.alive) continue;
      const p = this.pilots.get(f) as EnemyPilot | undefined;
      if (!p || p.calloutDone) continue;
      const d = f.pos.distanceTo(pl.pos);
      if (p.state === 'attack' && d < 2200) {
        p.calloutDone = true;
        const clock = this.clockPosition(pl, f.pos);
        onContact(this, f.enemyType, clock);
      }
    }
  }

  rebase(off: THREE.Vector3) {
    this.formationCenter.sub(off);
    this.ballistics.rebase(off);
    this.effects.rebase(off);
    // rockets are scene children (shifted by the engine); nothing else to do
    this.contrails.rebase(off);
    rebaseFighterDeath(off);
    this.destruction.rebase(off);
    this.wingVapor.rebase(off);
    for (const p of this.pilots.values()) if (p instanceof EnemyPilot) p.setupPoint.sub(off);
  }

  // Engine voice info for sound
  fighterSoundInfo() {
    return this.fighters('axis').concat(this.fighters('allied').filter((f) => !f.isPlayer))
      .filter((f) => !f.remove)
      .map((f) => ({ id: f.id, pos: f.pos, vel: f.vel, radial: f.kind === 'fw190', throttle: f.fm.throttle, stage: damageStage(f), type: f.enemyType || f.kind }));
  }

  // 0..1 how hard the player's aircraft is manoeuvring, for the audio (wind, creaks): the B-17's
  // evasive jink profile (plus a hit's lurch), or the P-51's g-load
  get maneuverLevel(): number {
    if (this.player && this.player === this.playerBomber) {
      const j = this.jinkT < this.jinkDur ? Math.sin(Math.PI * this.jinkT / this.jinkDur) ** 2 : 0;
      return Math.min(1, j + Math.abs(this.lurch) * 4);
    }
    const f = this.playerFighter;
    return f && f === this.player ? Math.min(1, Math.max(0, (f.fm.gLoad - 1.8) / 4.5)) : 0;
  }
}

export { dirFromYawPitch, _q };
