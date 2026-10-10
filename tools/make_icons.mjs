#!/usr/bin/env node
// Renders the PWA / home-screen icons from tools/icons/icon.svg into public/icons/:
//   icon-192.png, icon-512.png       (purpose "any": full-bleed square, the browser rounds it)
//   maskable-512.png                 (purpose "maskable": artwork shrunk into the 80 % safe zone)
//   apple-touch-icon.png (180 px)
//
//   npm run icons
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'public/icons');
const svg = readFileSync(join(REPO, 'tools/icons/icon.svg'));
mkdirSync(OUT, { recursive: true });

const png = (size) => sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 }).resize(size, size).png({ compressionLevel: 9 });
await png(192).toFile(join(OUT, 'icon-192.png'));
await png(512).toFile(join(OUT, 'icon-512.png'));
await png(180).toFile(join(OUT, 'apple-touch-icon.png'));
// maskable: the same artwork at 78 % on the background colour
const inner = await png(400).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1c1f12' } })
  .composite([{ input: inner, left: 56, top: 56 }])
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'maskable-512.png'));
console.log('icons written to public/icons/');
