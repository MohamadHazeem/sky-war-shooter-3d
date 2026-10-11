# Phase 6 · Goal 7 — Second tour: endless generated campaign

Report to: `docs/phase6/reports/07.md` · Dev server port: 5258

## Idea
After mission 12 the tour ends. Offer a "Second tour" that keeps going: generated missions on the
strategic map with escalating opposition, so the campaign never runs dry.

## Read first
`src/game/Missions.ts` (Mission/Round/roundDef, the 12 story missions), `src/game/CampaignState.ts` +
`src/game/SideRaids.ts` (generated raids from templates — the main building block), `src/ui/CampaignMap.ts`
(map, gauges, tour summary, "Begin a new tour"), `src/game/Nemesis.ts` (aces carry over),
`src/game/CrewRoom.ts` (vignettes), `src/game/Weather*` / `src/render/Weather.ts` (moods, fronts),
`src/i18n`.

## What to build
- After the tour summary: "Volunteer for a second tour" (keep the existing "Begin a new tour" too).
- A generated sequence of operations (25 to count like a real tour, then endless): target types (oil,
  airfields, factories, rail, U-boat pens, cities), dates continuing through 1944-45, weather incl.
  fronts and night/dusk, escort availability rising, Luftwaffe getting jets (Me 262 / Me 163) and
  Sturmböcke later; gunner and P-51 roles both; a boss battle group every ~5th operation.
- Difficulty escalation curve with the strategic state still mattering; Experten carry over from tour 1.
- Briefing text generated from templates (with Arabic patterns), short crew-room lines after missions
  (reuse CrewRoom variable lines), tour progress "Mission 7 of 25" and a second-tour medal.
- Save/load in the campaign save (migration safe), leaderboard mode for tour-2 total score optional.

## Done when
`npm run check` passes with unit tests (generation determinism, escalation, save migration); browser
check: finish tour 1 via a dev hook, start tour 2, fly 2 generated missions in autoplay; screenshots.
