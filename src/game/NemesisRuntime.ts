import { recordSquadronExperte } from '../net/Squadrons';
import { isSecondTourId } from './SecondTour';
import * as THREE from 'three';
import type { SpecialEvents } from './SpecialEvents';
import type { Mission } from './Missions';
import { CAMPAIGN } from './Missions';
import { isRaidId } from './SideRaids';
import { isBossRound } from './BossBattle';
import { achievements } from './Achievements';
import {
  type AceRecord, type NemesisState, type EncounterInput, ACE_RANKS, SCAR_HEALTH, SURNAMES,
  applyEncounter, beginMission, ensureRoster, loadNemesis, memoryText, mostWanted, pickAce, placeOf, reportLines, saveNemesis,
  aceName, unitLabel, traitLabel, fullRankName,
} from './Nemesis';
import { applyAceLook, paintNose } from '../world/AceLook';
import { acePersona, PERSONALITY_LABEL, SIGNATURES } from '../world/PilotMind';
import { deathKindOf } from '../world/FighterDeath';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import type { AttackType } from '../world/AI';
import type { StationId } from '../world/B17Layout';
import { STATIONS } from '../world/B17Layout';
import { crewMember } from '../world/Crew';
import { Atmos } from '../render/Atmosphere';
import { sound } from '../audio/Sound';
import { tx, num } from '../i18n';
import { emblemSvg, portraitSvg } from '../ui/NemesisScreen';

// In-mission side of the Nemesis system (game/Nemesis.ts): which Experte turns up, how his
// trait flies him, what he does to the player, and what gets written into his dossier.
//
// Owned by SpecialEvents (constructed with it) and driven through the ace-squadron special
// event: every ace squadron is now led by a roster Experte when one is available (claim), and
// this module also books extra ace squadrons into a mission's rounds now and then (wantsRound).
//   engage   his markings, skill, entrance (by trait), radio call with the crew's memory of him,
//            banner, the HUD dossier card and a German taunt
//   fly      per frame: the trait's attack (head-on through the top turret, out of the sun, the
//            tail gun, stragglers, the escorts...), a grudge makes him go for the player, and he
//            breaks off at low health (the escape that brings him back with patches)
//   down / leave   commit the encounter (Nemesis.applyEncounter): bounty, medal, achievements
// It taps the world (no World.ts edits): ballistics.onHit for his hits on the player's aircraft
// and the crewmen they wound, events.kill / events.bomberLost for the aircraft he brings down.
// Game hook: onDebrief(m) at the end of Game.showDebrief (the debrief lines + campaign report).

export interface NemLive {
  ace: AceRecord;
  leader: Fighter;
  fighters: Fighter[];
  hits: number;
  wounded: string[];
  downed: number;
  downedUs: boolean;
  t: number;
  withdrawn: boolean;
  done: boolean;
  prevState: string;
  taunted: boolean;
  traitCall: boolean;
}

const MAX_PER_MISSION = 2;
const WITHDRAW_HEALTH = 0.35;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function health(f: Fighter) {
  let h = f.structureFrac;
  for (const z of f.zones) if (z.critical) h = Math.min(h, Math.max(0, z.hp) / z.maxHp);
  return h;
}

// The dossier card's style line: personality, and his signature move once the crew has seen it
export function aceStyleLine(a: AceRecord) {
  const p = acePersona(a.trait, a.id, -1);
  const move = p.signature && a.history.length ? tx('Signature: {move}', { move: tx(SIGNATURES[p.signature].label) }) : tx('Signature move: not yet seen');
  return `${tx(PERSONALITY_LABEL[p.personality])} · ${move}`;
}

// German pilot on the radio (subtitles only, like the ace squadron's taunts)
const TAUNT: Record<string, string> = {
  headon: 'Head-on, Kinder. Straight through them, and nobody turns away before me.',
  sun: 'Out of the sun. They will not see us until it is too late.',
  straggler: 'Look for the cripple at the back. Wounded birds fall easiest.',
  tailgun: 'Kill the tail gunner first. Then the Viermot is blind.',
  escorts: 'Leave the bombers to the others. The Mustangs are mine.',
  jet: 'Turbines at full power. Nobody can catch us today.',
  sturmbock: 'Close in to a hundred metres. Sturm!',
  biggun: 'Stay out of their range. One shell is enough for a Viermot.',
};
const TAUNT_GRUDGE = 'I remember your ship, Amis. Today we finish it.';
const TAUNT_BACK = 'Two weeks in hospital because of you. Now it is my turn.';
const TAUNT_AGAIN = 'You again? You should have stayed in England.';

