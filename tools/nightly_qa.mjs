// Phase 11 goal 22: nightly QA in CI (docs/phase11/reports/22.md, .github/workflows/nightly-qa.yml).
// The scheduled workflow runs tools/qa_sweep.mjs (set `nightly`, sharded) on GitHub's runners with the
// Playwright headless shell + SwiftShader, then this script turns the JSON lines into a summary and,
// when something regressed, the body of a GitHub issue.
//
//   node tools/nightly_qa.mjs summary <jsonl files or dirs...> --md summary.md --json findings.json
//   node tools/nightly_qa.mjs issue findings.json [open-issue.json] > body.md   # empty output: nothing new
//
// A finding is something a nightly run must never show, whatever the bot's skill: a page error or
// crash, a softlock (the mission never ended, a frozen world clock, a job that hung the page), HUD
// panels overlapping, a false marker, or a B-17 loss counted twice. Losing a mission is not a finding
// (the human-level bot loses some); neither are frame times (software rendering on CI says nothing
// about the real GPU budget).
import fs from 'node:fs';
import path from 'node:path';

export const STUCK_S = 5;   // a world clock frozen this long while 'playing' is a softlock

/** Scenario name of one qa_sweep line: `campaign:m1 recruit low/en`. */
export function scenario(row) {
  const j = row.job ?? {}, env = row.env ?? {};
  return `${j.kind ?? '?'}:${j.id ?? j.role ?? '?'} ${j.diff ?? 'veteran'} ${env.quality ?? 'low'}/${env.lang ?? 'en'}`;
}

// Error text without the parts that change from run to run (numbers, hashes, URLs' query strings)
const norm = (s) => String(s).replace(/\?[^\s)'"]*/g, '').replace(/\b[0-9a-f]{8,}\b/gi, '#').replace(/\d+(\.\d+)?/g, 'N').slice(0, 160);

/** The findings of one qa_sweep line. `key` is stable across nights, so known issues are not reported twice. */
export function classify(row) {
  const out = [];
  const name = scenario(row);
  const add = (kind, detail, sig = detail) => out.push({ kind, scenario: name, detail, key: `${kind}|${name}|${norm(sig)}` });
  if (row.crash) {
    const hung = /softlock|job timeout/i.test(row.crash);
    add(hung ? 'softlock' : 'crash', row.crash.slice(0, 300), hung ? 'job hung' : row.crash);
  }
  for (const e of new Set((row.errors ?? []).map(norm))) add('error', (row.errors.find((x) => norm(x) === e) ?? e).slice(0, 300), e);
  if (row.crash) return out;
  if (row.timeout) add('softlock', `mission never ended: ${row.result ?? 'timeout'} after ${row.t ?? '?'} s`, 'timeout');
  const q = row.qa;
  if (!q) return out;
  if (q.stuck >= STUCK_S) add('softlock', `world clock frozen for ${q.stuck} s while playing`, 'frozen clock');
  for (const [issue, n] of Object.entries(q.hud?.issues ?? {})) add('hud-overlap', `${issue} (${n}/${q.hud.samples} samples)`, issue);
  if (q.markers?.falseMarkers > 0) {
    for (const [reason, n] of Object.entries(q.markers.reasons ?? {})) add('false-marker', `${reason} ×${n}`, reason);
    if (!Object.keys(q.markers.reasons ?? {}).length) add('false-marker', `${q.markers.falseMarkers} false markers`, 'unknown');
  }
  if (q.losses?.doubled > 0) add('double-loss', `${q.losses.doubled} B-17 losses counted twice`, 'doubled');
  return out;
}

/** Job `i` goes to shard `i % n` (1-based `shard`), so every shard gets a mix of missions and difficulties. */
export function shardJobs(jobs, shard, n) {
  if (!(n >= 1) || !(shard >= 1 && shard <= n)) throw new Error(`bad shard ${shard}/${n}`);
  return jobs.filter((_, i) => i % n === shard - 1);
}

/** Parse `QA_SHARD=2/8`; undefined → the whole list. */
export function parseShard(s) {
  if (!s) return null;
  const m = /^(\d+)\/(\d+)$/.exec(s.trim());
  if (!m) throw new Error(`QA_SHARD must look like 2/8, got ${s}`);
  return { shard: +m[1], n: +m[2] };
}

const KINDS = ['crash', 'softlock', 'error', 'hud-overlap', 'false-marker', 'double-loss'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function outcome(r) {
  if (r.crash) return 'CRASH';
  if (r.stopped) return `survived ${r.rounds?.length ?? 0} rounds`;
  if (r.success) return 'win';
  if (r.timeout) return 'TIMEOUT';
  return `loss${r.failCause ? ': ' + String(r.failCause).slice(0, 40) : ''}`;
}

/** Markdown summary of a night: totals, findings by kind, and one row per scenario. */
export function summarize(rows, meta = {}) {
  const findings = rows.flatMap(classify);
  // a shard that died before writing its lines (dev server, browser install) must not read as a clean night
  if (meta.sweepResult && meta.sweepResult !== 'success') {
    findings.unshift({ kind: 'crash', scenario: 'sweep', detail: `a sweep shard ended '${meta.sweepResult}': some runs are missing`, key: 'crash|sweep|incomplete' });
  }
  const by = Object.fromEntries(KINDS.map((k) => [k, findings.filter((f) => f.kind === k)]));
  const lines = [];
  lines.push(`# Nightly QA ${meta.date ?? ''}`.trim(), '');
  if (meta.sha) lines.push(`Commit \`${meta.sha.slice(0, 7)}\`${meta.runUrl ? ` · [workflow run](${meta.runUrl})` : ''}`, '');
  const wins = rows.filter((r) => !r.crash && (r.success || r.stopped)).length;
  lines.push(`**${rows.length} runs** · ${wins} won/survived · ${findings.length ? `**${findings.length} findings**` : 'no findings'}`, '');
  lines.push('| Check | Findings |', '|---|---|');
  for (const k of KINDS) lines.push(`| ${k} | ${by[k].length} |`);
  lines.push('');
  if (findings.length) {
    lines.push('## Findings', '');
    for (const f of findings) lines.push(`- **${f.kind}** · ${cell(f.scenario)} · ${cell(f.detail)}`);
    lines.push('');
  }
  lines.push('## Runs', '', '| Scenario | Result | Game time | Kills | B-17 lost | HUD samples | Markers checked | Errors | Wall s |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const q = r.qa;
    lines.push(`| ${cell(scenario(r))} | ${cell(outcome(r))} | ${r.t != null ? mmss(r.t) : '-'} | ${r.kills ?? '-'} | ${r.bombersLost ?? '-'} | ${q?.hud?.samples ?? '-'} | ${q?.markers?.checked ?? '-'} | ${r.errors?.length ?? 0} | ${r.wallS ?? '-'} |`);
  }
  return { markdown: lines.join('\n') + '\n', findings };
}

const KEYS_RE = /<!-- nightly-qa-keys: (\[.*?\]) -->/g;

/** Finding keys already reported in an open issue (its body and comments). */
export function reportedKeys(texts) {
  const keys = new Set();
  for (const t of texts) for (const m of String(t ?? '').matchAll(KEYS_RE)) { try { for (const k of JSON.parse(m[1])) keys.add(k); } catch { /* hand-edited */ } }
  return keys;
}

/** Issue (or comment) body for the findings not yet reported; '' when there is nothing new. */
export function issueBody(findings, known = new Set(), meta = {}) {
  const fresh = [];
  const seen = new Set();
  for (const f of findings) if (!known.has(f.key) && !seen.has(f.key)) { seen.add(f.key); fresh.push(f); }
  if (!fresh.length) return '';
  const lines = [`Nightly QA ${meta.date ?? ''} found ${fresh.length} new problem${fresh.length > 1 ? 's' : ''}${meta.sha ? ` on \`${meta.sha.slice(0, 7)}\`` : ''}.`.replace('QA  found', 'QA found'), ''];
  for (const k of KINDS) {
    const fs_ = fresh.filter((f) => f.kind === k);
    if (!fs_.length) continue;
    lines.push(`### ${k} (${fs_.length})`, '');
    for (const f of fs_.slice(0, 30)) lines.push(`- ${cell(f.scenario)} · ${cell(f.detail)}`);
    if (fs_.length > 30) lines.push(`- … ${fs_.length - 30} more (see the summary artifact)`);
    lines.push('');
  }
  if (meta.runUrl) lines.push(`Full summary and JSON lines: ${meta.runUrl} (artifact \`nightly-qa-summary\`).`, '');
  lines.push(`<!-- nightly-qa-keys: ${JSON.stringify(fresh.map((f) => f.key))} -->`);
  return lines.join('\n') + '\n';
}

function readRows(inputs) {
  const files = inputs.flatMap((p) => fs.statSync(p).isDirectory()
    ? fs.readdirSync(p, { recursive: true }).map(String).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(p, f))
    : [p]);
  return files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)));
}

