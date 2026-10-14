import { hudToast } from '../ui/HudToast';
// Persistent achievements: per-mission tracking, the unlock toast and the Credits-panel list.
// Self-contained so Game.ts only needs a few one-line hooks. Progress lives in localStorage
// (per browser), and every storage call is guarded because it can be blocked or full.
import type { Mission } from './Missions';
import {
  type CareerData, RANKS, heavyKills, lifetimeAccuracy, stationsScored, totalMedals, typesDowned,
} from './Career';
import { tx } from '../i18n';
import { fmtDate } from '../ui/serviceCommon';
import { FREE_LOOK_S, RAID_KINDS, SEARCHLIGHT_KILLS, raidKindsFlown } from './Feats';

const STORE_KEY = 'sws3d.achievements.v1';
// Accuracy needs a minimum sample so a lucky burst of a few rounds can't unlock it
const SHARP_MIN_SHOTS = 50;
const SHARP_ACCURACY = 0.3;
const ACE_KILLS = 5;
const SURVIVOR_WAVE = 5;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

// goal + stat: a lifetime counter read from the career record (progress bar on the Trophies
// screen, unlocked by checkStats). Without them the achievement is event-driven.
// icon: an emblem on the trophy cup (TrophyScreen ICONS; default the star). secret: name and
// description stay hidden on the Trophies screen until it is unlocked.
export interface AchievementDef { id: string; name: string; desc: string; rarity: Rarity; goal?: number; stat?: (c: CareerData) => number; icon?: string; secret?: boolean }