export class NemesisRuntime {
  st: NemesisState;
  lives: NemLive[] = [];
  missionKills = 0;           // Experten the player shot down this mission (medal)
  private mission: Mission | null = null;
  private appeared = new Set<string>();
  private forced = new Set<number>();   // rounds booked for an extra appearance
  private openEnded = false;            // survival-type: rolls per round instead
  private card: HTMLElement | null = null;
  private cardTimer = 0;
  log: string[] = [];

  constructor(readonly sp: SpecialEvents) {
    this.st = loadNemesis();
    saveNemesis(this.st);
    this.tap();
  }

  get world() { return this.sp.world; }
  get ui() { return this.sp.ui; }

  // ---------------- mission ----------------

  // SpecialEvents.resetMission: a new mission (or a restart). Unfinished encounters are closed.
  resetMission(m: Mission | null) {
    for (const l of this.lives) if (!l.done) this.leave(l, 'cancel');
    this.lives = [];
    this.appeared.clear(); this.forced.clear();
    this.missionKills = 0;
    this.mission = m;
    this.hideCard();
    if (!m || m.tutorial) return;
    this.st = loadNemesis();   // re-read: the cloud save may have replaced it
    const back = beginMission(this.st);
    ensureRoster(this.st);
    saveNemesis(this.st);
    this.openEnded = !Number.isFinite(m.rounds ?? 1);
    if (m.specials !== false && m.round && !this.openEnded) {
      const n = m.rounds ?? 1;
      const rounds: number[] = [];
      for (let i = 1; i < n; i++) if (!isBossRound(m, i)) rounds.push(i);
      if (m.id.startsWith('acehunt-')) { rounds.slice(0, 1).forEach((r) => this.forced.add(r)); if (rounds[1] !== undefined && Math.random() < 0.5) this.forced.add(rounds[1]); }
      else if (rounds.length && Math.random() < (this.campaign(m) ? 0.4 : 0.3)) this.forced.add(rounds[Math.floor(Math.random() * rounds.length)]);
    }
    this.log.push(`mission ${this.st.missions}: ${m.id} forced rounds [${[...this.forced].join(',')}]${back.length ? ` · back from hospital: ${back.map((a) => a.last).join(', ')}` : ''}`);
  }

  private campaign(m: Mission) { return CAMPAIGN.includes(m) || isRaidId(m.id) || isSecondTourId(m.id); }

  // SpecialEvents.newRound: should this round get an Experte (on top of the normal specials)?
  wantsRound(idx: number): boolean {
    const m = this.mission;
    if (!m || m.tutorial || m.specials === false || this.appeared.size >= MAX_PER_MISSION) return false;
    if (this.openEnded) return idx >= 1 && Math.random() < 0.18;
    return this.forced.has(idx);
  }

  // AceSquadron.start: the Experte who leads this squadron (null: generic aces)
  claim(): AceRecord | null {
    const m = this.mission;
    if (!m || m.tutorial || this.appeared.size >= MAX_PER_MISSION) return null;
    const a = pickAce(this.st, { role: m.role, exclude: this.appeared });
    if (a) this.appeared.add(a.id);
    return a;
  }

  // ---------------- the encounter ----------------

