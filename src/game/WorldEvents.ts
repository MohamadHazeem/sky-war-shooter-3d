import type { Game } from './Game';
import { ENEMY_VARIANTS, EnemyType } from '../world/EnemyTypes';
import { Fighter } from '../world/Aircraft';
import { sound } from '../audio/Sound';
import { INTERPHONE_LEAD_S } from '../audio/Interphone';
import { voice as crewVoice } from '../audio/Voice';
import * as Chatter from './RadioChatter';
import { achievements } from './Achievements';
import { killFeedText } from '../ui/CombatFeedback';
import { crewRoster } from './CrewRoster';

// Game's handlers for the World's events (world.events.*), installed once by the Game
// constructor: crew radio + subtitles, kill scoring (combo, streaks, ace in a day, slow-mo
// rules, kill cam, chatter), losses, hits on the player (damage flash, shake, hit markers).
// Owns the kill-streak state; the director reads lastKillAt to time field promotions.
export class WorldEvents {
  streak = 0;
  lastKillAt = -99;
  private aceAwarded = false;
  private killCount = 0;

  constructor(private g: Game) {}

  // New mission (MissionFlow.startMission)
  reset() {
    this.streak = 0; this.lastKillAt = -99; this.aceAwarded = false; this.killCount = 0;
  }

