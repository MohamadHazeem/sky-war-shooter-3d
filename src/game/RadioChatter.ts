// Crew and flight instructions over the radio: small trigger functions for game events.
// Every line goes through World.callout, so it gets the subtitle, the callout cooldowns and the
// recorded voice clip (Voice.ts, found by its text) exactly like the existing radio lines.
// Texts and speakers come from the generated table (tools/voice/lines.json -> voiceLines.ts).
//
// Usage: attachRadioChatter(world, mission.role) once per mission, then call the on*()
// functions from the game events. Each is a no-op before attach and safe to call every frame
// (the callout cooldowns throttle repeats).
import { VOICE_LINES, VoiceLineId } from '../audio/voiceLines';
import type { World } from '../world/World';
import type { StationId } from '../world/B17Layout';

export interface RadioSink { callout(key: string, speaker: string, text: string, cooldown?: number, priority?: number): void }
export type MissionRole = 'gunner' | 'pilot';

let sink: RadioSink | null = null;
let role: MissionRole = 'gunner';
let rounds = 0;
let inPass = false, passShots = 0, passHits = 0, lastContact = 0, quietAt = 30;
let checkAt = 0, replyAt = 0, wounded = 0;
const CONTACT_PREFIX = {
  fw190: 'pfx_ss_fw190', bf109: 'pfx_ss_bf109', bf110: 'pfx_ss_bf110', ju88: 'pfx_ss_ju88',
  me262: 'pfx_ss_me262', me163: 'pfx_ss_me163', he111: 'pfx_ss_he111', me410: 'pfx_ss_me410', do335: 'pfx_ss_do335',
} as const;


const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

// One line through World.callout. key groups lines that share a cooldown.
function line(id: VoiceLineId, key: string, cooldown: number, priority: number, speaker?: string) {
  if (!sink) return;
  const l = VOICE_LINES[id];
  const who = speaker && (l.speakers as readonly string[]).includes(speaker) ? speaker : pick(l.speakers);
  sink.callout('rc_' + key, who, l.text, cooldown, priority);
}

// Start of a mission (resets the round counter)
export function attachRadioChatter(world: RadioSink, missionRole: MissionRole) {
  sink = world;
  role = missionRole;
  rounds = 0;
  inPass = false; passShots = passHits = lastContact = checkAt = replyAt = wounded = 0; quietAt = 30;
}

export function detachRadioChatter() { sink = null; }

// Player shot down a fighter. streak = kills in quick succession (Game.streak).
export function onFighterKilled(streak = 1) {
  if (role === 'pilot') { line(pick(['rc_lead_splash', 'rc_lead_nice'] as const), 'kill', 6, 1); return; }
  if (streak >= 2) line('rc_kill_streak', 'streak', 8, 2);
  else line(pick(['rc_kill_good', 'ss_kill', 'rc_kill_chute'] as const), 'kill', 8, 1);
}

// Fighters are attacking through a gun position the player is not manning: tell him which
// gun to take. 'nose' = head-on attack. Pilot missions: "Bandits on the bombers".
export function onThreatAt(station: StationId | 'nose') {
  if (role === 'pilot') { line('rc_lead_bombers', 'threat', 20, 2); return; }
  const id: Record<StationId | 'nose', VoiceLineId> = {
    tail: 'rc_threat_tail', ball: 'rc_threat_ball', top: 'rc_threat_top',
    waistL: 'rc_threat_waist_left', waistR: 'rc_threat_waist_right', nose: 'rc_threat_nose',
  };
  line(id[station], 'threat_' + station, 15, 2);
}

// Generic "change guns" call when the attack shifts to the other side
export function onSwitchGun() { if (role === 'gunner') line('rc_switch_gun', 'switch', 20, 1); }

// A fighter wave / round begins. The first one of the mission gets the stand-by call.
export function onRoundStart() {
  const first = rounds++ === 0;
  if (role === 'pilot') line(first ? 'rc_lead_engage' : 'rc_lead_bombers', 'round', 10, 2);
  else line(first ? 'rc_round_start' : 'rc_next_wave', 'round', 10, 2);
}

// A wave is cleared. last = the final one (mission won / heading home).
export function onRoundEnd(last = false) {
  if (role === 'pilot') line(last ? 'rc_bigfriend_thanks' : 'rc_lead_clear', 'roundend', 10, 2);
  else line(last ? 'rc_going_home' : 'rc_round_over', 'roundend', 10, 2);
}

// Quiet stretch between waves
export function onLull() { line(role === 'pilot' ? 'rc_lead_regroup' : 'rc_lull', 'lull', 40, 0); }