  engage(ace: AceRecord, fighters: Fighter[]): NemLive {
    const w = this.world, sp = this.sp, L = fighters[0];
    const live: NemLive = { ace, leader: L, fighters, hits: 0, wounded: [], downed: 0, downedUs: false, t: 0, withdrawn: false, done: false, prevState: '', taunted: false, traitCall: false };
    this.lives.push(live);
    (L as any).ace = true;
    (L as any).nemesis = ace.id;
    L.label = `${ACE_RANKS[ace.rank].short} ${ace.last}`;
    // his markings; the Staffel flies his colour on the nose
    applyAceLook(L, { color: ace.color, emblem: ace.emblem, victories: ace.victories, scars: ace.scars, seed: Number(ace.id.slice(1)) * 7919 });
    for (const f of fighters) if (f !== L && (f.enemyType === 'fw190' || f.enemyType === 'bf109') && f.props.length) paintNose(f, ace.color);
    if (ace.trait === 'sturmbock') for (const f of fighters) { f.maxStructure *= 1.4; f.structure = f.maxStructure; for (const z of f.zones) { z.hp *= 1.3; z.maxHp *= 1.3; } }
    // skill: an Experte, sharper with a grudge, rusty just out of hospital
    const lp = w.enemyPilot(L);
    if (lp) lp.skill = Math.max(lp.skill, 1.75) + 0.1 * ace.grudge - (ace.recovered ? 0.2 : 0);
    // his personality and signature move (world/PilotMind.ts); the crew knows the move if they have met him
    if (lp) lp.setPersona({ ...acePersona(ace.trait, ace.id, -1), known: ace.history.length > 0 });
    this.entrance(live);
    // radio: what the crew remembers about him, or the intelligence officer's warning
    const pilot = !sp.gunner();
    const nav = pilot ? 'Lead' : 'Navigator';
    const r = ace.history;
    const wounded = [...r].reverse().find((e) => e.wounded.length);
    const downedUs = [...r].reverse().find((e) => e.downedUs);
    if (wounded) w.callout('nem_mem', nav, `He's back — the one who wounded ${wounded.wounded[0]} over ${wounded.place}!`, 0, 3);
    else if (downedUs) w.callout('nem_mem', nav, `He's back — the one who shot us down over ${downedUs.place}!`, 0, 3);
    else if (ace.recovered) w.callout('nem_mem', pilot ? 'Lead' : 'Pilot', 'That\'s the one who bailed out on us — he\'s flying again!', 0, 3);
    else if (ace.scars > 0) w.callout('nem_mem', pilot ? 'Lead' : 'Tail', 'He\'s back — you can still see the patches where we shot him up!', 0, 3);
    else if (r.length) w.callout('nem_mem', nav, 'Those markings again — it\'s the same Experte we tangled with before!', 0, 3);
    else if (SURNAMES.includes(ace.last)) w.callout('nem_spot', nav, `Intelligence was right — that's ${ace.last}'s machine! Watch for his markings!`, 0, 3);
    else w.callout('nem_mem', nav, 'Those markings again — it\'s the same Experte we tangled with before!', 0, 3);
    this.ui.banner(`${tx('EXPERTE')} · ${unitLabel(ace.unit)} · ${tx('{n} VICTORIES', { n: ace.victories })}`, fullRankNameUpper(ace), 3800);
    if (sp.gunner()) {
      const tip = ace.trait === 'tailgun' || ace.trait === 'sturmbock' ? tx('The Experte is coming for the <b>TAIL GUN</b> — <kbd>5</kbd>')
        : ace.trait === 'headon' ? tx('The Experte attacks head-on — <b>TOP TURRET</b> <kbd>3</kbd>')
        : ace.trait === 'sun' ? tx('The Experte dives <b>OUT OF THE SUN</b> — watch the glare')
        : tx('Bring down the Experte — {trait}', { trait: traitLabel(ace.trait) });
      this.ui.tip(tip, 3800);
    }
    this.showCard(ace);
    this.log.push(`${w.time.toFixed(0)}s engage ${ace.id} ${ace.last} (${ace.trait}, ${ace.type}, grudge ${ace.grudge}, scars ${ace.scars})`);
    return live;
  }

