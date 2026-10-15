# Phase 11 · 18 — Co-op lobbies and quick join

Report: `docs/phase11/reports/18.md` · Branch: `phase11/18-coop-lobbies`

Public co-op lobby browser and quick join for the B-17 crew mode, friend invite links, region/latency hints, rejoin after disconnect, host migration if the host leaves mid-round (fallback: graceful end). Firestore rules: merge only, don't deploy (report changes).

Rules: read `AGENTS.md`, `docs/PHASE11.md`, `docs/LEAD_HANDOVER.md`. Arabic for all new player text (add a new table file in `src/i18n/ar/`), simple UI per Phase 8, tests for new logic, push your branch and get CI green. Never push main.
