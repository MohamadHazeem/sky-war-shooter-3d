# Phase 9 · Goal 4 — New gunner campaign chapter: "Deep Penetration" (5 missions)

Report: `docs/phase9/reports/04.md` · Port 5294 · Shots: `docs/phase9/shots/04/`

Read first: `src/game/Missions.ts`, `CampaignState.ts`, `src/ui/CampaignMap.ts`, `BriefingMap.ts`, `BriefingExtras.ts`,
`SetPieces.ts`, `SpecialEvents.ts`, `Director.ts`, `src/world/LuftwaffeTactics.ts` (Phase 8), `CrewRoom.ts`,
`SecondTour.ts`, `tools/voice/briefings.mjs` + `lines.json` (Chatterbox), `src/i18n` (Arabic, enforced by tests).

Build: 5 historical B-17 gunner missions after the current 12 (or as a clearly marked new chapter reachable from
"Fly a Mission" once the first tour is done — keep progress for existing saves): Schweinfurt–Regensburg
(17 Aug 1943, Regensburg shuttle to North Africa), Schweinfurt "Black Thursday" (14 Oct 1943), Big Week –
Leipzig (20 Feb 1944), Berlin (6 Mar 1944), Merseburg/Leuna oil (late 1944, heavy flak). Each: historically
grounded briefing paragraphs (voiced), weather, fighter mix and Phase 8 tactics fitting the date, one signature
set piece, distinct target area look, and a crew story beat in the crew room afterwards. Use existing systems;
coordinate with goal 1 (living formation) and goal 2 (bomb run) only through existing APIs — don't depend on
unmerged code. Arabic for everything. Tests for mission data, unlock/progress migration.

Done when: `npm run check` passes; each mission autoplayed to completion (`sws.autoplay`); briefing + key
moment screenshots; report.