  // How he comes in, by trait
  private entrance(l: NemLive) {
    const sp = this.sp, w = this.world, tc = sp.tactics, fs = l.fighters, a = l.ace;
    const gunner = sp.gunner();
    const pb = w.playerBomber;
    const fwd = _f.copy(w.formationForward).setY(0).normalize();
    const right = _b.crossVectors(fwd, UP).normalize();
    const placeAt = (base: THREE.Vector3, dir: THREE.Vector3) => fs.forEach((f, i) => {
      _a.copy(base).addScaledVector(right, (i - 1) * 70).y += i * 15;
      tc.place(f, _a, _a.clone().sub(w.formationCenter).negate().setY(0).normalize().lerp(dir, 0.3).normalize(), 190);
    });
    switch (a.trait) {
      case 'headon': tc.companyFront(fs, { schwarm: true, telegraph: false }); break;
      case 'jet': for (const f of fs) tc.jet(f); break;
      case 'biggun': tc.bigGun(fs, { focus: gunner ? pb : undefined, place: 3000 }); break;
      case 'sun': placeAt(_a.copy(w.formationCenter).addScaledVector(sunHoriz(), 3800).add(new THREE.Vector3(0, 1500, 0)).clone(), fwd); break;
      case 'tailgun': case 'sturmbock': placeAt(_a.copy(w.formationCenter).addScaledVector(fwd, -3200).add(new THREE.Vector3(0, 250, 0)).clone(), fwd); break;
      default: placeAt(_a.copy(w.formationCenter).addScaledVector(right, (Math.random() < 0.5 ? 1 : -1) * 3000).addScaledVector(fwd, 800).add(new THREE.Vector3(0, 700, 0)).clone(), fwd); break;
    }
  }

  // Per frame while his squadron is up (AceSquadron.update)
  fly(l: NemLive, dt: number) {
    if (l.done) return;
    const w = this.world, L = l.leader, a = l.ace;
    l.t += dt;
    if (!l.taunted && l.t > 4.5) {
      l.taunted = true;
      const r = a.history;
      const text = a.recovered ? TAUNT_BACK : r.some((e) => e.wounded.length || e.downedUs) ? TAUNT_AGAIN : a.grudge > 0 ? TAUNT_GRUDGE : TAUNT[a.trait];
      this.ui.subtitle(a.last, text);
      sound.radioStatic();
    }
    if (!L.alive || L.remove) return;
    const p = w.enemyPilot(L);
    if (!p) return;
    // break off at low health: the escape that brings him back patched up and angry
    if (!l.withdrawn && health(L) < WITHDRAW_HEALTH) {
      l.withdrawn = true;
      this.sp.withdraw([L]);
      w.callout('nem_escape', this.sp.gunner() ? 'Tail' : 'Lead', 'He\'s breaking off, trailing smoke — don\'t let him get away!', 0, 3);
      this.log.push(`${w.time.toFixed(0)}s ${a.last} breaks off at ${(health(L) * 100).toFixed(0)}%`);
    }
    if (p.state === 'withdraw') { l.prevState = p.state; return; }
    if (p.override) { l.prevState = 'override'; return; }   // a group tactic is flying him
    const entered = p.state === 'approach' && l.prevState !== 'approach';
    l.prevState = p.state;
    if (entered) this.trait(l);
  }