const kills = (t: string) => (c: CareerData) => c.killsByType[t] ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'goldfishClub', name: 'Goldfish Club', desc: 'Survive ditching and be rescued from the sea.', rarity: 'rare' },
  { id: 'firstBlood', name: 'First Blood', desc: 'Confirm your first kill.', rarity: 'common' },
  { id: 'ace', name: 'Ace in a Day', desc: `Confirm ${ACE_KILLS} kills in a single mission.`, rarity: 'uncommon' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Complete a mission without taking a single hit.', rarity: 'rare' },
  { id: 'flakSurvivor', name: 'Flak Survivor', desc: 'Complete a mission that flies through flak.', rarity: 'common' },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: `Finish a mission with over ${SHARP_ACCURACY * 100}% accuracy (${SHARP_MIN_SHOTS}+ rounds fired).`, rarity: 'uncommon' },
  { id: 'wingClipper', name: 'Wing Clipper', desc: 'Shoot a wing off an enemy fighter.', rarity: 'uncommon' },
  { id: 'survivor', name: 'Survivor', desc: `Reach survival round ${SURVIVOR_WAVE}.`, rarity: 'uncommon' },
  // ---- the named Experten (Nemesis.ts, unlocked by NemesisRuntime) ----
  { id: 'expKill', name: 'Scratch One Experte', desc: 'Shoot down a named Luftwaffe Experte.', rarity: 'uncommon' },
  { id: 'expGrudge', name: 'Settled Score', desc: 'Shoot down an Experte who hurt your crew or got away from you before.', rarity: 'rare' },
  { id: 'expWanted', name: 'Most Wanted', desc: 'Shoot down the Luftwaffe\'s most wanted Experte and collect the bounty.', rarity: 'epic' },
  { id: 'expFive', name: 'Knight Hunter', desc: 'Shoot down five named Experten.', rarity: 'epic' },
  // ---- lifetime: kills ----
  { id: 'kills25', name: 'Bandit Hunter', desc: 'Confirm 25 kills.', rarity: 'common', goal: 25, stat: (c) => c.kills },
  { id: 'kills100', name: 'Centurion', desc: 'Confirm 100 kills.', rarity: 'uncommon', goal: 100, stat: (c) => c.kills },
  { id: 'kills500', name: 'Scourge of the Luftwaffe', desc: 'Confirm 500 kills.', rarity: 'epic', goal: 500, stat: (c) => c.kills },
  { id: 'kills1000', name: 'Legend of the Eighth', desc: 'Confirm 1,000 kills.', rarity: 'legendary', goal: 1000, stat: (c) => c.kills },
  { id: 'fw190x50', name: 'Butcher-Bird Hunter', desc: 'Down 50 Fw 190s.', rarity: 'uncommon', goal: 50, stat: kills('fw190') },
  { id: 'bf109x25', name: 'Gustav Grounded', desc: 'Down 25 Bf 109s.', rarity: 'uncommon', goal: 25, stat: kills('bf109') },
  { id: 'heavy10', name: 'Heavy Hitter', desc: 'Down 10 heavies (Bf 110 / Ju 88).', rarity: 'uncommon', goal: 10, stat: heavyKills },
  { id: 'heavy50', name: 'Destroyer of Destroyers', desc: 'Down 50 heavies (Bf 110 / Ju 88).', rarity: 'rare', goal: 50, stat: heavyKills },
  { id: 'jets5', name: 'Jet Age', desc: 'Down 5 Me 262 jets.', rarity: 'rare', goal: 5, stat: kills('me262') },
  { id: 'komet', name: 'Komet Catcher', desc: 'Down an Me 163 rocket fighter.', rarity: 'uncommon', goal: 1, stat: kills('me163') },
  { id: 'allTypes', name: 'Know Your Enemy', desc: 'Down every enemy type: Fw 190, Bf 109, Bf 110, Ju 88, Me 262 and Me 163.', rarity: 'rare', goal: 6, stat: typesDowned },
  { id: 'boss1', name: 'Giant Killer', desc: 'Bring down a boss.', rarity: 'rare', goal: 1, stat: (c) => c.bosses },
  { id: 'boss10', name: 'Dragon Slayer', desc: 'Bring down 10 bosses.', rarity: 'epic', goal: 10, stat: (c) => c.bosses },
  { id: 'pickleBarrel', name: 'Pickle Barrel', desc: 'Place more than 80% of the bomb pattern within 1,000 ft of the aiming point.', rarity: 'epic' },
  { id: 'streak3', name: 'Triple Threat', desc: 'Chain a 3-kill streak.', rarity: 'common', goal: 3, stat: (c) => c.bestStreak },
  { id: 'streak6', name: 'Chain Reaction', desc: 'Chain a 6-kill streak.', rarity: 'epic', goal: 6, stat: (c) => c.bestStreak },
  { id: 'pilot50', name: 'Mustang Ace', desc: 'Down 50 fighters flying the P-51.', rarity: 'rare', goal: 50, stat: (c) => c.killsByRole.pilot },
  { id: 'allGuns', name: 'Every Gun Position', desc: 'Score kills from all five B-17 gun positions.', rarity: 'rare', goal: 5, stat: stationsScored },
  { id: 'marksman', name: 'Marksman', desc: 'Hold 25%+ lifetime accuracy over 3,000+ rounds.', rarity: 'rare', goal: 25, stat: (c) => (c.shots >= 3000 ? Math.floor(lifetimeAccuracy(c) * 100) : 0) },
  // ---- lifetime: service ----
  { id: 'missions10', name: 'Ten in the Logbook', desc: 'Fly 10 missions.', rarity: 'common', goal: 10, stat: (c) => c.missions },
  { id: 'tour25', name: 'Tour of Duty', desc: 'Complete 25 missions, a full 1944 bomber tour.', rarity: 'rare', goal: 25, stat: (c) => c.wins },
  { id: 'tour50', name: 'Second Tour', desc: 'Complete 50 missions.', rarity: 'epic', goal: 50, stat: (c) => c.wins },
  { id: 'campaign7', name: 'Big Week Veteran', desc: 'Complete 7 different campaign missions.', rarity: 'rare', goal: 7, stat: (c) => c.campaignWins.length },
  { id: 'saved100', name: 'Big Friends\' Friend', desc: 'Bring 100 bombers home from successful missions.', rarity: 'uncommon', goal: 100, stat: (c) => c.bombersSaved },
  { id: 'hours1', name: 'Logbook', desc: 'Spend an hour in the air.', rarity: 'uncommon', goal: 60, stat: (c) => Math.floor(c.seconds / 60) },
  { id: 'hours10', name: 'Old Hand', desc: 'Spend ten hours in the air.', rarity: 'epic', goal: 600, stat: (c) => Math.floor(c.seconds / 60) },
  { id: 'overdrive25', name: 'Pour It On', desc: 'Use Overdrive 25 times.', rarity: 'common', goal: 25, stat: (c) => c.overdrives },
  // ---- rank and medals ----
  { id: 'rankLt', name: 'Commissioned', desc: 'Earn a commission: reach Lieutenant.', rarity: 'uncommon', goal: RANKS[3].xp, stat: (c) => c.xp },
  { id: 'rankMaj', name: 'The Major', desc: 'Reach the rank of Major.', rarity: 'legendary', goal: RANKS[5].xp, stat: (c) => c.xp },
  { id: 'medals10', name: 'Fruit Salad', desc: 'Earn 10 medals.', rarity: 'uncommon', goal: 10, stat: totalMedals },
  { id: 'medals50', name: 'Chest Full of Ribbons', desc: 'Earn 50 medals.', rarity: 'epic', goal: 50, stat: totalMedals },
  { id: 'purple3', name: 'Walking Wounded', desc: 'Earn 3 Purple Hearts.', rarity: 'uncommon', goal: 3, stat: (c) => c.medals['Purple Heart'] ?? 0 },
  // ---- daily ----
  { id: 'daily1', name: 'Orders Received', desc: 'Complete a daily order.', rarity: 'common', goal: 1, stat: (c) => c.dailyDone },
  { id: 'daily25', name: 'Reliable', desc: 'Complete 25 daily orders.', rarity: 'rare', goal: 25, stat: (c) => c.dailyDone },
  { id: 'dailyAll', name: 'Clean Sheet', desc: 'Complete all three daily orders in one day.', rarity: 'uncommon', goal: 1, stat: (c) => c.dailyPerfectDays },
  { id: 'dailyRun', name: 'Daily Sortie', desc: 'Fly a Daily Run.', rarity: 'common', goal: 1, stat: (c) => c.dailyRuns },
  // ---- Phase 5 content (conditions: Feats.ts; hooks: FeatWatch.ts) ----
  { id: 'raider', name: 'Raider', desc: 'Fly a side raid from the campaign map.', rarity: 'common', icon: 'map' },
  { id: 'strategist', name: 'Strategist', desc: 'Fly a side raid of every kind: rail yards, airfields, oil, U-boat pens and aircraft factories.', rarity: 'rare', icon: 'compass', goal: RAID_KINDS.length, stat: () => raidKindsFlown() },
  { id: 'notOverMyField', name: 'Not Over My Field', desc: 'Win Defend the Field without a single bomber getting through.', rarity: 'epic', icon: 'field' },
  { id: 'nightFighter', name: 'Steinbock Broken', desc: 'Win Night Fighter.', rarity: 'uncommon', icon: 'moon' },
  { id: 'searchlightHunter', name: 'Searchlight Hunter', desc: `Shoot down ${SEARCHLIGHT_KILLS} bombers caught in the searchlights in one Night Fighter mission.`, rarity: 'rare', icon: 'beam' },
  { id: 'trainBuster', name: 'Train Buster', desc: 'Stop the locomotive yourself before the train reaches the tunnel.', rarity: 'uncommon', icon: 'train' },
  { id: 'endOfLine', name: 'End of the Line', desc: 'Destroy the whole supply train in Train Busting: the locomotive and all nine wagons.', rarity: 'epic', icon: 'rails' },
  { id: 'teamwork', name: 'Teamwork', desc: 'Order Blue Two to attack your target and have him make the kill.', rarity: 'uncommon', icon: 'wing' },
  { id: 'weatherMan', name: 'Weather Man', desc: 'Complete Into the Front after the storm arrives.', rarity: 'uncommon', icon: 'storm' },
  { id: 'gotHimFirst', name: 'Got Him First', desc: 'Shoot down the burning Fw 190 before it rams the Fortress.', rarity: 'rare', icon: 'cross' },
  { id: 'broughtHerHome', name: 'Brought Her Home', desc: 'Survive a belly landing.', rarity: 'rare', icon: 'wheel', secret: true },
  { id: 'bigGunSpotter', name: 'Big Gun Spotter', desc: 'Shoot down an Me 410 while it lines up its 50 mm cannon.', rarity: 'rare', icon: 'shell' },
  { id: 'he111x10', name: 'Heinkel Hunter', desc: 'Down 10 He 111 bombers.', rarity: 'uncommon', icon: 'bomber', goal: 10, stat: kills('he111') },
  { id: 'do335', name: 'Broken Arrow', desc: 'Down a Do 335 Pfeil.', rarity: 'rare', icon: 'arrow', goal: 1, stat: kills('do335') },
  { id: 'specialist', name: 'Specialist', desc: 'Fill a whole branch of the skill tree.', rarity: 'rare', icon: 'tree' },
  { id: 'warGames', name: 'War Games', desc: 'Win a Custom Battle.', rarity: 'common', icon: 'flag' },
  { id: 'weeklyWarrior', name: 'Weekly Warrior', desc: 'Complete a Weekly Challenge.', rarity: 'uncommon', icon: 'calendar' },
  { id: 'directorsCut', name: 'Director\'s Cut', desc: 'Save a moment in the replay theatre.', rarity: 'common', icon: 'film' },
  { id: 'fullCrew', name: 'Full Crew', desc: 'Fly a co-op mission with a friend.', rarity: 'uncommon', icon: 'crew' },
  { id: 'recognition', name: 'Recognition Expert', desc: 'Score 10/10 in the aircraft recognition quiz.', rarity: 'rare', icon: 'eye' },
  { id: 'friendOrFoe', name: 'Friend or Foe?', desc: 'Score 0/10 in the aircraft recognition quiz.', rarity: 'uncommon', icon: 'question', secret: true },
  { id: 'roomWithView', name: 'Room with a View', desc: `Spend ${FREE_LOOK_S} seconds looking around with free look in one mission.`, rarity: 'common', icon: 'look', secret: true },
];