function meta() {
  const e = process.env;
  return {
    date: new Date().toISOString().slice(0, 10),
    sha: e.GITHUB_SHA,
    sweepResult: e.NIGHTLY_SWEEP_RESULT,
    runUrl: e.GITHUB_RUN_ID ? `${e.GITHUB_SERVER_URL ?? 'https://github.com'}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}` : undefined,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); if (i < 0) return undefined; const v = rest[i + 1]; rest.splice(i, 2); return v; };
  if (cmd === 'summary') {
    const md = opt('--md'), json = opt('--json');
    const rows = readRows(rest);
    const { markdown, findings } = summarize(rows, meta());
    if (md) fs.writeFileSync(md, markdown); else process.stdout.write(markdown);
    if (json) fs.writeFileSync(json, JSON.stringify({ runs: rows.length, findings }, null, 1));
    console.error(`${rows.length} runs, ${findings.length} findings`);
  } else if (cmd === 'issue') {
    const { findings } = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
    let known = new Set();
    if (rest[1] && fs.existsSync(rest[1]) && fs.statSync(rest[1]).size) {
      const open = JSON.parse(fs.readFileSync(rest[1], 'utf8'));   // `gh issue view N --json body,comments`
      known = reportedKeys([open.body, ...(open.comments ?? []).map((c) => c.body)]);
    }
    process.stdout.write(issueBody(findings, known, meta()));
  } else {
    console.error('usage: nightly_qa.mjs summary <jsonl|dir...> [--md f] [--json f] | issue findings.json [open-issue.json]');
    process.exit(2);
  }
}
