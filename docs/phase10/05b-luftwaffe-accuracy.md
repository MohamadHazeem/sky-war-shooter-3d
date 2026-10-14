# Phase 10 · Goal 05b — Luftwaffe models: accurate shapes first

Report: `docs/phase10/reports/05b.md` · Port 5305 · Shots: `docs/phase10/shots/05b/`
Continue on this branch (`phase10/05-luftwaffe-models`). Read your report and `docs/phase10/02b-hero-b17-rework.md`
+ `docs/phase10/reports/02b.md` / `02c.md` on main (same lesson for the B-17).

## Review (lead)
Paint, camouflage, markings, weathering and LODs are a big improvement — keep all of that. But the shapes built from
scratch are inaccurate: the Fw 190 A-8 turntable (`after-turntable-fw190.jpg`) is too long and thin, the canopy sits
too far aft, tail too long, wing planform too round; check the others the same way.
## Do
- Use the accurate FlightGear geometry already in `public/models/*.glb` / `tools/convert_models` (GPL) as the shape
  base for each type (or another licence-clean accurate source), then apply your UVs, bakes, paint, decals, named
  parts and LODs. Never regress the silhouette.
- Automated silhouette overlay vs public-domain three-view drawings (top/side/front) per type with an IoU threshold,
  like goal 02b; report the numbers.
- Pilot figure: proportionate head/shoulders with a flying helmet and goggles (current one is blocky).
- KTX2: the Basis encoder may already be installed by goal 02b (check `npx basisu`/`tools/hero`); if not, you may
  install it (allowed for this task). WebP fallback stays.
- Browser automation: Playwright headless shell only — NEVER `channel: 'chrome'` (it steals the owner's mouse). The
  uncommitted `tools/*browser_check.mjs` edits in this worktree are that fix from the lead: commit them.
Done when: `npm run check` passes; turntables + in-game shots show accurate silhouettes with the new paint, a legacy|new
side-by-side per type; report with honest pillar-1 score; commit.
