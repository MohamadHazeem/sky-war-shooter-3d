import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, survivalMission, type Mission } from '../game/Missions';
import { ACE_HUNT } from '../game/Modes';
import { raidMission, nightMission } from '../game/RaidDefence';
import { strafeMission } from '../game/StrafeOps';
import { weeklyMission } from '../game/Weekly';
import { autoplay, lastMetrics, HUMAN, type AutoplayMetrics } from './autoplay';

// Balance harness (dev build only, docs/BALANCE.md). Runs autoplay over a queue of jobs, one
// job per page load, so every run starts from a clean profile (no Armory upgrades, a fresh
// campaign state, no wounded crew carried over) and the results survive the reloads in
// localStorage. Drive it from the built-in browser on the frozen build:
//
//   sws.balance.enqueue(sws.balance.suite('all'))   // or a list of jobs, see Job
//   location.search = '?balance'                    // starts the chain: run, record, reload, ...
//   sws.balance.results()                           // poll: the finished runs
//   sws.balance.table()                             // a summary per job
//
// A job: { kind, id?, role?, skill: 1 (bot) | 0 (human-level), diff?, rounds?, steps? }.

export type JobKind = 'campaign' | 'survival' | 'raid' | 'night' | 'strafe' | 'weekly' | 'acehunt';
export interface Job {
  kind: JobKind;
  id?: string;                         // campaign mission id (m1..m12) / weekly key (yyyyww)
  role?: 'gunner' | 'pilot';
  skill: number;                       // autoplay skill: 1 = near-perfect bot, 0 = human-level
  diff?: 'recruit' | 'veteran' | 'ace';
  rounds?: number;                     // survival: stop after this many rounds
  steps?: number;                      // autoplay step cap (0.05 s each)
  tag?: string;                        // free label (before / after)
}
export interface JobResult extends AutoplayMetrics { job: Job; log: string; realMs: number }

const QKEY = 'swsbal.queue', RKEY = 'swsbal.results';
const read = <T>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export function missionFor(j: Job): Mission {
  switch (j.kind) {
    case 'campaign': { const m = CAMPAIGN.find((c) => c.id === j.id); if (!m) throw new Error(`no mission ${j.id}`); return m; }
    case 'survival': return survivalMission(j.role ?? 'gunner');
    case 'raid': return raidMission();
    case 'night': return nightMission();
    case 'strafe': return strafeMission();
    case 'weekly': return weeklyMission(j.role ?? 'gunner', j.id);
    case 'acehunt': return ACE_HUNT.mission(j.role ?? 'gunner');
  }
}

export const jobName = (j: Job) => `${j.kind}${j.id ? ':' + j.id : ''}${j.role && j.kind !== 'campaign' ? ':' + j.role : ''}${j.diff && j.diff !== 'veteran' ? ':' + j.diff : ''} @${j.skill}`;

// Wipe the game's own saved state (keep the settings and our queue/results) so the next page
// load starts from a fresh profile
function cleanProfile() {
  const keep = new Set(['sws3d.settings.v2', QKEY, RKEY]);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)!;
    if (k.startsWith('sws3d.') && !keep.has(k)) localStorage.removeItem(k);
  }
}

export function runJob(engine: Engine, game: Game, j: Job): JobResult {
  const g = game as any;
  const prevDiff = g.settings.difficulty, prevAssist = g.settings.aimAssist;
  g.settings.difficulty = j.diff ?? 'veteran';
  g.settings.aimAssist = 'high';            // the default setting
  const t0 = performance.now();
  let log = '';
  try {
    log = autoplay(engine, game, missionFor(j), j.steps ?? 60000, { skill: j.skill, stopAfterRounds: j.rounds });
  } finally {
    g.settings.difficulty = prevDiff; g.settings.aimAssist = prevAssist;
  }
  const m = lastMetrics!;
  return { ...m, job: j, log: log.split('\n').slice(-14).join('\n'), realMs: Math.round(performance.now() - t0) };
}