// Fighters broke off and are turning back in
export function onRegroup() { line(role === 'pilot' ? 'rc_lead_regroup' : 'rc_regroup', 'regroup', 25, 1); }

// The player's aircraft took hits. heavy = cannon / big damage.
export function onPlayerHit(heavy = false) {
  if (role === 'pilot') { if (heavy) line('rc_lead_smoke', 'hit', 20, 2); return; }
  if (heavy) line('rc_hit', 'hit', 12, 2);
  else line(pick(['rc_hit_check', 'rc_hit_holding'] as const), 'hitlight', 30, 1);
}

// Pilot throws the bomber around (flak, head-on pass)
export function onEvasive() { if (role === 'gunner') line('rc_evasive', 'evasive', 25, 2); }

// Long bursts / ammo running down. low = ammo nearly out rather than just long bursts.
export function onAmmo(low = false) { if (role === 'gunner') line(low ? 'rc_ammo_low' : 'rc_ammo_short', 'ammo', 30, 1); }

// The player fired through a whole pass without a hit
export function onMissedPass() { if (role === 'gunner') line('ss_miss', 'miss', 25, 1); }

// A fighter is closing head-on / point-blank on the player's bomber
export function onEnemyClose() { if (role === 'gunner') line('rc_close', 'close', 15, 1); }

// Fighters are going after a damaged bomber in the formation
export function onStragglerAttacked() { line(role === 'pilot' ? 'rc_lead_bombers' : 'rc_cripples', 'cripples', 30, 1); }

// P-51: an enemy is behind the player. urgent = in firing range.
export function onBanditOnSix(urgent = false) {
  if (role === 'pilot') line(urgent ? 'rc_lead_six' : 'rc_lead_check_six', 'six', 8, urgent ? 3 : 2);
  else line('rc_threat_tail', 'threat_tail', 15, 2);
}

// P-51: tell the player to break (dir = where the threat is coming from: break into it)
export function onBreak(dir: 'left' | 'right') { if (role === 'pilot') line(dir === 'left' ? 'rc_lead_break_left' : 'rc_lead_break_right', 'break', 8, 3); }

// P-51: an AI wingman shot one down
export function onWingmanKill() { if (role === 'pilot') line('rc_blue3_splash', 'wingkill', 15, 1); }

/** Identified type plus the existing recorded clock clip, in the navigator's voice. */
export function onContact(world: RadioSink, type: string, clock: string) {
  const id = CONTACT_PREFIX[type as keyof typeof CONTACT_PREFIX] ?? 'pfx_ss_fw190';
  const prefix = VOICE_LINES[id];
  world.callout('attack', 'Navigator', prefix.text + ' ' + clock + '!', 7, 2);
}

/** Stateful pass / check-in / quiet-time conversation. Called once per playing frame. */
export function updateInterphone(world: World) {
  if (role !== 'gunner' || !sink || !world.player?.alive) return;
  let nearby = false;
  for (const a of world.aircraft) if (a.team === 'axis' && a.alive && !a.falling && a.pos.distanceToSquared(world.player.pos) < 1440000) { nearby = true; break; }
  interphoneTick(world.time, nearby, world.stats.shots, world.stats.hits, Math.max(world.crew.woundedCount, world.crewWounded));
}

// Scalar entry point makes pass semantics testable without a renderer or AudioContext.
export function interphoneTick(time: number, nearby: boolean, shots: number, hits: number, hurts: number) {
  if (role !== 'gunner' || !sink || !Number.isFinite(time + shots + hits + hurts)) return;
  if (nearby) {
    if (!inPass) { inPass = true; passShots = shots; passHits = hits; }
    lastContact = time; quietAt = time + 35; checkAt = replyAt = 0;
  } else if (inPass && time - lastContact > 4) {
    inPass = false;
    if (shots - passShots >= 12 && hits === passHits) onMissedPass();
    checkAt = time + 5;
  }
  if (hurts > wounded) { line('ss_hurt', 'hurtcheck', 35, 2); quietAt = time + 40; }
  wounded = hurts;
  if (!nearby && checkAt && time >= checkAt) {
    checkAt = 0; replyAt = time + 6;
    line('ss_check', 'check', 35, 0);
  } else if (!nearby && replyAt && time >= replyAt) {
    replyAt = 0; line(hurts ? 'ss_hurt' : 'ss_clear', 'checkreply', 35, 0);
  } else if (!nearby && !inPass && time >= quietAt) {
    quietAt = time + 45; line('ss_quiet', 'quiet', 45, 0);
  }
}