  // A new attack begins: the trait picks his target, the gun position he attacks and the run
  private trait(l: NemLive) {
    const w = this.world, sp = this.sp, a = l.ace;
    const p = w.enemyPilot(l.leader)!;
    const gunner = sp.gunner(), pb = w.playerBomber, pf = w.playerFighter;
    const personal = a.grudge > 0;
    let target: Aircraft | null = null;
    let attack: AttackType | undefined;
    let station: StationId | null = null;
    let call: [string, string, string] | null = null;
    const nav = gunner ? 'Navigator' : 'Lead';
    switch (a.trait) {
      case 'escorts': {
        const mustang = pf?.alive && w.player === pf ? pf : null;
        let esc: Fighter | null = mustang;
        if (!esc) { let bd = 4000; for (const f of w.fighters('allied')) { if (!f.alive) continue; const d = f.pos.distanceTo(l.leader.pos); if (d < bd) { bd = d; esc = f; } } }
        if (esc) {
          p.target = esc; p.state = 'dogfight'; p.timer = 0; l.prevState = 'dogfight';
          if (!l.traitCall && l.t >= 7) { l.traitCall = true; w.callout('nem_trait', nav, 'He\'s going after the Mustangs — he wants the little friends!', 0, 2); }
          return;
        }
        break;
      }
      case 'straggler': {
        let best: Bomber | null = null, bs = Infinity;
        for (const b of w.bombers()) { if (!b.alive) continue; const s = (b.straggling ? 0 : 1) + b.structureFrac + (b.isPlayer && personal ? -0.5 : 0); if (s < bs) { bs = s; best = b; } }
        target = best; attack = 'high';
        call = [nav, 'nem_trait', 'He\'s going for the stragglers — the cripples are his meat!'];
        break;
      }
      case 'tailgun': attack = 'stern'; station = 'tail'; call = gunner ? ['Navigator', 'nem_trait', 'He\'s lining up on the tail gun — watch six o\'clock!'] : null; break;
      case 'sturmbock': attack = 'stern'; station = Math.random() < 0.7 ? 'tail' : 'ball'; call = [gunner ? 'Tail' : 'Lead', 'nem_trait', 'Sturmbock! Armoured Fw 190s closing to point-blank — hit him hard!']; break;
      case 'headon': attack = 'headon'; station = 'top'; call = [nav, 'nem_trait', 'He\'s coming head-on, twelve o\'clock high — he never turns away first!']; break;
      case 'sun': attack = 'high'; station = sunStation(w); call = [gunner ? 'Top Turret' : 'Lead', 'nem_trait', 'He\'s coming out of the sun — watch the glare!']; break;
      case 'jet': call = [gunner ? 'Tail' : 'Lead', 'nem_trait', 'Jet Experte! One pass and he\'s gone — be ready!']; break;
      case 'biggun': call = [nav, 'nem_trait', 'That Me 410 Experte is hanging back — he\'ll use the big gun!']; break;
    }
    // (not over the entrance call: the crew's memory of him / the intelligence warning)
    if (l.t < 7) { /* the next pass makes the call */ }
    else if (call && !l.traitCall) { l.traitCall = true; w.callout(call[1], call[0], call[2], 0, 2); }
    else if (personal && !l.traitCall) { l.traitCall = true; w.callout('nem_grudge', gunner ? 'Pilot' : 'Lead', 'He\'s coming straight for us — he\'s got a score to settle!', 0, 2); }
    // P-51: he hunts the Mustang (the sun ace dives on it out of the glare first)
    if (!gunner && pf?.alive && w.player === pf && a.trait !== 'straggler' && (personal || a.trait === 'sun' || Math.random() < 0.6)) {
      if (a.trait === 'sun') { p.station = null; p.engage(w, pf, 'high', false); upSun(p.setupPoint, pf.pos); return; }
      p.target = pf; p.state = 'dogfight'; p.timer = 0; l.prevState = 'dogfight';
      return;
    }
    // B-17: the trait's gun position on the player's own ship (or the player's ship when it is personal)
    if (gunner && pb?.alive && (personal || station)) target = target && !personal && a.trait === 'straggler' ? target : pb;
    target ??= p.target && p.target.alive && p.target instanceof Bomber ? p.target : null;
    if (!target) return;
    p.station = gunner && target === pb ? station : null;
    p.engage(w, target, attack, false);
    if (a.trait === 'sun') upSun(p.setupPoint, target.pos);
  }

