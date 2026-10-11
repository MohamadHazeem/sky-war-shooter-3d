// Achievement conditions for the Phase 5 content (campaign side raids, Defend the Field / Night
// Fighter, Train Busting, Blue Two, weather fronts, set pieces, bookends, skill tree, custom
// battles and the weekly, theatre, co-op, the gallery quiz, the new enemy types, free look).
// Pure rules plus a small guarded store (sws3d.feats.v1, mirrored by the cloud save like every
// sws3d.* key), so they are unit-tested in Node. The in-game side that feeds them is
// FeatWatch.ts; the definitions themselves live in Achievements.ts with every other trophy.
import type { RaidKind } from './SideRaids';
import { BRANCHES, SKILLS, type SkillId } from './Skills';

export const FEATS_KEY = 'sws3d.feats.v1';

// The five side-raid templates (SideRaids.RAID_TEMPLATES; a test keeps the two in step)
export const RAID_KINDS: RaidKind[] = ['rail', 'airfield', 'oil', 'uboat', 'factory'];
export const SEARCHLIGHT_KILLS = 5;   // kills on coned raiders in one Night Fighter mission
export const FREE_LOOK_S = 30;        // seconds of free look in one mission (secret)
export const QUIZ_PERFECT = 10;       // gallery quiz rounds (AircraftData.QUIZ_ROUNDS)
// Train Busting's supply train: the locomotive and nine wagons (StrafeOps.startTrain)
export const TRAIN_CARS: Record<string, number> = { loco: 1, boxcar: 6, tanker: 2, flakcar: 1 };

// ---------------- pure rules ----------------

// Side raid ids are raid-<gap>-<template kind>
export function raidKindOf(id: string): RaidKind | null {
  const m = /^raid-\d+-([a-z]+)$/.exec(id);
  return m && (RAID_KINDS as string[]).includes(m[1]) ? (m[1] as RaidKind) : null;
}

// Most nodes owned in any one skill-tree branch, and the size of a full branch
export const BRANCH_SIZE = Math.min(...BRANCHES.map((b) => SKILLS.filter((s) => s.branch === b.id).length));
export function fullestBranch(owned: Iterable<SkillId | string>): number {
  const have = new Set(owned);
  return Math.max(0, ...BRANCHES.map((b) => SKILLS.filter((s) => s.branch === b.id && have.has(s.id)).length));
}

// Every car of the supply train destroyed (counts by ground-target kind)
export function trainWrecked(destroyed: Readonly<Record<string, number>>): boolean {
  return Object.entries(TRAIN_CARS).every(([k, n]) => (destroyed[k] ?? 0) >= n);
}

// Gallery quiz: a perfect score, or (secret) not a single one right
export function quizFeats(score: number, rounds: number): string[] {
  if (rounds < QUIZ_PERFECT) return [];
  if (score >= rounds) return ['recognition'];
  if (score <= 0) return ['friendOrFoe'];
  return [];
}

// What one mission did, read at the debrief (FeatWatch.end)
export interface MissionFeats {
  id: string;
  success: boolean;
  raidThrough: number | null;    // Defend the Field / Night Fighter: bombers that reached the field
  stormSeen: boolean;            // a front turned the sky into a storm during the mission
  belly: boolean;                // the landing was a belly landing
  trainWrecked: boolean;         // Train Busting: every car of the supply train destroyed
  weekly: boolean;               // a Weekly Challenge mission
  custom: boolean;               // a Custom Battle
}

// Achievements unlocked by the end of a mission
export function endFeats(f: MissionFeats): string[] {
  const out: string[] = [];
  if (f.id === 'strafe-pilot' && f.trainWrecked) out.push('endOfLine');
  if (!f.success) return out;
  if (f.id === 'raid-pilot' && f.raidThrough === 0) out.push('notOverMyField');
  if (f.id === 'night-pilot') out.push('nightFighter');
  if (f.id === 'm9' && f.stormSeen) out.push('weatherMan');
  if (f.belly) out.push('broughtHerHome');
  if (f.custom) out.push('warGames');
  if (f.weekly) out.push('weeklyWarrior');
  return out;
}

// ---------------- store ----------------

export interface FeatData { raidKinds: RaidKind[] }

export function loadFeats(): FeatData {
  try {
    const o = JSON.parse(localStorage.getItem(FEATS_KEY) ?? 'null');
    const kinds = o && Array.isArray(o.raidKinds) ? o.raidKinds.filter((k: unknown) => (RAID_KINDS as unknown[]).includes(k)) : [];
    return { raidKinds: [...new Set<RaidKind>(kinds)] };
  } catch { return { raidKinds: [] }; }
}

export function saveFeats(d: FeatData) {
  try { localStorage.setItem(FEATS_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}

// A side raid flown: remembered for Strategist. Returns the number of different kinds flown.
export function recordRaid(kind: RaidKind): number {
  const d = loadFeats();
  if (!d.raidKinds.includes(kind)) { d.raidKinds.push(kind); saveFeats(d); }
  return d.raidKinds.length;
}

export const raidKindsFlown = () => loadFeats().raidKinds.length;
