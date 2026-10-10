#!/usr/bin/env node
// Size breakdown of a build output folder (default: dist/).
//
//   node tools/size_report.mjs [dir] [--top N] [--json]
//
// Prints the total, a per-folder breakdown (first two path levels), the largest files,
// and the gzip size of compressible text files (what a CDN actually sends for JS/CSS/HTML/JSON).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'dist';
const topIdx = args.indexOf('--top');
const TOP = topIdx >= 0 ? Number(args[topIdx + 1]) || 15 : 15;
const asJson = args.includes('--json');
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.webmanifest', '.txt', '.md']);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) files.push({ path: relative(dir, p).split(sep).join('/'), size: statSync(p).size, abs: p });
  }
})(dir);

const groupOf = (p) => {
  const parts = p.split('/');
  if (parts.length === 1) return '(root)';
  return parts.length > 2 ? `${parts[0]}/${parts[1]}/` : `${parts[0]}/`;
};
const groups = new Map();
let total = 0, gzTotal = 0;
for (const f of files) {
  total += f.size;
  f.gz = TEXT.has(extname(f.path)) ? gzipSync(readFileSync(f.abs), { level: 9 }).length : f.size;
  gzTotal += f.gz;
  const g = groups.get(groupOf(f.path)) ?? { files: 0, size: 0, gz: 0 };
  g.files++; g.size += f.size; g.gz += f.gz;
  groups.set(groupOf(f.path), g);
}
const byExt = new Map();
for (const f of files) {
  const e = extname(f.path) || '(none)';
  const g = byExt.get(e) ?? { files: 0, size: 0 };
  g.files++; g.size += f.size;
  byExt.set(e, g);
}

if (asJson) {
  console.log(JSON.stringify({
    dir, files: files.length, bytes: total, transferBytes: gzTotal,
    groups: Object.fromEntries([...groups].sort((a, b) => b[1].size - a[1].size)),
    largest: [...files].sort((a, b) => b.size - a.size).slice(0, TOP).map(({ path, size, gz }) => ({ path, size, gz })),
  }, null, 2));
  process.exit(0);
}

const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log(`\n${dir}: ${files.length} files, ${fmt(total)} on disk, ~${fmt(gzTotal)} over the wire (text gzipped)\n`);
console.log(`${pad('folder', 26)}${lpad('files', 7)}${lpad('size', 12)}${lpad('wire', 12)}${lpad('share', 8)}`);
for (const [g, v] of [...groups].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`${pad(g, 26)}${lpad(v.files, 7)}${lpad(fmt(v.size), 12)}${lpad(fmt(v.gz), 12)}${lpad(((v.size / total) * 100).toFixed(1) + '%', 8)}`);
}
console.log(`\n${pad('type', 26)}${lpad('files', 7)}${lpad('size', 12)}`);
for (const [e, v] of [...byExt].sort((a, b) => b[1].size - a[1].size)) console.log(`${pad(e, 26)}${lpad(v.files, 7)}${lpad(fmt(v.size), 12)}`);
console.log(`\nlargest ${TOP} files`);
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, TOP)) {
  console.log(`  ${pad(f.path, 44)}${lpad(fmt(f.size), 11)}${f.gz !== f.size ? `  (gzip ${fmt(f.gz)})` : ''}`);
}
console.log('');
