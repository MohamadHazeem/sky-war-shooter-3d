#!/usr/bin/env node
// Legacy | new side-by-side sheets for the goal 05b report: the FlightGear models as shipped before Phase 10
// (docs/phase10/shots/05/before-*, captured at the base commit by hero_shots.mjs) next to the same scripted
// scene with the current models (docs/phase10/shots/05b/after-*).
//   node tools/hero/luftwaffe/compare_sheets.mjs
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const OLD = 'docs/phase10/shots/05', NEW = 'docs/phase10/shots/05b';
const KINDS = ['bf109', 'fw190', 'me262', 'bf110', 'ju88'];
const W = 960, H = 540, HEAD = 34;
const label = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}"><rect width="100%" height="100%" fill="#1d2329"/><text x="12" y="23" font-family="Helvetica" font-size="18" fill="#f0f0ea">${t}</text></svg>`);

async function sheet(a, b, la, lb, out) {
  if (!existsSync(a) || !existsSync(b)) { console.log('skip', out); return; }
  const img = (f) => sharp(f).resize(W, H, { fit: 'contain', background: '#8fa6bd' }).toBuffer();
  await sharp({ create: { width: 2 * W, height: H + HEAD, channels: 3, background: '#1d2329' } })
    .composite([{ input: label(la), left: 0, top: 0 }, { input: label(lb), left: W, top: 0 },
      { input: await img(a), left: 0, top: HEAD }, { input: await img(b), left: W, top: HEAD }])
    .jpeg({ quality: 80 }).toFile(out);
  console.log(out);
}

for (const k of KINDS) {
  await sheet(`${OLD}/before-turntable-${k}.jpg`, `${NEW}/after-turntable-${k}.jpg`, `${k}: legacy (FlightGear, before Phase 10)`, `${k}: 05b hero (FlightGear shape + our parts / paint)`, `${NEW}/compare-turntable-${k}.jpg`);
  await sheet(`${OLD}/before-waist150-${k}.jpg`, `${NEW}/after-waist150-${k}.jpg`, `${k} at 150 m, waist gun: legacy`, `${k} at 150 m, waist gun: 05b hero`, `${NEW}/compare-waist150-${k}.jpg`);
  await sheet(`${OLD}/after-turntable-${k}.jpg`, `${NEW}/after-turntable-${k}.jpg`, `${k}: goal 05 (rejected, from-scratch shape)`, `${k}: 05b (FlightGear shape)`, `${NEW}/compare-05-turntable-${k}.jpg`);
}
await sheet(`${OLD}/before-tail-diving-bf109.jpg`, `${NEW}/after-tail-diving-bf109.jpg`, 'tail gun, diving Bf 109: legacy', 'tail gun, diving Bf 109: 05b hero', `${NEW}/compare-tail-diving-bf109.jpg`);
await sheet(`${OLD}/before-headon-fw190-wedge.jpg`, `${NEW}/after-headon-fw190-wedge.jpg`, 'top turret, Fw 190 wedge 420-520 m: legacy', 'top turret, Fw 190 wedge: 05b hero', `${NEW}/compare-headon-fw190-wedge.jpg`);
