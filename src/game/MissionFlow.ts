import { difficultyBalance } from '../ui/SettingsModel';
import { secondTourMedal } from './CampaignState';
import { isSecondTourId } from './SecondTour';
import * as THREE from 'three';
import type { Game } from './Game';
import type { DebriefData } from '../ui/UI';
import { isChapterMission } from './DeepPenetration';
import { CAMPAIGN, Mission } from './Missions';
import { missionCold } from './LivingInterior';
import { sound } from '../audio/Sound';
import { DEFAULT_WEATHER, ROUND_WEATHER } from '../render/Weather';
import * as Chatter from './RadioChatter';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { pushSave } from '../net/CloudSave';
import { achievements } from './Achievements';
import { isMissionReady, whenMissionReady } from '../core/Preload';
import { queueCrate } from './Loot';
import { crewRoster } from './CrewRoster';
import { BailOutCinematic, BAIL_TOTAL } from './BailOutCinematic';
import { leaderboardMode } from './Modes';
import { mountShare, shareStamp } from './Share';
import { analytics } from '../net/Analytics';
import { mountCampaignReport, prepareCampaignMission, campaignMeritMult } from '../ui/CampaignMap';
import { crewRoomScene } from '../ui/CrewRoomScene';
import { endBriefing } from '../ui/BriefingExtras';

// Bail-out sequence when a gunner's B-17 is shot down (before the debrief): BailOutCinematic.ts
const BAIL_SEQ_TIME = BAIL_TOTAL;

// A mission's life cycle around the frame loop: startMission (reset everything, spawn the
// formation and the player), endRound / startNextRound (hangar break between rounds),
// finish -> the 'ending' state (banner, fly-by or bail-out) -> showDebrief (score, medals,
// progress, merit, leaderboard and the debrief screen). Game exposes startMission, finish
// and showDebrief as thin wrappers, so other modules and the dev hooks keep calling those.
export class MissionFlow {
  private endTimer = 0;
  private bailT = -1;     // seconds into the bail-out sequence, -1 when inactive
  private bailCine = new BailOutCinematic();
  private scoreBanked = 0;     // score already paid out as merit at round ends
  private roundKills0 = 0;

  private prewarmed = false;

  constructor(private g: Game) {}