// Named job lists
export function suite(name: string, skills: number[] = [1, 0], tag?: string): Job[] {
  const out: Job[] = [];
  const add = (j: Omit<Job, 'skill'>) => { for (const skill of skills) out.push({ ...j, skill, tag }); };
  const campaign = () => { for (const m of CAMPAIGN) add({ kind: 'campaign', id: m.id }); };
  const modes = () => {
    add({ kind: 'survival', role: 'gunner', rounds: 4 });
    add({ kind: 'survival', role: 'pilot', rounds: 4 });
    add({ kind: 'raid' }); add({ kind: 'night' }); add({ kind: 'strafe' });
    add({ kind: 'weekly', role: 'gunner' }); add({ kind: 'acehunt', role: 'gunner' }); add({ kind: 'acehunt', role: 'pilot' });
  };
  if (name === 'campaign') campaign();
  else if (name === 'modes') modes();
  else if (name === 'all') { campaign(); modes(); }
  else if (name === 'bosses') { add({ kind: 'campaign', id: 'm5' }); add({ kind: 'campaign', id: 'm12' }); add({ kind: 'survival', role: 'gunner', rounds: 3 }); }
  else if (name === 'raids') { for (let i = 0; i < 5; i++) { add({ kind: 'raid' }); add({ kind: 'night' }); } }
  return out;
}

// Summary rows: one per job name (several runs averaged)
export function table(results: JobResult[] = read<JobResult[]>(RKEY, [])) {
  const by = new Map<string, JobResult[]>();
  for (const r of results) { const k = (r.job.tag ? r.job.tag + ' ' : '') + jobName(r.job); by.set(k, [...(by.get(k) ?? []), r]); }
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  return [...by].map(([k, rs]) => ({
    job: k, runs: rs.length,
    pass: `${rs.filter((r) => r.success).length}/${rs.length}`,
    t: avg(rs.map((r) => r.t)),
    rounds: rs.map((r) => r.rounds.map((x) => x.t + (x.boss ? 'B' : '') + (x.complete ? '' : '?')).join('/')).join(' | '),
    boss: rs.map((r) => r.boss.map((b) => `${b.t ?? '-'}s[${b.ships.map((s) => `${s.breach ?? '-'}/${s.t ?? '-'}`).join(',')}]`).join(' ')).join(' | '),
    acc: +(rs.reduce((x, r) => x + r.accuracy, 0) / rs.length).toFixed(2),
    kpm: +(rs.reduce((x, r) => x + r.kpm, 0) / rs.length).toFixed(2),
    kills: avg(rs.map((r) => r.kills)), lost: avg(rs.map((r) => r.bombersLost)), dmg: avg(rs.map((r) => r.dmgTaken)),
    minHp: +(rs.reduce((x, r) => x + r.minHp, 0) / rs.length).toFixed(2), wounds: avg(rs.map((r) => r.wounds)),
    fail: rs.filter((r) => r.failCause || r.timeout).map((r) => r.failCause ?? r.result).join(' ; '),
  }));
}

export function installBalance(engine: Engine, game: Game) {
  const api = {
    suite, table, missionFor, jobName, HUMAN,   // HUMAN: the human-level aim model, editable live for calibration
    run: (j: Job) => runJob(engine, game, j),
    enqueue: (jobs: Job[]) => { write(QKEY, [...read<Job[]>(QKEY, []), ...jobs]); return read<Job[]>(QKEY, []).length; },
    queue: () => read<Job[]>(QKEY, []),
    results: () => read<JobResult[]>(RKEY, []),
    clear: () => { localStorage.removeItem(QKEY); localStorage.removeItem(RKEY); },
    clearQueue: () => localStorage.removeItem(QKEY),
    start: () => { cleanProfile(); location.search = '?balance'; },
    status: () => ({ queued: read<Job[]>(QKEY, []).length, done: read<JobResult[]>(RKEY, []).length, running: (window as any).__balRunning ?? null }),
  };
  (window as any).sws.balance = api;
  // the chain: ?balance in the URL runs the next queued job, records it and reloads
  if (!new URLSearchParams(location.search).has('balance')) return;
  setTimeout(() => {
    const q = read<Job[]>(QKEY, []);
    const j = q.shift();
    if (!j) return;
    write(QKEY, q);
    (window as any).__balRunning = jobName(j);
    document.title = `BAL ${read<unknown[]>(RKEY, []).length + 1}/${read<unknown[]>(RKEY, []).length + q.length + 1} ${jobName(j)}`;
    let res: JobResult | { job: Job; error: string };
    try { res = runJob(engine, game, j); } catch (e) { res = { job: j, error: String((e as Error)?.stack ?? e) }; }
    write(RKEY, [...read<unknown[]>(RKEY, []), res]);
    cleanProfile();
    if (read<Job[]>(QKEY, []).length) location.reload();
    else (window as any).__balRunning = 'done';
  }, 2500);   // a window for the driver to read the results between runs
}
