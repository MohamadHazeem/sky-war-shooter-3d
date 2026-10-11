#!/usr/bin/env node
// Collects the balance harness's results (src/dev/balance.ts sends each finished run with
// navigator.sendBeacon to http://127.0.0.1:4176/) and appends them, one JSON per line, to the
// file given (default /tmp/sws-balance-results.jsonl), so a long queued run can be watched
// and analysed from the shell. Usage: node tools/balance_sink.mjs [out.jsonl] [port]
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/sws-balance-results.jsonl';
const port = Number(process.argv[3] ?? 4176);
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.end('ok'); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try { appendFileSync(out, JSON.stringify(JSON.parse(body)) + '\n'); } catch (e) { console.error('bad result', e); }
    res.end('ok');
  });
}).listen(port, '127.0.0.1', () => console.log(`balance sink on http://127.0.0.1:${port}/ -> ${out}`));
