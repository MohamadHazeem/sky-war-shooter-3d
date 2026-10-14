import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import type { Bomber } from '../world/Aircraft';
import { runJob, type Job, type JobResult } from './balance';
import { checkHudOverlaps } from '../ui/HudOverlap';
import { captureMarkerAudit } from '../ui/MarkerAudit';

// Phase 9 goal 7 bug sweep (dev build only, docs/phase9/reports/07.md). One autoplay job with
// QA sampling on top of the balance metrics: every `every` steps (3 frames each) while the
// mission is live it renders one GPU-synced frame (frame spikes), then checks the HUD for
// overlapping panels and the markers drawn in that frame for false ones. Also: shader programs,
// GPU memory and JS heap before/after, stuck clock, and every B-17 loss counted exactly once.
// Driven from the shell by tools/qa_sweep.mjs, one fresh page per job.

export interface QaReport extends JobResult {
  qa: {
    frames: { n: number; p50: number; p95: number; max: number; spikes: number };   // ms; spikes: > 50 ms
    hud: { samples: number; issues: Record<string, number> };                           // issue text -> samples
    markers: { samples: number; checked: number; falseMarkers: number; reasons: Record<string, number> };
    programs: [number, number]; geometries: [number, number]; textures: [number, number]; heapMB: [number, number];   // first in-mission sample -> end
    stuck: number;                      // longest stretch (s, real steps) of 'playing' with a frozen world clock
    losses: { events: number; unique: number; stat: number; scripted: number; doubled: number };
    states: string[];                   // game states seen, in order
  };
}

const heap = () => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576);

export function runQa(engine: Engine, game: Game, job: Job, every = 100): QaReport {
  const g = game as Game & { mission: unknown };
  const w = game.world, info = engine.renderer.info;
  const frames: number[] = [];
  const hud: Record<string, number> = {}, reasons: Record<string, number> = {};
  let hudN = 0, mkN = 0, mkChecked = 0, mkFalse = 0;
  // baselines from the first in-mission sample (after the mission's own prewarm), so they show growth
  let programs0 = -1, geo0 = 0, tex0 = 0, heap0 = 0;
  let lastT = -1, frozen = 0, stuck = 0;
  const states: string[] = [];
  const lost = new Map<Bomber, number>();
  let events = 0, wired = false;
  const onStep = (k: number) => {
    if (states[states.length - 1] !== game.state) states.push(game.state);
    if (!wired) {   // after autoplay's startMission (World rewires its events per mission)
      wired = true;
      const prev = w.events.bomberLost;
      w.events.bomberLost = (b) => { events++; lost.set(b, (lost.get(b) ?? 0) + 1); prev?.(b); };
    }
    if (game.state === 'playing') {
      if (w.time === lastT) { frozen += 0.05; stuck = Math.max(stuck, frozen); } else frozen = 0;
      lastT = w.time;
    }
    if (k % every || game.state !== 'playing' || !g.mission) return;
    frames.push(engine.timedFrame(1 / 60));
    if (programs0 < 0) { programs0 = info.programs?.length ?? 0; geo0 = info.memory.geometries; tex0 = info.memory.textures; heap0 = heap(); }
    const h = checkHudOverlaps();
    hudN++;
    for (const i of h.issues) hud[i] = (hud[i] ?? 0) + 1;
    const m = captureMarkerAudit(engine.camera, innerWidth, innerHeight, w.aircraft, w.spotted);
    mkN++; mkChecked += m.checked; mkFalse += m.falseMarkers;
    for (const e of m.errors) reasons[`${e.kind}: ${e.reason}`] = (reasons[`${e.kind}: ${e.reason}`] ?? 0) + 1;
  };
  const res = runJob(engine, game, job, onStep);
  frames.sort((a, b) => a - b);
  const q = (p: number) => frames.length ? +frames[Math.min(frames.length - 1, Math.floor(frames.length * p))].toFixed(1) : 0;
  return {
    ...res,
    qa: {
      frames: { n: frames.length, p50: q(0.5), p95: q(0.95), max: q(1), spikes: frames.filter((f) => f > 50).length },
      hud: { samples: hudN, issues: hud },
      markers: { samples: mkN, checked: mkChecked, falseMarkers: mkFalse, reasons },
      programs: [programs0, info.programs?.length ?? 0], geometries: [geo0, info.memory.geometries], textures: [tex0, info.memory.textures],
      heapMB: [heap0, heap()],
      stuck: +stuck.toFixed(1),
      losses: { events, unique: lost.size, stat: w.stats.bombersLost, scripted: w.stats.scriptedLost, doubled: [...lost.values()].filter((n) => n > 1).length },
      states,
    },
  };
}
