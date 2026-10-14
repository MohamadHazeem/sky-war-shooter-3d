# Testing

Three layers, from fastest to slowest:

| Layer | Command | Where it runs | What it catches |
|---|---|---|---|
| Unit tests | `npm test` | Node (Vitest), locally and in CI | Broken maths and rules in the pure game logic |
| Full gate | `npm run check` | Locally and in CI | Type errors, build breakage, failing unit tests |
| Scripted playtest | `sws.autoplay(...)`, `sws.bench()` | The dev server in the built-in Claude browser, by hand | Gameplay, rendering and performance regressions |

## Unit tests

`npm test` runs `vitest run` over `tests/**/*.test.ts` (config: `vitest.config.ts`). The tests run in plain Node:
three.js maths works without WebGL, and the only mocks are an in-memory `localStorage` and a seeded
`Math.random` (`tests/helpers.ts`). No browser and no DOM are involved.

| File | Module(s) | Covers |
|---|---|---|
| `tests/upgrades.test.ts` | `src/game/Upgrades.ts` | Loadout multipliers (levels × stacking perks, aircraft and weapon stats, fallbacks), perk awarding (no duplicate non-stacking perks), buy/unlock/select/earn, save/load round trip, `belts`/`reload` save migration, corrupt or blocked storage, table sanity |
| `tests/missions.test.ts` | `src/game/Missions.ts` | Campaign table and ROUNDS sanity, `roundDef` for every campaign mission (monotonic difficulty, first round starts at the base, last round reaches the full ramp, durations add up), survival escalation and caps |
| `tests/enemyTypes.test.ts` | `src/world/EnemyTypes.ts` | `randomEnemyType` distribution per tier matches its weights exactly, edge values of `Math.random`, variant table sanity |
| `tests/flight.test.ts` | `src/world/FlightModel.ts` (+ `steerTo`) | Steady straight flight, altitude hold, AoA/G limiter keeps a full pull out of the stall, unlimited slow pull does stall, no NaN over 60 s of random stick for every airframe |
| `tests/ballistics.test.ts` | `src/world/Ballistics.ts` | `segSphere` hit/miss/graze/inside cases, gravity drop and drag, time to live, pool cap, hits with zone/shooter/playerShot, friendly and wreck filtering, `playerHitScale` only for the player's rounds, near-miss callback |
| `tests/ai.test.ts` | `src/world/AI.ts` | `leadPoint` (gravity only, crossing target arrives with the bullet, relative velocity, no input mutation), `steerTo` outputs in range for 2000 random attitudes, bank/pull direction, closed-loop turn onto a new heading |
| `tests/helpersPure.test.ts` | `Combo`, `CombatTally`, `KeyAim`, `B17Layout`, `Achievements` | Combo step/cap/hold/decay, kill tally per gun, keyboard-aim ramp, angle wrapping and station arcs, achievement unlock rules and persistence |

Adding tests: keep them on modules that do not touch `window` or `document` at import time. If a module
you want to test does, prefer exporting the pure function you need over mocking the DOM.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: Node 22, `npm ci`, then `npm run check`,
which is `tsc --noEmit && vite build --logLevel error && vitest run`. It takes well under three minutes. CI has
no browser-based tests; gameplay is checked with the scripted playtest below.

Run the same gate locally before pushing:

```
npm ci
npm run check
```

## Manual in-browser regression (scripted playtest)

`src/dev/autoplay.ts` is a scripted player that is loaded only in the dev build and exposed as
`window.sws.autoplay`. It flies or mans the guns, clicks through the perk cards and hangar, and runs a
mission to the debrief.

1. Start the dev server: `npm run dev` (http://127.0.0.1:5173).
2. Open it in the built-in Claude browser (the Browser pane), in its own new tab. Do not use other browsers for this.
3. In the page's console (or the browser tool's JavaScript runner), run every campaign mission:

   ```js
   for (let i = 0; i < sws.CAMPAIGN.length; i++) console.log(i, sws.autoplay(sws.CAMPAIGN[i], 9000));
   ```

   Or one at a time: `sws.autoplay(sws.CAMPAIGN[i], 9000)`. Each call returns a summary string; every
   mission should reach its debrief without errors in the console. Survival can be smoke-tested with
   `sws.autoplay(sws.survivalMission('gunner'), 6000)` and `sws.autoplay(sws.survivalMission('pilot'), 6000)`.
4. Check the frame-time budget with `sws.bench()` (120 rendered frames, GPU-synced). It returns
   `{ avg, p50, p95, max, calls, tris, programs, w, h }` in milliseconds; compare `p95` with the previous
   run and against the 16.7 ms (60 fps) budget, and watch `calls` and `programs` for jumps.

Other hooks on `window.sws`: `step(n, dt, render)` advances the simulation manually and `shot(q)` returns a
JPEG data URL of the current frame.

## Bug sweep (`tools/qa_sweep.mjs`)

The Phase 9 bug sweep (`docs/phase9/reports/07.md`) runs autoplay jobs through `sws.qa(job)` (`src/dev/qaSweep.ts`,
dev build only) from the shell with an existing Playwright install. On top of the balance metrics (`src/dev/balance.ts`)
each run samples, every 100 steps while the mission is live: one GPU-synced rendered frame (frame spikes), HUD panel
overlaps (`sws.hudOverlaps`) and the markers drawn in that frame (false markers); it also reports shader programs,
GPU geometries/textures and JS heap from the first in-mission sample to the end, a frozen-clock (stuck) check, the game
states seen, and whether any B-17 loss was counted twice. Every job starts from a wiped profile.

```
npx vite --port 5297 --strictPort &
PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs node tools/qa_sweep.mjs campaign out.jsonl   # or difficulty, survival, highar, ace, smoke
node tools/qa_sweep.mjs --report out.jsonl                                                    # Markdown table
```
