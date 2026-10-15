# Rules for coding agents (Codex) in this repository

Sky War Shooter 3D: a WWII browser game (Three.js r186 + TypeScript + Vite). Read `README.md`,
`docs/ARCHITECTURE.md` (game loop, where to hook features) and the task file you were given.

## Workflow
- You work in a git worktree on your own branch. Commit there with the repo's local git config
  (already set to the personal profile). Never change git config, never deploy (`npm run deploy` is off
  limits), never touch other branches. You MAY push your own task branch (`git push -u origin HEAD`) —
  never main or integration — so GitHub Actions runs the full check (the repo is public: CI is free, ~2 min).
- End every commit message with: `Co-Authored-By: OpenAI Codex <noreply@openai.com>`
- `node_modules` is a symlink to the main checkout: never commit it; `git add` specific paths.
- Checks: while iterating run `npx tsc --noEmit` + only related tests (`npx vitest run tests/<file>.test.ts`).
  For the full suite push your branch and wait for CI: `~/.local/bin/gh run watch --exit-status $(~/.local/bin/gh run list
  --branch <your-branch> --limit 1 --json databaseId --jq '.[0].databaseId')`. Your work is done only when CI is green.
  Run the full `npm run check` locally only if CI is unavailable.
- Heavy jobs (Blender, capture rig, full local build, long autoplay) go through `tools/heavy.sh <cmd>` (a
  machine-wide slot limit) so ~10 parallel agents don't overload the Mac.
- Art goals: read `docs/phase11/reference-pack.md` first and wrap heavy asset builds in `tools/cached.sh <name> <inputs> -- <cmd>` so unchanged inputs are skipped.
- Quality gate: before finishing, compare your result with the LIVE game (main) using the same capture-rig
  shots; if it is not clearly better in the shots your goal touches, keep working. Weak results get rejected.
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
  control): it takes over the owner's desktop. Browser automation must use Playwright's bundled headless shell
  (`chromium.launch({ headless: true })` with NO `channel: 'chrome'`): launching the real Google Chrome app,
  even headless, steals focus and the mouse from the owner. Or use the built-in browser tool. Save screenshots you rely on (small JPEGs) under
  `docs/phase6/shots/<task>/` and reference them in your report.
- No network installs of new dependencies unless the task says so.
- Every new player-visible string needs Arabic: put it in a NEW table file `src/i18n/ar/<goal>.ts`
  (`export default` a `PhraseTable`). It is auto-discovered and loaded before the listed tables, so do NOT
  edit `src/i18n/phrases.ts` (only to deliberately change precedence). `tests/i18n.test.ts` enforces
  coverage of mission texts and recorded radio lines.
- French, German and Spanish mirror the Arabic tables: `src/i18n/{fr,de,es}/<same name>.ts` (same English keys,
  same pattern regexes; auto-discovered, lazy-loaded per language). Add them with your Arabic table;
  `tests/i18nLocales.test.ts` enforces mission texts, upgrades, radio lines and >99% of the Arabic keys
  (gap list: `I18N_GAPS=1 npx vitest run tests/i18nLocales.test.ts`). Interface keys of `en.ts` go in
  `src/i18n/ui/{fr,de,es}.ts`.
- New radio lines go in a new `tools/voice/lines.d/<goal>.json` (a JSON array starting with a
  `{"group": "..."}` header, then line objects), NOT in `tools/voice/lines.json`; files load in sorted
  filename order before the `briefings (tools/voice/briefings.mjs)` group. Then run
  `python3 tools/voice/generate.py` (macOS `say`).
- Performance: no per-frame allocations in hot paths; no runtime shader recompiles (warm new
  materials in `World.prewarm`); keep the Low preset working.
- Keep changes focused on the task; small hook lines in shared files (Game.ts, World.ts, UI.ts).
- Never commit secrets, `.env` files or tokens.