  // He went down (AceSquadron.update saw !leader.alive)
  down(l: NemLive, credited: boolean) {
    if (l.done) return;
    const kind = deathKindOf(l.leader);
    const bailed = kind === 'bailout' || (kind === 'engineFire' ? Math.random() < 0.3 : Math.random() < 0.12);
    const res = this.commit(l, bailed ? 'bailed' : 'down', credited);
    const w = this.world, sp = this.sp, a = l.ace, pilot = !sp.gunner();
    if (credited && res) {
      const pay = res.payout;
      this.game.prog.earn(pay);
      sp.bonusMerit += pay;
      sp.addScore(2500);
      this.missionKills++;
      void recordSquadronExperte();
      sound.confirm('kill_confirm');
      this.ui.feed(tx('{name} shot down — +{n} merit bounty', { name: aceName(a), n: num(pay) }), 'mine');
      this.ui.banner(`${fullRankNameUpper(a)} · ${tx('{n} VICTORIES', { n: a.victories })}`, res.wasMostWanted ? tx('Most wanted — down') : tx('Experte down'), 4200);
      if (SURNAMES.includes(a.last)) w.callout('nem_down', pilot ? 'Lead' : 'Pilot', `You got ${a.last}! That's one Experte off the board!`, 0, 3);
      achievements.unlock('expKill');
      if (a.history.length > 1 && a.history.slice(0, -1).some((e) => e.wounded.length || e.downedUs || e.fate === 'escaped' || e.fate === 'bailed')) achievements.unlock('expGrudge');
      if (res.wasMostWanted) achievements.unlock('expWanted');
      if (this.st.kills >= 5) achievements.unlock('expFive');
    } else {
      this.ui.feed(tx('{name} shot down', { name: aceName(a) }), '');
      w.callout('nem_formation', pilot ? 'Lead' : 'Tail', 'Somebody got the Experte! Scratch one ace!', 0, 3);
    }
    if (bailed) setTimeout(() => { if (this.game.state === 'playing') w.callout('nem_bail', pilot ? 'Lead' : 'Tail', 'He\'s bailed out — there\'s his chute! He\'ll fly again.', 0, 2); }, 2600);
    if (res?.replacement) this.log.push(`  ${res.replacement.last} promoted from the ranks (${res.replacement.unit})`);
  }

  // He left the fight: got away (removed), the event timed out, or the mission ended
  leave(l: NemLive, why: 'escaped' | 'timeout' | 'cancel') {
    if (l.done) return;
    const h = l.leader.alive ? health(l.leader) : 0;
    const fate = h < SCAR_HEALTH ? 'escaped' : 'withdrew';
    this.commit(l, fate, false);
    if (why !== 'cancel') {
      const pilot = !this.sp.gunner();
      if (fate === 'escaped') this.world.callout('nem_gone', pilot ? 'Lead' : 'Navigator', 'He got away. He\'ll be back — and he\'ll remember us.', 0, 3);
      this.ui.feed(fate === 'escaped' ? tx('{name} escaped, badly damaged', { name: aceName(l.ace) }) : tx('{name} broke off', { name: aceName(l.ace) }), fate === 'escaped' ? 'loss' : '');
    }
  }

  private get game() { return this.sp.game; }

  private commit(l: NemLive, fate: EncounterInput['fate'], byPlayer: boolean) {
    l.done = true;
    const m = this.mission ?? this.game.mission;
    const inp: EncounterInput = {
      fate, byPlayer, hits: l.hits, wounded: l.wounded, downed: l.downed, downedUs: l.downedUs, health: l.leader.alive ? health(l.leader) : 0,
      place: m ? placeOf(m) : 'the Reich', mission: m?.title ?? '', role: m?.role ?? 'gunner', campaign: !!m && this.campaign(m),
    };
    const res = applyEncounter(this.st, l.ace.id, inp);
    saveNemesis(this.st);
    this.log.push(`${this.world.time.toFixed(0)}s ${l.ace.last}: ${fate}${byPlayer ? ' by player' : ''} · hits ${l.hits} · wounded [${l.wounded.join(', ')}] · downed ${l.downed}${res?.promotedTo != null ? ` · promoted ${ACE_RANKS[res.promotedTo].name}` : ''}${res?.payout ? ` · +${res.payout}` : ''}`);
    return res;
  }

