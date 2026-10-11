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

## Hard constraints
- Do NOT use any browser, browser plugin, computer-use or GUI automation tool, and do not start
  Playwright, Chrome, Edge, Firefox or Safari. Verification here is code + unit tests + `npm run
  check`; visual and in-game checks are done separately by the reviewer.
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
