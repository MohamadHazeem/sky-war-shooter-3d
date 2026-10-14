#!/usr/bin/env node
// Writes JSON posted by unattended dev runs (src/dev/aiQa.ts aiAuto) into a folder.
// Usage: node tools/json_sink.mjs <out-dir> [port=5320]   POST /?file=<name>.json
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 5320);
mkdirSync(dir, { recursive: true });
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  const file = new URL(req.url ?? '/', 'http://localhost').searchParams.get('file') ?? '';
  if (req.method !== 'POST' || !/^[a-z0-9_.-]+\.json$/i.test(file)) { res.statusCode = 400; res.end('bad request'); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => { writeFileSync(join(dir, file), body); res.end('ok'); console.log(file, body.length); });
}).listen(port, '127.0.0.1', () => console.log(`json sink on http://127.0.0.1:${port}/ -> ${dir}`));