// Something that follows every mission (FeatWatch): told when it begins and at the debrief
export interface MissionWatcher { begin?(m: Mission): void; end?(success: boolean): void }

interface MissionTrack {
  hitsTaken: number;
  startedDamaged: boolean;
  flak: boolean;
}

function readStore(): Record<string, number> {
  try {
    const s = localStorage.getItem(STORE_KEY);
    const o = s ? JSON.parse(s) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
#achv-toasts { position: fixed; top: 14px; right: 14px; z-index: 45; display: flex; flex-direction: column; gap: 10px; pointer-events: none; max-width: min(340px, calc(100vw - 28px)); }
.achv-toast { display: flex; gap: 12px; align-items: center; background: rgba(10,10,6,0.88); border: 1px solid rgba(185,167,111,0.65); box-shadow: 0 6px 24px rgba(0,0,0,0.45); padding: 12px 14px; color: #ece6d2; font-family: 'IBM Plex Mono', monospace; opacity: 0; transform: translateX(24px); transition: opacity 0.4s, transform 0.4s; }
.achv-toast.show { opacity: 1; transform: none; }
.achv-star { font-size: 26px; color: #e0b65a; text-shadow: 0 0 10px rgba(224,182,90,0.6); line-height: 1; }
.achv-k { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #b9a76f; }
.achv-n { font-family: Oswald, sans-serif; font-size: 18px; letter-spacing: 1px; }
.achv-d { font-size: 12px; color: #a9a48f; line-height: 1.4; }
.achv-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 18px; }
.achv-count { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #b9a76f; }
.achv-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
.achv-list li { display: flex; gap: 10px; align-items: flex-start; border: 1px solid rgba(185,167,111,0.2); background: rgba(255,255,255,0.03); padding: 9px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #8f8a78; line-height: 1.5; }
.achv-list li.got { color: #ece6d2; border-color: rgba(185,167,111,0.55); }
.achv-list li.got .achv-mark { color: #e0b65a; }
.achv-mark { width: 14px; flex: none; text-align: center; }
.achv-list small { display: block; font-size: 11px; color: #b9a76f; letter-spacing: 1px; }`;
  document.head.appendChild(st);
}

class Achievements {
  private unlocked: Record<string, number>;
  private mission: MissionTrack | null = null;
  private queue: AchievementDef[] = [];
  private watchers: MissionWatcher[] = [];

  constructor() { this.unlocked = readStore(); }

  watch(w: MissionWatcher) { this.watchers.push(w); }

  has(id: string) { return this.unlocked[id] !== undefined; }
  unlockedAt(id: string): number | undefined { return this.unlocked[id]; }
  count() { return ACHIEVEMENTS.filter((a) => this.has(a.id)).length; }

  // 0..1 progress of a stat-driven achievement (1 once unlocked; 0 for event-driven ones)
  progress(def: AchievementDef, c: CareerData): number {
    if (this.has(def.id)) return 1;
    if (!def.stat || !def.goal) return 0;
    return Math.max(0, Math.min(1, def.stat(c) / def.goal));
  }

  // Unlock every lifetime achievement whose counter has reached its goal
  checkStats(c: CareerData) {
    for (const a of ACHIEVEMENTS) if (a.stat && a.goal && !this.has(a.id) && a.stat(c) >= a.goal) this.unlock(a.id);
  }

  unlock(id: string) {
    if (this.has(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    this.unlocked[id] = Date.now();
    try {
      // merge with anything another tab stored meanwhile
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...this.unlocked }));
    } catch { /* storage unavailable: the unlock lasts for this session only */ }
    this.queue.push(def);
    this.pump();
  }

  // ---- mission hooks ----
  beginMission(m: Mission) {
    this.mission = { hitsTaken: 0, startedDamaged: !!m.playerDamaged, flak: !!m.flak };
    for (const w of this.watchers) w.begin?.(m);
  }

  onPlayerHit() {
    if (this.mission) this.mission.hitsTaken++;
  }

  // `kills` is the mission's confirmed-kill count including this kill; `cause` is how the victim went down
  onConfirmedKill(kills: number, cause: string) {
    if (!this.has('firstBlood')) this.unlock('firstBlood');
    if (kills >= ACE_KILLS) this.unlock('ace');
    if (cause === 'wingL' || cause === 'wingR') this.unlock('wingClipper');
  }

  onSurvivalWave(wave: number) {
    if (wave >= SURVIVOR_WAVE) this.unlock('survivor');
  }

  // Called once when the debrief appears; shots/hits are the mission's gunnery stats
  endMission(success: boolean, shots: number, hits: number) {
    const t = this.mission;
    this.mission = null;
    if (!t) return;
    if (success && t.flak) this.unlock('flakSurvivor');
    if (success && t.hitsTaken === 0 && !t.startedDamaged) this.unlock('untouchable');
    if (shots >= SHARP_MIN_SHOTS && hits / shots > SHARP_ACCURACY) this.unlock('sharpshooter');
    for (const w of this.watchers) w.end?.(success);
  }

  // ---- toast ----
  private pump() {
    for (const def of this.queue) hudToast(tx('Achievement unlocked · {rarity}', { rarity: tx(RARITY_LABEL[def.rarity]) }), def.name, def.desc);
    this.queue.length = 0;
  }

  // ---- Credits list (compact: the full cabinet is on the Trophies screen) ----
  listHtml(): string {
    ensureStyle();
    const got = ACHIEVEMENTS.filter((a) => this.has(a.id)).sort((a, b) => this.unlocked[b.id] - this.unlocked[a.id]);
    const rows = got.slice(0, 6).map((a) => `<li class="got"><span class="achv-mark">★</span><span>${tx(a.name)} — ${tx(a.desc)}<small>${tx('Unlocked {date}', { date: fmtDate(this.unlocked[a.id]) })}</small></span></li>`).join('');
    return `<div class="achv-head"><div class="kicker">${tx('ACHIEVEMENTS')}</div><span class="achv-count">${got.length}/${ACHIEVEMENTS.length}</span></div>
      <ul class="achv-list">${rows || `<li>${tx('None yet: fly a mission.')}</li>`}</ul>
      <div class="achv-d" style="margin-top:8px">${tx('The full trophy cabinet is on the title menu: Trophies.')}</div>`;
  }
}

export const achievements = new Achievements();
export const achievementsHtml = () => achievements.listHtml();