  // ---------------- world taps ----------------
  private tap() {
    const w = this.world;
    const prevHit = w.ballistics.onHit;
    w.ballistics.onHit = (e) => {
      const l = this.lives.length ? this.lives.find((x) => !x.done && x.leader === e.shooter) : undefined;
      const mine = !!l && (e.target === w.player || e.target === w.playerBomber);
      if (!mine) { prevHit?.(e); return; }
      // crewmen wounded by this hit: the wounded set before and after
      const before = new Set(w.crew.wounded);
      prevHit?.(e);
      l!.hits++;
      for (const c of w.crew.wounded) if (!before.has(c)) {
        const name = crewMember(c).name;
        if (name && !l!.wounded.includes(name)) {
          l!.wounded.push(name);
          w.callout('nem_hurt', 'Pilot', 'That was the Experte! He got one of ours!', 0, 3);
        }
      }
    };
    const ev = w.events;
    const prevKill = ev.kill;
    ev.kill = (v, byPlayer, cause) => {
      prevKill?.(v, byPlayer, cause);
      if (v.team !== 'allied') return;
      const l = this.lives.find((x) => !x.done && v.lastAttacker === x.leader);
      if (!l) return;
      l.downed++;
      if (v === w.playerFighter) l.downedUs = true;
    };
    const prevLost = ev.bomberLost;
    ev.bomberLost = (b) => {
      prevLost?.(b);
      const l = this.lives.find((x) => !x.done && b.lastAttacker === x.leader);
      if (!l) return;
      l.downed++;
      if (b.isPlayer) l.downedUs = true;
      else w.callout('nem_fort', this.sp.gunner() ? 'Tail' : 'Lead', 'The Experte just got one of the Forts!', 0, 3);
    };
    // keep the kill-chain markers other modules look for (MidRound / Modes wrap once)
    if ((prevKill as any)?.__midRound) (ev.kill as any).__midRound = true;
    if ((prevKill as any)?.__modes) (ev.kill as any).__modes = true;
  }

  // ---------------- HUD dossier card ----------------
  private showCard(a: AceRecord) {
    if (typeof document === 'undefined') return;
    ensureCss();
    this.hideCard();
    const el = document.createElement('div');
    el.id = 'nemCard';
    const mem = memoryText(a);
    const wanted = mostWanted(this.st)?.id === a.id;
    el.innerHTML = `<div class="nc-pic">${portraitSvg(a, 64)}</div><div class="nc-body">
      <div class="nc-k">${wanted ? tx('MOST WANTED') : tx('INTELLIGENCE · EXPERTE')}</div>
      <div class="nc-n">${esc(fullRankName(a))}</div>
      <div class="nc-u">${esc(unitLabel(a.unit))} · ${esc(tx(acLabel(a.type)))} · <b>${tx('{n} victories', { n: a.victories })}</b></div>
      <div class="nc-t">${emblemSvg(a.emblem, a.color, 16)} ${esc(traitLabel(a.trait))}</div>
      <div class="nc-t">${esc(aceStyleLine(a))}</div>
      ${mem ? `<div class="nc-m">${esc(mem)}</div>` : ''}
      ${a.scars ? `<div class="nc-s">${tx('Patched up after last time · out for revenge')}</div>` : ''}
    </div>`;
    el.style.setProperty('--nc', a.color);
    document.body.appendChild(el);
    this.card = el;
    requestAnimationFrame(() => el.classList.add('show'));
    this.cardTimer = window.setTimeout(() => this.hideCard(), 6500);
  }

  private hideCard() {
    if (this.cardTimer) { clearTimeout(this.cardTimer); this.cardTimer = 0; }
    const el = this.card;
    this.card = null;
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 450);
  }

  // ---------------- debrief ----------------
  // End of Game.showDebrief: the mission's ace outcomes, in the campaign intelligence report
  // when there is one, else in a panel of their own
  onDebrief(m: Mission) {
    for (const l of this.lives) if (!l.done) this.leave(l, 'cancel');
    this.hideCard();
    const last = this.st.last;
    if (!last || last.n !== this.st.missions || !last.items.length || this.mission !== m || typeof document === 'undefined') return;
    const host = document.querySelector<HTMLElement>('#debrief .box');
    if (!host) return;
    ensureCss();
    host.querySelector('.nem-report')?.remove();
    const lines = last.items.flatMap(reportLines);
    const box = document.createElement('div');
    box.className = 'nem-report';
    box.innerHTML = `<div class="hud-label">${tx('Luftwaffe Experten')}</div>${lines.map((t) => `<p>${esc(t)}</p>`).join('')}`;
    const intel = host.querySelector('.cm-report');
    if (intel) intel.querySelector('.row')?.before(box);
    else { const row = host.querySelector('.row'); if (row) row.after(box); else host.appendChild(box); }
  }
}

