# Phase 11 · 22 — Nightly QA in CI

Report: `docs/phase11/reports/22.md` · Branch: `phase11/22-nightly-qa`

A scheduled GitHub Actions workflow (public repo, free) that runs headless autoplay sweeps (Playwright headless shell + SwiftShader/WebGL) across missions and difficulties nightly, uploads a summary artifact and opens an issue on regressions (errors, softlocks, HUD overlap, false markers).

Rules: read `AGENTS.md`, `docs/PHASE11.md`, `docs/LEAD_HANDOVER.md`. Arabic for all new player text (add a new table file in `src/i18n/ar/`), simple UI per Phase 8, tests for new logic, push your branch and get CI green. Never push main.