  startMission(m: Mission) {
    const g = this.g;
    endBriefing();   // no briefing narration under the mission's radio (co-op starts, quick starts)
    // Models and gameplay sounds stream in behind the menu: wait for them (loading screen)
    if (!isMissionReady()) { whenMissionReady(g.ui, () => g.startMission(m)); return; }
    if (g.bookends.takeoff(m, () => g.startMission(m))) return; // take-off scene first (Bookends.ts)
    g.aa.release();
    g.formationReturn.reset();
    g.ditching.reset();
    if (!g.coop.role) prepareCampaignMission(m, g.progress); // campaign state: formation size, enemy count/skill, P-51 escort
    sound.init();
    g.photo.exit();
    g.mission = m;
    g.menuMode = false;
    g.slowmo = 0;
    g.engine.timeScale = 1;
    g.menuScene.onMissionStart();
    g.gunner.detach();
    g.pilot.detach();
    g.world.reset();
    g.clearBombs();
    g.world.difficulty = 1;
    g.director.reset();
    this.endTimer = 0;
    g.endResult = null;
    this.bailT = -1;
    this.bailCine.stop();
    g.score = 0;
    g.damageT = 0;
    g.cracks.clear();
    g.engine.post.resetHistory();
    // survival picks a random time of day
    const presets = ROUND_WEATHER;
    g.setWeather(m.weather ?? (m.duration === Infinity ? presets[Math.floor(Math.random() * presets.length)] : DEFAULT_WEATHER));
    g.world.playerDamageScale = (m.playerArmor ?? (m.role === 'gunner' ? 0.6 : 0.75)) * (m.role === 'gunner' ? 0.55 : 0.6);
    g.world.aiGunnerFactor = 1;
    g.world.playerFocus = m.role === 'gunner' ? 0.75 : 0.2;
    const diff = g.settings.difficulty;
    const balance = difficultyBalance(diff);
    g.world.difficulty = balance.enemy;
    g.world.playerDamageScale *= balance.damage;
    g.world.aiGunnerFactor *= balance.allies;
    g.worldEvents.reset(); g.trauma = 0;
    g.hud.reset();
    g.prog.perks = []; g.killsSincePerk = 0;
    g.adaptive.reset(); g.roundIdx = 0; g.roundT0 = 0; this.scoreBanked = 0; this.roundKills0 = 0;
    g.combo.reset();
    g.feel.reset(); g.combat.reset();
    g.tally.reset();
    achievements.beginMission(m);
    g.world.spawnFormation(m.bombers, 1);
    const pb = g.world.playerBomber!;
    if (m.role === 'pilot') for (const b of g.world.bombers()) for (const z of b.zones) { z.hp *= 2.2; z.maxHp *= 2.2; }
    const aa = m.id === 'survival-aa';
    if (aa) { /* ground controller starts after the shared mission reset */ }
    else if (m.role === 'gunner') {
      g.gunner.survival.difficulty = diff;
      g.gunner.resetAmmo();
      g.gunner.attach(pb, m.station ?? 'waistL');
      g.gunner.cold = missionCold(m); // frost on the waist windows (LivingInterior)
      sound.setMode('bomber');
      if (m.playerDamaged) {
        for (const name of ['engine2', 'engine4']) {
          const z = pb.zone(name)!;
          z.hp = 0; (z as any).destroyed = true;
          pb.engineDead[z.engine!] = true;
        }
        pb.straggling = true;
        pb.zone('engine2')!.burning = false;
        g.world.playerDamageScale = 0.45;
      }
      g.world.flakIntensity = 0;
    } else {
      // P-51: start above and behind the box
      const start = g.world.formationCenter.clone().add(new THREE.Vector3(60, 420, -600));
      const f = g.world.spawnPlayerFighter(start, g.world.formationForward);
      g.pilot.attach(f);
      g.pilot.throttleCmd = 0.85;
      sound.setMode('fighter');
      for (let i = 0; i < (m.escorts ?? 0); i++) {
        g.world.spawnEscort(start.clone().add(new THREE.Vector3((i + 1) * 40 * (i % 2 ? 1 : -1), 10, -30 * (i + 1))), new THREE.Vector3((i - 1.5) * 250, 380, 150));
      }
    }
    g.prog.role = m.role;
    g.pilotOps.start(m);
    if (aa) Chatter.detachRadioChatter(); else Chatter.attachRadioChatter(g.world, m.role);
    g.abilities.reset(m.role);
    g.baseDamageScale = g.world.playerDamageScale;
    g.berserkT = 0;
    g.applyLoadout(true);
    g.coop.onMissionStart();
    if (aa) g.aa.start();
    // New player materials and optional interior assets can appear after the tutorial.
    // Warm each mission behind its fade; renderer programs remain cached between missions.
    if (!this.prewarmed) {
      this.prewarmed = true;
      g.world.prewarm(scene => scene ? g.engine.renderStudio(scene, g.world.ditchingSea.camera, 1 / 60) : g.engine.render(1 / 60), g.engine.camera);
    } else g.world.warmMission(g.engine.camera);
    g.state = 'playing';
    g.distantBattle.reset();
    g.ui.hud(m.role, g.coop.phase === 'mission');
    if (aa) g.aa.mountHud();
    crewRoster.beginMission(g.world, g.ui, m.role);
    g.b17Damage.reset();
    g.ui.fadeTo(1);
    setTimeout(() => g.ui.fade(false), 50);
    g.input.lock();
    g.ui.banner(m.number ? `MISSION ${m.number} · ${m.target.toUpperCase()}` : m.date.toUpperCase(), m.title, 3800);
    // opening tips (touch controls get their own wording); Gunnery School teaches with its own cards
    const touch = document.body.classList.contains('touch');
    const tips = m.tutorial || aa ? [] : m.role === 'gunner'
      ? touch
        ? ['<kbd>Drag</kbd> to swing the gun · <kbd>Hold FIRE</kbd> to shoot', 'Lead the fighters — aim where they will be · <kbd>ZOOM</kbd> for the ring sight', 'Short bursts keep the barrel cool · tap a gun position to change seats']
        : ['<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire', 'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom', 'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position']
      : touch
        ? ['<kbd>Drag</kbd> on the left to fly · <kbd>FIRE</kbd> shoots', 'Put the K-14 sight ahead of the bandit and fire · <kbd>THR</kbd> lever for power', 'Fw 190s will come for you — keep turning · <kbd>VIEW</kbd> chase view']
        : ['<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires', 'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle', 'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view'];
    tips.forEach((t, i) => setTimeout(() => { if (g.state === 'playing' && g.mission === m) g.ui.tip(t, 4200); }, 4200 + i * 4600));
    setTimeout(() => {
      if (g.state !== 'playing' || aa || g.mission !== m) return;
      if (m.role === 'gunner') g.world.callout('start', 'Pilot', `Pilot to crew: we're at altitude. Test fire your guns, and keep your eyes open.`, 0, 3);
      else if (m.bombers > 0) g.world.callout('start', 'Lead', 'Blue flight, form up on the bombers. Keep your eyes peeled for bandits.', 0, 3); // raid/night/strafe ops have no bombers
    }, 2500);
    g.onboarding.onMissionStart(m);
    g.service.onMissionStart(m);
    analytics.missionStart(m);
    g.skills.onMissionStart();
  }

