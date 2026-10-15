import { describe, it, expect } from 'vitest';
import { classify, issueBody, parseShard, reportedKeys, scenario, shardJobs, summarize, STUCK_S } from '../tools/nightly_qa.mjs';

// Phase 11 goal 22: nightly QA in CI (tools/nightly_qa.mjs, .github/workflows/nightly-qa.yml)
const clean = (over: Record<string, unknown> = {}, qa: Record<string, unknown> = {}) => ({
  job: { kind: 'campaign', id: 'm1', skill: 0, diff: 'ace' }, env: { quality: 'low', lang: 'en' },
  result: 'Mission complete', success: true, stopped: false, timeout: false, t: 396, kills: 21, bombersLost: 3, rounds: [{}, {}],
  errors: [], wallS: 225,
  qa: {
    frames: { n: 80, p50: 900, p95: 1600, max: 1970, spikes: 80 },   // software rendering: never a finding
    hud: { samples: 80, issues: {} }, markers: { samples: 80, checked: 27, falseMarkers: 0, reasons: {} },
    stuck: 0, losses: { events: 3, unique: 3, stat: 3, scripted: 0, doubled: 0 }, ...qa,
  },
  ...over,
});

describe('classify', () => {
  it('a clean run, won or lost, has no findings (frame times are ignored)', () => {
    expect(classify(clean())).toEqual([]);
    expect(classify(clean({ success: false, result: 'Mission failed', failCause: 'all bombers lost' }))).toEqual([]);
    expect(scenario(clean())).toBe('campaign:m1 ace low/en');
    expect(scenario({ job: { kind: 'survival', role: 'gunner' }, env: { quality: 'high', lang: 'ar' } })).toBe('survival:gunner veteran high/ar');
  });
  it('flags errors, softlocks, HUD overlaps, false markers and double-counted losses', () => {
    const kinds = (r: object) => classify(r).map((f) => f.kind);
    expect(kinds(clean({ errors: ['pageerror: x is undefined'] }))).toEqual(['error']);
    expect(kinds(clean({ timeout: true, success: null, result: 'TIMEOUT (playing)' }))).toEqual(['softlock']);
    expect(kinds(clean({}, { stuck: STUCK_S }))).toEqual(['softlock']);
    expect(kinds(clean({}, { stuck: STUCK_S - 0.1 }))).toEqual([]);
    expect(kinds(clean({}, { hud: { samples: 80, issues: { 'radio overlaps status': 4 } } }))).toEqual(['hud-overlap']);
    expect(kinds(clean({}, { markers: { samples: 80, checked: 30, falseMarkers: 2, reasons: { 'enemy: behind camera': 2 } } }))).toEqual(['false-marker']);
    expect(kinds(clean({}, { markers: { samples: 80, checked: 30, falseMarkers: 1, reasons: {} } }))).toEqual(['false-marker']);
    expect(kinds(clean({}, { losses: { events: 4, unique: 3, stat: 4, scripted: 0, doubled: 1 } }))).toEqual(['double-loss']);
  });
  it('a crash or a hung job is reported with its errors, and nothing from the missing metrics', () => {
    const crash = { job: { kind: 'campaign', id: 'dp3' }, env: {}, crash: 'Error: page crashed', errors: ['pageerror: boom'] };
    expect(classify(crash).map((f) => f.kind)).toEqual(['crash', 'error']);
    const hung = { ...crash, crash: 'Error: job timeout after 1500 s (softlock?)', errors: [] };
    expect(classify(hung).map((f) => f.kind)).toEqual(['softlock']);
  });
  it('keys are stable across nights (numbers and hashes do not count) and repeated errors collapse', () => {
    const a = classify(clean({ errors: ['pageerror: bad index 12 at chunk-a1b2c3d4e5.js?v=99'] }))[0].key;
    const b = classify(clean({ errors: ['pageerror: bad index 40 at chunk-ffee0011aa.js?v=12'] }))[0].key;
    expect(a).toBe(b);
    expect(classify(clean({ errors: ['console: lost 3', 'console: lost 4'] }))).toHaveLength(1);
    expect(classify(clean({ job: { kind: 'campaign', id: 'm2', diff: 'ace' }, errors: ['pageerror: bad index 12'] }))[0].key).not.toBe(a);
  });
});

describe('sharding', () => {
  const jobs = Array.from({ length: 23 }, (_, i) => i);
  it('every job lands in exactly one shard, shards stay balanced', () => {
    const parts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => shardJobs(jobs, s, 10));
    expect(parts.flat().sort((x, y) => x - y)).toEqual(jobs);
    for (const p of parts) expect(p.length).toBeGreaterThanOrEqual(2);
    expect(shardJobs(jobs, 1, 1)).toEqual(jobs);
  });
  it('parses QA_SHARD and rejects nonsense', () => {
    expect(parseShard(undefined)).toBeNull();
    expect(parseShard('3/10')).toEqual({ shard: 3, n: 10 });
    expect(() => parseShard('3of10')).toThrow();
    expect(() => shardJobs(jobs, 11, 10)).toThrow();
    expect(() => shardJobs(jobs, 0, 10)).toThrow();
  });
});

describe('summary and issue', () => {
  const rows = [clean(), clean({ job: { kind: 'campaign', id: 'm2' }, errors: ['pageerror: x | y'] }, { hud: { samples: 10, issues: { 'a overlaps b': 2 } } })];
  it('summarizes runs and findings in Markdown', () => {
    const { markdown, findings } = summarize(rows, { date: '2026-10-15', sha: 'abcdef1234' });
    expect(findings.map((f) => f.kind)).toEqual(['error', 'hud-overlap']);
    expect(markdown).toContain('**2 runs**');
    expect(markdown).toContain('| hud-overlap | 1 |');
    expect(markdown).toContain('x \\| y');   // table-safe
    expect(markdown).toContain('`abcdef1`');
  });
  it('a failed shard is never a clean night', () => {
    const { findings } = summarize([clean()], { sweepResult: 'failure' });
    expect(findings[0]).toMatchObject({ kind: 'crash', scenario: 'sweep' });
    expect(summarize([clean()], { sweepResult: 'success' }).findings).toEqual([]);
  });
  it('the issue lists only findings not already reported, and records their keys', () => {
    const { findings } = summarize(rows);
    const body = issueBody(findings, new Set(), { date: '2026-10-15' });
    expect(body).toMatch(/^Nightly QA 2026-10-15 found 2 new problems/);
    expect(body).toContain('### hud-overlap (1)');
    const known = reportedKeys([body, null]);
    expect(known.size).toBe(2);
    expect(issueBody(findings, known)).toBe('');
    expect(issueBody(findings, new Set([findings[0].key]))).toMatch(/^Nightly QA found 1 new problem\./);
    expect(issueBody([], new Set())).toBe('');
  });
});
