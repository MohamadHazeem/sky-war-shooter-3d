# Phase 6 · Goal 12 — Music for the new modes

Report to: `docs/phase6/reports/12.md` · Dev server port: 5261

## Idea
The adaptive score (threat layers, climax track) covers day bomber combat. Night Fighter, Defend the
Field, Train Busting, the crew room and the boss battle group deserve their own music.

## Read first
`src/audio/Music.ts` (tracks, layers, setThreat), `src/audio/MusicLayers*`/`Threat*`, `src/audio/Sound.ts`
(loading, buses, ducking, detail setting), `public/audio` (existing music files and manifest),
`tools/audio/*` (offline generators), `src/game/CrewRoom.ts` / `src/ui/CrewRoomScene.ts` (gramophone waltz
already synthesised), `src/game/RaidDefence.ts`, `src/game/StrafeOps.ts`, `src/game/BossBattle.ts`.

## What to build
- Original period-style music, generated offline (Web Audio OfflineAudioContext or a Node synth in
  tools/audio/, committed generator + rendered compressed files) or synthesised at runtime like Synth3 —
  no copyrighted material:
  - Night Fighter: sparse, tense low strings / timpani pulse, building when raiders are coned.
  - Defend the Field / Train Busting: driving brass-and-snare march variants.
  - Boss battle group: a heavy, menacing theme with a stinger when a warship breaks apart.
  - Crew room: quiet piano/strings under the gramophone, sombre variant after heavy losses.
- Hook into the threat system (layers by intensity), cross-fades on mode/state changes, respects music
  volume and the Audio detail setting; total download growth under ~2 MB, lazy-loaded after the menu.

## Done when
`npm run check` passes; measurements (OfflineAudioContext: loudness, no clipping) since nobody can
listen during the run; report lists each track, length, size and where it plays.