  // A round is over: the last round of a campaign mission completes it; otherwise the
  // merit earned so far is paid out and the hangar opens before the next, harder round.
  endRound(m: Mission) {
    const g = this.g, w = g.world;
    const last = Number.isFinite(m.rounds ?? 1) && g.roundIdx >= (m.rounds ?? 1) - 1;
    Chatter.onRoundEnd(last);
    if (last) { g.director.roundsComplete = true; return; }
    if (g.coop.flying) { this.startNextRound(); return; }
    const earned = g.coop.phase === 'mission' ? 0 : Math.round((g.score - this.scoreBanked) * g.loadout.scoreMult);
    g.prog.earn(earned);
    this.scoreBanked = g.score;
    const kills = w.stats.kills - this.roundKills0;
    g.state = 'paused';
    g.engine.paused = true;
    g.input.unlock();
    queueCrate(g.prog, { kills, merit: earned, round: g.roundIdx + 1 });
    g.ui.hangar(g.prog, m.role, {
      title: `ROUND ${g.roundIdx + 1} CLEARED`,
      sub: `${kills} kills this round · +${earned} merit`,
      next: Number.isFinite(m.rounds ?? 1) ? `Round ${g.roundIdx + 2} of ${m.rounds}` : `Round ${g.roundIdx + 2}`,
    }, () => this.startNextRound());
  }

