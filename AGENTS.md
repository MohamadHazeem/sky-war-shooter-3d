# Rules for coding agents (Codex) in this repository

Sky War Shooter 3D: a WWII browser game (Three.js r186 + TypeScript + Vite). Read `README.md`,
`docs/ARCHITECTURE.md` (game loop, where to hook features) and the task file you were given.

## Workflow
- You work in a git worktree on your own branch. Commit there with the repo's local git config
  (already set to the personal profile). Never change git config, never push, never deploy
  (`npm run deploy` is off limits), never touch other branches.
- End every commit message with: `Co-Authored-By: OpenAI Codex <noreply@openai.com>`
- `node_modules` is a symlink to the main checkout: never commit it; `git add` specific paths.
- Before committing: `npm run check` (tsc + vite build + vitest) must pass.
- When done, write a short report to the path given in the task (what changed, files, hook lines,
  test results, anything not done) — this is how your work gets reviewed.

## Speed rules (owner wants fast iteration; the machine is shared by ~10 agents)
- While iterating, run only the relevant tests (`npx vitest run tests/<file>.test.ts`) and `npx tsc --noEmit`;
  run the full `npm run check` once before each commit, not after every edit.
- Screenshots: capture only what the task asks for. For graphics goals use the Phase 10 capture rig
  (`node tools/visual_rig.mjs --out docs/<phase>/shots/<goal>/after`) instead of ad-hoc angle/size/language sweeps;
  add Arabic / phone / multi-size captures only for UI work.
- One dev server per task, stopped when done; don't leave Chrome/Playwright instances running.
- Heavy offline jobs (Blender bakes, simulations): render at the resolution actually shipped; no exploratory
  full-quality renders.

## Hard constraints
- Visual checks: you MAY use your browser tool (preferred) to verify your work in the running game.
  Start your own dev server from your worktree on the port given in your task
  (`npx vite --port <port> --strictPort`, in the background) and stop it when done. Hidden or
  background tabs do not run requestAnimationFrame: drive frames with `window.sws.step(n, dt, render)`
  and inspect with `sws.game`, `sws.autoplay(mission, steps)`, `sws.bench(n)`, `sws.vqa` (see
  `docs/ARCHITECTURE.md` and `src/main.ts`). NEVER use computer-use (real mouse/keyboard/screen
  control): it takes over the owner's desktop. Use headless browsers or the browser tool only. Save screenshots you rely on (small JPEGs) under
  `docs/phase6/shots/<task>/` and reference them in your report.
- No network installs of new dependencies unless the task says so.
- Every new player-visible string needs Arabic: add it to a table in `src/i18n/ar/*.ts` (register new
  tables in `src/i18n/phrases.ts`). `tests/i18n.test.ts` enforces coverage of mission texts and
  recorded radio lines.
- New radio lines go into `tools/voice/lines.json`, inserted BEFORE the
  `briefings (tools/voice/briefings.mjs)` group, then `python3 tools/voice/generate.py` (macOS `say`).
- Performance: no per-frame allocations in hot paths; no runtime shader recompiles (warm new
  materials in `World.prewarm`); keep the Low preset working.
- Keep changes focused on the task; small hook lines in shared files (Game.ts, World.ts, UI.ts).
- Never commit secrets, `.env` files or tokens.
