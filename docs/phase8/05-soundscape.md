# Phase 8 · Goal 5 — Gunner soundscape and interphone

Report to: `docs/phase8/reports/05.md` · Dev server port: 5285 · Screenshots: `docs/phase8/shots/05/`

## Idea
The gunner hears the war through the airframe. Make the inside-the-bomber sound rich and readable, and the
interphone crew feel alive.

## Read first
`src/audio/Sound.ts` (+ all `src/audio/*`), `public/audio/manifest.json` + `public/audio/CREDITS.md` (current
Freesound sources and licences), `tools/audio/*`, `src/game/RadioChatter.ts`, `src/game/Director.ts`,
`tools/voice/lines.json`, `tools/voice/generate.py` (Chatterbox, `--only`), `src/i18n`.

## What to build
1. **Better source sounds (free, CC0 preferred; CC BY allowed with credit).** Replace the weakest: interior
   .50 cal (punchy, mechanical, with the receiver clatter), shell casings falling on the floor, flak bursts
   near/far + shrapnel hitting the skin, bullet hits on the B-17 (thin aluminium), wind/air through bullet
   holes, engine drone layers (4 radials, inside), oxygen regulator breath, turret motors. Sources:
   Freesound.org (CC0/CC BY), Sonniss GDC individual files only if a single file is downloadable — never
   multi-GB bundles. Total added size < 5 MB; log each file in CREDITS.md with licence.
2. **Mixing pass:** priority/ducking so guns, hits and crew calls stay readable; distance + direction for
   enemy fire and flak; damage changes the interior sound (holes → louder wind, dead engine → missing layer).
3. **Interphone 2.0:** more situational crew talk (callouts naming the clock position and type, reactions to
   your kills/misses, wounded crewmen, checking in after an attack, quiet moments), never overlapping, limited
   rate. Voice the 11 deferred dynamic lines (see `DYNAMIC_CALLOUTS` in generate.py) by composing prefix +
   clock clips or adding clips. All new lines through `tools/voice/lines.json` + Chatterbox.
4. Respect volume buses (master/music/voice/sfx) and the Audio detail setting; no new runtime allocations.

## Done when
`npm run check` passes; loudness/peak measurements of new files (OfflineAudioContext or offline tool);
a list of every replaced/added sound with source + licence; report.
