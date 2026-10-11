#!/usr/bin/env node
// Summarises balance harness results (tools/balance_sink.mjs output, or a JSON array saved from
// sws.balance.results()) as a Markdown table: one row per job (tag, mode, bot skill), runs
// averaged. Usage: node tools/balance_report.mjs results.jsonl [more files...]
import { readFileSync } from 'node:fs';

const rows = [];
for (const f of process.argv.slice(2)) {
  const txt = readFileSync(f, 'utf8').trim();
  if (!txt) continue;
  if (txt.startsWith('[')) rows.push(...JSON.parse(txt));
  else for (const l of txt.split('\n')) if (l.trim()) rows.push(JSON.parse(l));
}
const name = (j) => `${j.kind}${j.id ? ':' + j.id : ''}${j.role && j.kind !== 'campaign' ? ':' + j.role : ''}${j.diff && j.diff !== 'veteran' ? ':' + j.diff : ''}`;
const by = new Map();
for (const r of rows) {
  if (r.error) { console.error('ERROR', name(r.job), r.error.slice(0, 200)); continue; }
  const k = `${r.job.tag ?? ''}|${name(r.job)}|${r.job.skill}`;
  if (!by.has(k)) by.set(k, []);
  by.get(k).push(r);
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '-');
console.log('| tag | job | skill | runs | pass | mission | rounds | boss (breach/kill per ship) | acc | kills/min | bombers lost | min hp | wounds | failures |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, rs] of [...by].sort()) {
  const [tag, job, skill] = k.split('|');
  const pass = `${rs.filter((r) => r.success).length}/${rs.length}`;
  const rounds = rs.length === 1 ? rs[0].rounds.map((x) => mmss(x.t) + (x.boss ? 'B' : '') + (x.complete ? '' : '?')).join(' ') : (() => {
    const n = Math.max(...rs.map((r) => r.rounds.length));
    const out = [];
    for (let i = 0; i < n; i++) out.push(mmss(avg(rs.map((r) => r.rounds[i]?.t).filter((x) => x !== undefined))) + (rs.some((r) => r.rounds[i]?.boss) ? 'B' : ''));
    return out.join(' ');
  })();
  const boss = rs.map((r) => r.boss.map((b) => `${mmss(b.t)} [${b.ships.map((s) => `${s.breach ?? '-'}/${s.t ?? '-'}`).join(', ')}]`).join(' ')).filter(Boolean).join('; ');
  const fails = [...new Set(rs.filter((r) => !r.success).map((r) => (r.failCause ?? r.result).slice(0, 60)))].join('; ');
  console.log(`| ${tag} | ${job} | ${skill === '1' ? 'bot' : 'human'} | ${rs.length} | ${pass} | ${mmss(avg(rs.map((r) => r.t)))} | ${rounds} | ${boss || '-'} | ${avg(rs.map((r) => r.accuracy)).toFixed(2)} | ${avg(rs.map((r) => r.kpm)).toFixed(1)} | ${avg(rs.map((r) => r.bombersLost)).toFixed(1)} | ${avg(rs.map((r) => r.minHp)).toFixed(2)} | ${avg(rs.map((r) => r.wounds)).toFixed(1)} | ${fails || '-'} |`);
}
