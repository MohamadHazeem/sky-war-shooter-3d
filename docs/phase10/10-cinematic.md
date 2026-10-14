# Phase 10 · Goal 10 — Cinematic combat director and film look

Report: `docs/phase10/reports/10.md` · Port 5310 · Shots: `docs/phase10/shots/10/`
Read `docs/PHASE10.md`, `src/game/Cinematics.ts`, `CineShared.ts`, `Replay.ts`, `Recorder.ts`, `PhotoMode.ts`,
`GameFeel.ts`, `src/render/PostFX.ts`, `src/core/Engine.ts`, Phase 8 HUD rules (`src/ui/HudDetail.ts`).

Build: a combat director that occasionally (rarely, never during critical moments, setting to turn off) shows a
short cinematic: slow-motion close passes (a 190 flashing past the waist window), kill cams following a breaking-up
fighter for 2–3 s then returning to the gun, a "film camera" replay at mission end with the best moments; camera
language from WWII films (handheld 16 mm gun-camera look for kills, telephoto from a neighbouring bomber, wing-tip
cameras); post-processing for these and for the Cinematic preset: depth of field (bokeh), per-object motion blur,
film grain, gate weave, halation, anamorphic-free lens flares, vignetting, period colour grade options (Kodachrome,
B&W newsreel). Respect HUD detail and accessibility (reduced motion disables slow-mo/shake/grain).
Done when: `npm run check` passes; captured sequences; perf; pillar 7 self-score.
