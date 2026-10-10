import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
      const files = listFiles(outDir).filter((p) => p !== 'sw.js' && p !== '_headers' && !p.endsWith('.md'));
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

export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  define: { __ASSET_SIZES__: JSON.stringify(assetSizes()) },
  plugins: [pwaPlugin()],
});