  wire() {
    const g = this.g;
    const w = g.world;
    w.events.radio = (speaker, text, priority) => {
      // recorded crew voice (Voice.ts) when it has clips: it does its own interphone click
      const recorded = crewVoice.sayLine(speaker, text, priority);
      // interphone: call-click and static first, then the line and subtitle
      if (!recorded) sound.radioStatic();
      const voice = ['Pilot', 'Navigator', 'Tail', 'Top Turret', 'Ball Turret', 'Bombardier', 'Radio', 'Lead', 'Big Friend'].indexOf(speaker);
      setTimeout(() => {
        g.ui.subtitle(speaker, text);
        if (!recorded) sound.speak(text, Math.max(0, voice));
      }, INTERPHONE_LEAD_S * 1000);
    };
    w.events.kill = (victim, byPlayer, cause) => {
      if (g.aa?.active) { g.aa.onKill(victim, byPlayer); return; }
      crewRoster.onKill(victim, byPlayer);
      if (victim.team === 'axis') {
        if (byPlayer) {
          // paid at the multiplier held going in; the kill then builds the next step
          const base = victim instanceof Fighter ? (ENEMY_VARIANTS[victim.enemyType as EnemyType]?.score ?? 100) : 100;
          const pts = Math.round(base * (1 + g.roundIdx * 0.1) * g.combo.scoreMult * g.loadout.scoreMult);
          g.score += pts;
          g.combo.onKill();
          g.killsSincePerk++;
          this.killCount++;
          g.adaptive.onKill(w.time);
          if (g.loadout.berserk) g.berserkT = 6;
          const repair = g.loadout.killRepair + (g.loadout.vampire && this.killCount % 3 === 0 ? 0.1 : 0);
          if (repair) {
            const pl = w.player;
            if (pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * repair * crewRoster.effects().repair);
            if (g.mission?.role === 'gunner') g.gunner.coolBarrel();
          }
          g.feel.onKill(victim, pts);
          achievements.onConfirmedKill(w.stats.kills, cause ?? '');
          sound.confirm('kill_confirm');
          g.ui.feed(killFeedText(victim, g.loadout.weapon.name), 'mine');
          // streaks: kills in quick succession
          this.streak = w.time - this.lastKillAt < 9 ? this.streak + 1 : 1;
          this.lastKillAt = w.time;
          if (this.streak >= 2) {
            const label = this.streak === 2 ? 'Double' : this.streak === 3 ? 'Triple' : `${this.streak}×`;
            g.score += 50 * this.streak;
            g.ui.feed(`${label} — +${50 * this.streak}`, 'mine');
          }
          // debrief record: gun position that fired (gunner) and range at the kill
          const range = w.player ? victim.pos.distanceTo(w.player.pos) : Infinity;
          g.tally.recordKill(this.streak, range, g.mission?.role === 'gunner' ? w.playerStation : null);
          if (w.stats.kills >= 5 && !this.aceAwarded && !g.mission?.range) {
            this.aceAwarded = true;
            g.score += 500;
            g.ui.banner('FIVE CONFIRMED', 'Ace in a day', 3500);
            w.callout('ace', 'Pilot', 'That\'s five! You\'re an ace, gunner — drinks are on me tonight!', 0, 3);
          }
          g.hud.killMarkerT = 0.45;
          // slow motion only for kills that deserve it: heavies, bosses and aces, or a triple streak
          const big = victim instanceof Fighter && ['bf110', 'ju88', 'me410', 'he111'].includes(victim.enemyType);
          const special = victim instanceof Fighter && ((victim as any).boss || (victim as any).ace);
          if (special) g.slowmo = 1.4;
          else if (big || this.streak >= 3) g.slowmo = g.loadout.bulletTime ? 1.1 : 0.6;
          else if (g.loadout.bulletTime) g.slowmo = 0.35;
          g.cine.onKill(victim, this.streak);
          // a gunnery-range drone is an orange Fw 190 airframe with nobody in it: no type or chute calls
          const drone = !!g.mission?.range;
          const lines = ['Got him! He\'s going down!', 'You got him! Nice shooting!', 'He\'s smoking — he\'s finished!'];
          if (!drone) lines.push(victim.label === 'Bf 109' ? 'Scratch one Messerschmitt!' : 'Scratch one Focke-Wulf!');
          w.callout('kill', ['Tail', 'Pilot', 'Top Turret', 'Navigator'][Math.floor(Math.random() * 4)], lines[Math.floor(Math.random() * lines.length)], 3, 2);
          if (!drone) Chatter.onFighterKilled(this.streak);
        } else {
          g.ui.feed(killFeedText(victim, null));
          Chatter.onWingmanKill();
        }
      } else if (victim instanceof Fighter && !victim.isPlayer) {
        g.ui.feed('P-51 lost', 'loss');
      }
    };
    w.events.bomberLost = (b) => {
      g.ui.feed(`B-17 "${b.name}" going down`, 'loss');
      if (!b.ditched) sound.music.bomberLost(b.isPlayer);   // score 2.0: the loss stinger (bounded)
      if (!b.isPlayer && !b.scripted && !b.ditched) w.callout('lost' + b.id, 'Tail', `${b.name} is going down! Count the chutes!`, 1, 2);   // a set piece calls its own losses
      else if (b.isPlayer) w.callout('playerdown', 'Pilot', 'We\'ve had it! Bail out! Bail out!', 0, 3);
    };
    w.events.playerHit = (zone, heavy) => {
      g.b17Damage.hit(zone, heavy);
      if (heavy && g.mission?.role === 'gunner') {
        const life = g.gunner.survival, before = life.oxygen;
        life.hit(zone.includes('engine') || zone.includes('fuselage') || zone === 'top');
        if (!before && life.oxygen) w.callout('gs_oxygen', 'Pilot', 'Oxygen check! Reconnect your mask hose, gunner!', 30, 2);
      }
      Chatter.onPlayerHit(heavy);
      sound.airframeHit(heavy);
      achievements.onPlayerHit();
      g.damageT = Math.min(0.5, g.damageT + (heavy ? 0.22 : 0.08));
      // (cracked-glass overlay retired: it blocked the sight picture)
      if (zone === 'gunner') {
        g.ui.feed('You are wounded', 'loss');
        w.callout('wound', 'Navigator', 'Gunner\'s hit! Stay on that gun if you can!', 10, 2);
      }
    };
    w.events.playerHitFrom = (e) => { g.combat.onPlayerHit(e); g.feel.onIncoming(e.damage); };
    w.events.fuselageHit = (local, dir) => { if (g.mission?.role === 'gunner') g.gunner.fuselageHit(local, dir); };
    // shake is kept small and short so the sight stays usable while under fire
    w.events.shake = (a) => { g.trauma = Math.min(0.6, g.trauma + a * 0.4); };
    // kills feed the combo in the kill handler; plain hits only keep it alive and nudge it up
    w.events.hitMarker = (kill) => { if (kill) g.hud.killMarkerT = 0.45; else { g.hud.hitMarkerT = 0.12; g.combo.onHit(); g.feel.onHit(); } };
  }
}
