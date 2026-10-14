# Fixed visual captures

From the worktree root, start your own Vite server (use the port assigned to your goal):

```sh
npx vite --port 5300 --strictPort
```

In another terminal:

```sh
node tools/visual_rig.mjs --out docs/phase10/shots/<goal>/after
node tools/visual_rig.mjs --url http://127.0.0.1:5300 --out docs/phase10/shots/<goal>/low --quality low
node tools/visual_score.mjs --in docs/phase10/shots/baseline --out docs/phase10/scorecard.md
```

The capture command defaults to port 5300, High, WebGL2 and seed 19431008. It uses an existing Playwright installation and installed Chrome, with no installs or downloads. It checks the project module first, then Codex's existing cached runtime. If neither exists, point `PLAYWRIGHT_MODULE` at your existing `playwright/index.mjs`. Set `--url` when your assigned server uses another port. Stop the dev server when finished.

Each run writes 1920×1080 lossless PNGs, 960-pixel JPEG previews, PNG/JPEG contact sheets, `manifest.json`, `metrics.json`, and a generated `scorecard.md` in the output directory. All JPEGs, including the contact sheet, are capped at 250,000 bytes. PNGs under `docs/phase10/shots/` are git-ignored; commit JPEGs, metadata and your report using explicit paths. Low/Medium keep the game's native pixel budget, then resample the output PNG to 1080p; `renderSize` records the actual resolution. High renders natively at 1920×1080 on DPR 1.

Use `--shots waist-fw190,p51-cockpit` for a subset, `--seed 19431008` for an explicit seed, and `--verify-repeat` to capture each shot twice in fresh contexts and require identical decoded pixel hashes. Repeat checks apply to the same browser/GPU/build: floating point output is not promised identical across different GPUs or backends. Frame times intentionally vary and are excluded from pixel comparison.

## Inspecting a fixture

Open `http://127.0.0.1:5300/tools/visual-rig.html?shot=waist-fw190&quality=high&backend=webgl2`. The page loads the real game assets and production render pipeline, builds the fixture, steps exactly 360 × 1/60 seconds, then freezes. It never starts requestAnimationFrame, so it works in a hidden tab. Read `window.visualRig.metadata`, `.game`, `.engine`, or await `.png()` / `.benchmark()` in the browser console. Choose another shot via the URL, which resets the entire page.

The 16 fixture IDs and pillar coverage are in `tools/visual-shots.json`. Scene composition lives in `src/dev/VisualRigScene.ts`; seeds, weather and constants in `VisualRigConfig.ts`. The dedicated entry imports game modules only after setting the seed, reseeds after asynchronous loading, uses an in-memory localStorage replacement, fixes Date/performance simulation clocks, disables live mission orchestration, and explicitly places subjects/cameras. Render timing retains a separate real clock. Audio/network timing and menu frames do not drive the fixtures. The CLI blocks off-origin traffic and fails on asset HTTP errors, browser exceptions and graphics errors.

Each shot warms 24 renders with frozen simulation time. Timing samples render the same frozen scene and use a GPU fence (WebGL2: synchronous one-pixel readback). The manifest records camera, weather, subjects, output/native sizes, browser version, source revision, pixel hash and shader program counts. A program-count change during measurement fails the run. These are render timings, not full game-loop FPS or a substitute for gameplay/Low regression tests. Metric definitions and caveats are printed in the scorecard. Lossless PNGs are used when available; rescoring a committed JPEG-only checkout explicitly labels its metrics as lossy-preview measurements.

Generated scorecards overwrite the destination; put scored judgments and explanations in the goal report, or copy the generated table before editing it. Keep the baseline immutable after this goal. Never silently adjust the fixture to flatter a graphics change; bump `RIG_VERSION` and recapture both sides if composition must change.

## Goal 01: WebGPU integration

`--backend webgpu` is already routed through the page and recorded in metadata. It deliberately fails with an explanatory error until the WebGPU renderer exists; it never falls back and labels a WebGL screenshot as WebGPU.

Provide `src/dev/VisualRigWebGPU.ts`, exporting `createRigBackend(container): Promise<RigBackend>` (interface in `VisualRigBackend.ts`). Return the initialized production Engine with the same world/camera/controller API, `backend: 'webgpu'`, `render(dt)` (may be async), and `sync()` that waits for the actual GPU queue. Scene construction, shot IDs, PNG extraction, JPEGs, scorecards and repeat verification remain shared. Adapt that factory to goal 01's Engine initialization API. The existing WebGL2 adapter stays the fallback comparison path. This goal cannot validate a renderer that has not been implemented yet.

```sh
node tools/visual_rig.mjs --backend webgpu --out docs/phase10/shots/01/webgpu
node tools/visual_rig.mjs --backend webgl2 --out docs/phase10/shots/01/webgl2
```