// ---------------- helpers ----------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fullRankNameUpper = (a: AceRecord) => fullRankName(a).toUpperCase();
const acLabel = (t: string) => ({ fw190: 'Fw 190', bf109: 'Bf 109', me262: 'Me 262', me410: 'Me 410' }[t] ?? t);

// horizontal direction toward the sun (the attack comes out of the glare)
function sunHoriz(out = new THREE.Vector3()) {
  out.set(Atmos.sunDir.x, 0, Atmos.sunDir.z);
  if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
  return out.normalize();
}
function upSun(setup: THREE.Vector3, from: THREE.Vector3) {
  setup.copy(from).addScaledVector(sunHoriz(_a), 1500);
  setup.y = from.y + 900;
}
// the gun position on the player's ship that looks into the sun
function sunStation(w: { stationArc(id: string): THREE.Vector3 | null }): StationId {
  let best: StationId = 'top', bd = -2;
  for (const id of Object.keys(STATIONS) as StationId[]) {
    const arc = w.stationArc(id);
    if (!arc) continue;
    const d = arc.dot(Atmos.sunDir);
    if (d > bd) { bd = d; best = id; }
  }
  return best;
}

// ---------------- CSS ----------------
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'nemesis-css';
  st.textContent = `
#nemCard { position: fixed; left: 18px; top: 248px; z-index: 30; width: min(330px, calc(100vw - 36px)); display: flex; gap: 12px; padding: 10px 12px; background: rgba(12,13,9,0.86); border: 1px solid rgba(185,167,111,0.55); border-left: 4px solid var(--nc, #e8b923); color: #ece6d2; font-family: 'IBM Plex Mono', monospace; box-shadow: 0 6px 24px rgba(0,0,0,0.5); pointer-events: none; opacity: 0; transform: translateX(-24px); transition: opacity .4s, transform .4s; }
#nemCard.show { opacity: 1; transform: none; }
#nemCard .nc-pic { flex: none; width: 64px; height: 64px; }
#nemCard .nc-k { font-size: 10px; letter-spacing: 2px; color: #e8b923; }
#nemCard .nc-n { font-family: Oswald, sans-serif; font-size: 18px; letter-spacing: 1px; line-height: 1.15; }
#nemCard .nc-u { font-size: 11px; color: #b9a76f; margin-top: 2px; }
#nemCard .nc-u b { color: #f4e7c4; font-weight: 600; }
#nemCard .nc-t { font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
#nemCard .nc-m { font-size: 12px; color: #ff9c6e; margin-top: 4px; }
#nemCard .nc-s { font-size: 11px; color: #c9c2a8; margin-top: 2px; font-style: italic; }
html[dir="rtl"] #nemCard { left: auto; right: 18px; border-left: 1px solid rgba(185,167,111,0.55); border-right: 4px solid var(--nc, #e8b923); transform: translateX(24px); }
html[dir="rtl"] #nemCard.show { transform: none; }
html[lang="ar"] #nemCard .nc-k { letter-spacing: 0; }
#debrief .nem-report { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; text-align: left; }
#debrief .cm-report .nem-report { border-top: 1px dashed var(--line); margin-top: 10px; padding-top: 10px; }
#debrief .nem-report p { margin: 0 0 6px; font-size: 13px; line-height: 1.45; color: var(--ink-dim); font-family: 'Special Elite', monospace; padding-left: 16px; position: relative; }
#debrief .nem-report p::before { content: '✠'; position: absolute; left: 0; color: #e8b923; font-size: 11px; }
html[dir="rtl"] #debrief .nem-report { text-align: right; }
html[dir="rtl"] #debrief .nem-report p { padding-left: 0; padding-right: 16px; }
html[dir="rtl"] #debrief .nem-report p::before { left: auto; right: 0; }
html[lang="ar"] #debrief .nem-report p { font-family: 'Noto Naskh Arabic', serif; line-height: 1.7; }
`;
  document.head.appendChild(st);
}

// ---------------- medal / dev ----------------
let current: NemesisRuntime | null = null;
export function setNemesisRuntime(r: NemesisRuntime) { current = r; }
// ServiceRecord.bonusMedals: Experten the player shot down this mission
export const nemesisMissionKills = () => current?.missionKills ?? 0;
