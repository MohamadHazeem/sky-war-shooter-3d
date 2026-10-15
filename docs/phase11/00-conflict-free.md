# Phase 11 · 00 — Conflict-free shared registries (process speed)

Report: `docs/phase11/reports/00.md` · Branch: `phase11/00-conflict-free`

Almost every merge conflict comes from three shared files every goal edits. Make additions conflict-free:
1. **Arabic tables** (`src/i18n/phrases.ts`): keep the existing explicit `TABLES` order exactly (precedence matters:
   later tables override earlier ones via `Object.assign`), but auto-discover any `src/i18n/ar/*.ts` table that is not
   in the explicit list with `import.meta.glob(..., { eager: true })` and place those FIRST (same as today's
   convention of prepending new tables). New goals then only add a file. Works in Vite and Vitest.
2. **Voice lines** (`tools/voice/lines.json` + `tools/voice/generate.py`): support extra line groups in
   `tools/voice/lines.d/*.json` (each a JSON array of line objects incl. a `{"group": "..."}` header), loaded in sorted
   filename order and inserted before the `briefings (tools/voice/briefings.mjs)` group. Existing content/hashes must
   not change (no clip re-renders): verify `python3 tools/voice/generate.py --check` and that the manifest is identical.
   Document in `tools/voice/README.md` and AGENTS.md ("new radio lines go in a new `tools/voice/lines.d/<goal>.json`").
3. **AGENTS.md**: update the Arabic/voice rules accordingly.
Tests: a unit test that a table placed only in `src/i18n/ar/` is picked up; Python test for lines.d ordering.
Do not touch anything else. Push the branch `phase11/00-conflict-free` and make sure GitHub CI is green.
