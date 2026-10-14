// Pass attribution with GPU timer queries (when exposed), plus CPU submission time.
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const stage = process.argv[2] ?? 'after';
const out = process.env.PERF_OUTPUT ?? `docs/phase10/shots/12/${stage}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--use-angle=metal', '--enable-gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:5312/tools/visual-rig.html?shot=formation-chase&quality=${process.env.PERF_TIER ?? 'high'}`);
  await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout: 180000 });
  const result = await page.evaluate(async () => {
    const rig = window.visualRig; if (rig.error) throw Error(rig.error);
    // Rig replaces performance.now with simulation time; recover the real clock from an iframe.
    const iframe = document.createElement('iframe'); document.body.append(iframe);
    const now = iframe.contentWindow.performance.now.bind(iframe.contentWindow.performance);
    const e = rig.engine, r = e.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const entries = [], restore = []; let active = false;
    function wrap(obj, key, label, accept = () => true) {
      const orig = obj[key];
      obj[key] = function (...args) {
        if (active || !accept(...args)) return orig.apply(this, args);
        const q = ext && gl.createQuery(); if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        active = true; const t = now();
        try { return orig.apply(this, args); }
        finally { entries.push({ label: typeof label === 'function' ? label(...args) : label, cpu: now() - t, q }); active = false; if (q) gl.endQuery(ext.TIME_ELAPSED_EXT); }
      };
      restore.push(() => obj[key] = orig);
    }
    if(e.submission) wrap(e.submission, 'prepare', 'pose + batch preparation');
    wrap(e, 'sortLayers', 'layer classification');
    wrap(e.clouds, 'render', 'clouds'); wrap(e.temporal, 'render', 'velocity + AO + TAA');
    wrap(e.post, 'render', 'post + bloom + film'); wrap(e.heatHaze, 'render', 'haze');
    wrap(r, 'render', (_, cam) => cam.layers.mask === 1 ? 'opaque + shadows + terrain' : 'transparent effects + stream', scene => scene === e.scene || scene === e.submission?.scene);
    if (e.skyCache) wrap(e.skyCache, 'renderBackground', 'sky + terrain cache');
    try { await rig.benchmark(120); } finally { restore.reverse().forEach(f => f()); }
    await new Promise(resolve => setTimeout(resolve, 100));
    const disjoint = ext ? gl.getParameter(ext.GPU_DISJOINT_EXT) : null;
    const groups = {};
    for (const p of entries) {
      const g = groups[p.label] ??= { cpu: [], gpu: [] }; g.cpu.push(p.cpu);
      if (p.q) { if (!disjoint && gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) g.gpu.push(gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(p.q); }
    }
    const stats = a => { a.sort((a,b)=>a-b); return { n:a.length, mean:a.reduce((a,b)=>a+b,0)/a.length, p95:a[Math.floor(a.length*.95)] }; };
    for (const g of Object.values(groups)) { g.cpu=stats(g.cpu); g.gpu=stats(g.gpu); }
    iframe.remove();
    return { device: rig.metadata.deviceInfo, gpuTimerAvailable: !!ext, disjoint, groups };
  });
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(`${out}/profile.json`, JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
