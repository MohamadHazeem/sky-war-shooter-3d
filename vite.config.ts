import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const PUBLIC = resolve(import.meta.dirname, 'public');

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.isFile() && e.name !== '.DS_Store') out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

// Byte size of every model and audio file (voice clips excepted: they load lazily), for the
// loading screen's progress bar (src/core/Assets.ts)
function assetSizes() {
  const sizes: Record<string, number> = {};
  for (const p of listFiles(PUBLIC)) {
    if (/^models\/.*\.glb$/.test(p) || (/^audio\/[^/]+$/.test(p) && !p.endsWith('.md'))) sizes[p] = statSync(join(PUBLIC, p)).size;
  }
  return sizes;
}

// Writes dist/sw.js from src/pwa/sw-template.js after the build: the app shell (index.html,
// hashed bundles, manifest, icons) and every model/audio file with a content revision.
// VERSION is a hash of all of it, so every deploy that changes anything gets a new worker.
function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sws-pwa',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      // og-image.jpg is for link previews only: not worth precaching
      const files = listFiles(outDir).filter((p) => p !== 'sw.js' && p !== '_headers' && p !== 'og-image.jpg' && !p.endsWith('.md'));
      const rev = (p: string) => createHash('sha256').update(readFileSync(join(outDir, p))).digest('hex').slice(0, 12);
      const shell: string[] = [];
      const media: Record<string, string> = {};
      for (const p of files) {
        if (p.startsWith('models/') || p.startsWith('audio/')) media[p] = rev(p);
        else shell.push(p);
      }
      shell.sort();
      const version = createHash('sha256')
        .update(shell.map((p) => p + rev(p)).join())
        .update(JSON.stringify(media))
        .digest('hex').slice(0, 12);
      const sw = readFileSync(resolve(import.meta.dirname, 'src/pwa/sw-template.js'), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__MEDIA__', JSON.stringify(media));
      writeFileSync(join(outDir, 'sw.js'), sw);
      this.info?.(`sw.js: version ${version}, ${shell.length} shell + ${Object.keys(media).length} media files`);
    },
  };
}

// Dev server only: POST /__dev/save?path=<file> stores the request body in the repo, for the
// in-browser tools in src/dev (sws.ogCard() -> public/og-image.jpg, sws.trailer({ save: true })
// -> trailer-out/*.webm, which is git-ignored). Only these paths are writable.
const DEV_SAVE = [/^public\/og-image\.jpg$/, /^docs\/screenshots\/[\w.-]+\.(png|jpg)$/, /^trailer-out\/[\w.-]+\.webm$/,
  /^docs\/phase10\/shots\/\d\d\/[\w-]+\.jpg$/];   // Phase 10 captures (e.g. sws.destruction.capture(): docs/phase10/shots/09/)
function devSavePlugin(): Plugin {
  return {
    name: 'sws-dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        const path = new URL(req.url ?? '', 'http://x').searchParams.get('path') ?? '';
        if (req.method !== 'POST' || !DEV_SAVE.some((r) => r.test(path))) { res.statusCode = 403; res.end('forbidden'); return; }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const file = resolve(import.meta.dirname, path);
          mkdirSync(resolve(file, '..'), { recursive: true });
          const buf = Buffer.concat(chunks);
          writeFileSync(file, buf);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ path, bytes: buf.length }));
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  define: { __ASSET_SIZES__: JSON.stringify(assetSizes()) },
  plugins: [pwaPlugin(), devSavePlugin()],
});