  private startNextRound() {
    const g = this.g, w = g.world;
    // survival: every round brings different weather and light
    if (g.mission && g.mission.duration === Infinity) g.setWeather(ROUND_WEATHER[Math.floor(Math.random() * ROUND_WEATHER.length)]);
    g.coop.onRound();
    g.roundIdx++;
    g.roundT0 = w.time;
    g.director.beginRound();
    this.roundKills0 = w.stats.kills;
    crewRoster.onRoundStart(g.prog.perks); // apply next-round assignments before the engineer repairs
    // ground crew patch-up between rounds
    const pl = w.player;
    if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.3 * crewRoster.effects().repair);
    g.applyLoadout(true);
    g.skills.onRoundStart();
    g.state = 'playing';
    g.engine.paused = false;
    g.input.lock();
    g.ui.banner(`ROUND ${g.roundIdx + 1}`, g.roundIdx >= 3 ? 'They\'re sending everything they have' : 'More fighters inbound', 2800);
    Chatter.onRoundStart();
  }

  finish(success: boolean, reason: string, bailOut = false) {
    this.g.bombardier.leave();
    const g = this.g;
    if (g.endResult) return;
    if (g.ditching.begin(success, () => g.showDebrief())) return;
    g.endResult = { success, reason };
    this.endTimer = success ? 3.5 : bailOut ? BAIL_SEQ_TIME : 5;
    g.state = 'ending';
    if (bailOut) this.startBailOut();
    else if (g.aa.active) g.ui.banner('Airfield lost', reason, 3500);
    else g.ui.banner(success ? 'ALL GUNS SECURE' : 'MISSION FAILED', success ? 'Mission complete' : 'Shot down', 3500);
    if (success) this.endTimer = g.cine.queueFlyby(this.endTimer, () => { this.endTimer = 0; });
  }

  // The 'ending' state, once per frame after the controllers: count down to the debrief
  // (the bail-out sequence or the fly-by can cut it short)
  updateEnding(dt: number) {
    this.endTimer -= dt;
    if (this.bailT >= 0) this.updateBailOut(dt);
    if (this.endTimer <= 0) this.showDebrief();
  }

  // Gunner's B-17 shot down: the crew bails out before the debrief (BailOutCinematic.ts).
  // Driven from the ending state, so it freezes with the game; a key skips it.
  private startBailOut() {
    const g = this.g;
    this.bailT = 0;
    g.ui.banner('BAIL OUT! BAIL OUT!', 'Crew, abandon the aircraft', 3000);
    g.b17Damage.abandon();
    this.bailCine.start(g.engine, g.world, g.gunner, g.ui, g.b17Damage.escape);
  }

  private updateBailOut(dt: number) {
    const g = this.g;
    this.bailT += dt;
    const f = this.bailCine.update(dt, g.input);
    g.trauma = Math.min(1, g.trauma + f.jolt);
    g.damageT = Math.max(g.damageT, f.flash);
    if (f.done) this.endTimer = 0;
  }

  showDebrief() {
    const g = this.g;
    if (g.state === 'debrief') return; // outcome/merit must be paid only once
    if (g.coop.showDebrief()) return;
    if (!g.ditching.ditched && g.endResult?.success && g.bookends.landing(g.mission!, () => g.showDebrief())) return; // landing scene first
    const m = g.mission!;
    const w = g.world;
    const r = g.endResult!;
    g.state = 'debrief';
    g.input.unlock();
    sound.stopSpeech();
    sound.music.stinger(r.success);
    sound.setMode('menu');
    const acc = w.stats.shots > 0 ? w.stats.hits / w.stats.shots : 0;
    achievements.endMission(r.success, w.stats.shots, w.stats.hits);
    crewRoster.endMission(r.success);
    const survivors = w.bombers().filter((b) => b.alive).length;
    const survival = m.duration === Infinity;
    if (r.success) g.score += 500 + survivors * 50 + Math.round(acc * 300);
    g.score = g.modes.finalScore(m, g.score);
    const medals: string[] = secondTourMedal(m, r.success);
    if (r.success && !survival) medals.push('Air Medal');
    if (w.stats.kills >= 5) medals.push(m.role === 'pilot' ? 'Ace in a Day' : 'Distinguished Flying Cross');
    if (w.stats.kills >= 8 && w.combatLosses <= 1) medals.push('Silver Star');   // set-piece losses left out
    if (w.crewWounded > 0) medals.push('Purple Heart');
    medals.push(...g.service.bonusMedals(m, r.success, medals));
    const survivalWave = g.director.survivalWave;
    if (survival) {
      g.progress.survival.push({ name: 'You', score: g.score, waves: m.round ? g.roundIdx + (r.success ? 1 : 0) : Math.max(0, survivalWave - (r.success ? 0 : 1)), role: m.role, date: new Date().toLocaleDateString() });
      g.progress.survival.sort((a, b) => b.score - a.score);
      g.progress.survival = g.progress.survival.slice(0, 20);
    } else {
      const idx = CAMPAIGN.findIndex((c) => c.id === m.id);
      if (r.success && idx >= 0) g.progress.unlocked = Math.max(g.progress.unlocked, Math.min(CAMPAIGN.length - 1, idx + 1));
      const prev = new Set(g.progress.medals[m.id] ?? []);
      medals.forEach((x) => prev.add(x));
      g.progress.medals[m.id] = [...prev];
      g.progress.best[m.id] = Math.max(g.progress.best[m.id] ?? 0, g.score);
    }
    g.saveProgress();
    // merit for the Armory: the mission score (half if it failed)
    const merit = Math.round((g.score - this.scoreBanked) * (r.success ? 1 : 0.5) * g.loadout.scoreMult * campaignMeritMult(m, g.progress));
    g.prog.earn(merit);
    const idx = CAMPAIGN.findIndex((c) => c.id === m.id);
    const d: DebriefData = {
      success: r.success, title: m.title, reason: r.reason, kills: w.stats.kills, accuracy: acc,
      bombersLost: w.stats.bombersLost, bombersTotal: m.bombers, time: w.time, score: g.score, medals,
      survival, waves: m.round ? g.roundIdx + (r.success ? 1 : 0) : Math.max(0, survivalWave - 1), nextAvailable: r.success && idx >= 0 && idx < CAMPAIGN.length - 1,
      rounds: w.stats.shots, hits: w.stats.hits, bestStreak: g.tally.bestStreak,
      closestKill: g.tally.closestKill === Infinity ? null : g.tally.closestKill,
      killsByGun: m.role === 'gunner' ? g.tally.killsByGun() : undefined,
      escape: g.b17Damage.escape.length ? g.b17Damage.escape : undefined,
      merit, ditched: g.ditching.ditched, points: g.prog.points, bombing: g.bombardier.result ?? undefined,
    };
    // the crew-room scene first after a story mission (CrewRoomScene.ts); `then` runs once the map is up
    const toMap = (then?: unknown) => crewRoomScene.play(m, () => { g.showCampaign(); if (typeof then === 'function') then(); });
    const h = {
      next: toMap, // campaign map: next operation card + optional side raids
      retry: () => g.showBriefing(m),
      menu: () => g.startMenu(),
      armory: () => g.ui.armory(g.prog, () => g.ui.debrief({ ...d, merit: undefined, points: g.prog.points }, h)),
    };
    g.ui.debrief(d, h);
    pushSave(); // progress to the cloud after every mission
    // online leaderboard: survival per role, campaign per mission
    const host = document.querySelector<HTMLElement>('#debrief .box');
    const board = leaderboardMode(m) ?? (survival ? `survival-${m.role}` : `campaign-${m.id}`);
    if (host && !isSecondTourId(m.id) && !isChapterMission(m.id)) mountLeaderboard(host, board, 'ONLINE LEADERBOARD', { name: '', mode: board, score: g.score, kills: w.stats.kills, rounds: g.roundIdx + 1, duration: d.time });
    mountShare(host, g.engine, () => shareStamp(g), () => ({ title: m.title, kills: d.kills, score: d.score, success: d.success, survival, waves: d.waves, role: m.role }));
    analytics.missionEnd(m, d);
    g.service.onDebrief(m, d, medals);
    mountCampaignReport(m, { success: r.success, kills: w.stats.kills, bombersLost: w.stats.bombersLost, bombersTotal: m.bombers, score: g.score, ditched: g.ditching.ditched }, g.prog, g.progress, toMap);
    g.specials.nemesis.onDebrief(m); // named Experten: this mission's ace outcomes (NemesisRuntime.ts)
    crewRoomScene.capture(g, m, d); // the outcome the crew-room scene talks about
  }
}
