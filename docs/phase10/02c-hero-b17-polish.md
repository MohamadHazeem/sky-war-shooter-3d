# Phase 10 · Goal 02c — Hero B-17: strictly better than legacy in every view

Report: `docs/phase10/reports/02c.md` · Port 5302 · Shots: `docs/phase10/shots/02c/`
Continue on this branch. Compare your `docs/phase10/shots/02b/hero-close.jpg` with `legacy-close.jpg`.

## Review (lead)
Shape is now right (good) and the weathering adds realism, but side by side the hero model is not yet better:
- Paint reads pale/chalky and low-contrast; legacy olive drab is richer. Target a believable faded olive drab
  (ANA 613/319 range) with value variation by panel, not an overall washed-out tint; neutral grey undersides.
- Markings lost crispness: tail serial (e.g. "23772") is missing, "GD" codes and the "Sky Queen" nose art are soft/
  smeared. Decals must be sharp at the close camera (use a separate high-res decal atlas or vector-like alpha decals).
- Propeller blades are invisible while running; show blades + a subtle motion-blur disc (blades readable at idle and
  low rpm, disc at cruise), with yellow tips.
- Make the hero detail visible at the close and waist distances: panel lines, rivet rows, exhaust soot behind the
  turbos, oil streaks on nacelles, worn walkway on the wing root, chipped leading edges.
Done when: for every view (close, beauty, waist, formation, silver, low) a side-by-side legacy|hero sheet where the
hero is clearly better; `npm run check` passes; commit + report with an honest pillar-1 score.
