# Phase 8 · Goal 1 — Simple, gunner-first main menu and flow

Report to: `docs/phase8/reports/01.md` · Dev server port: 5281 · Screenshots: `docs/phase8/shots/01/`

## Owner feedback (verbatim intent)
"The UI of the game is quite hard — the menu, the interface, the options. There are so many things on
the screen, it is very hard to understand the game and very confusing." The owner enjoys the **B-17
gunner** gameplay most; the P-51 escort is not a focus.

## Problem
The main menu shows ~15 equally weighted entries (Campaign, Survival, Co-op, Training, Skills, Trophies,
Aircraft, Daily Orders, Career, Armory, What's New, Field Manual, Squadron, Theatre, Customize, …) plus
badges, side panels, leaderboards and pop-ups (training prompt) at once. A new player can't tell what to do.

## Read first
`src/ui/UI.ts` (menu markup/handlers), `src/style.css`, every `src/ui/*Screen.ts` reachable from the menu,
`src/game/MenuScene.ts`, `src/game/Onboarding.ts` + `Tutorial.ts`, `src/game/Modes.ts`, `src/game/TitleExtras.ts`,
`src/ui/LeaderboardPanel.ts`, `src/i18n` (Arabic + RTL), `src/ui/TouchHud.ts`/`devices.css` (touch).

## What to build
1. **Main menu = 3 big choices + 2 small links.** Clean, calm, lots of space, the game's period type style:
   - **FLY A MISSION** (primary, large): continues the B-17 gunner campaign at the next mission (one click
     to the briefing). Small line under it: mission name / progress.
   - **SURVIVAL** — endless gunner waves (B-17 seat by default). Inside its screen, the other survival
     variants (P-51, Sea Strike, Hold the Field, Defend the Field, Ace Hunt, Time Attack…) are listed under a
     collapsed "More modes" group.
   - **CO-OP** — the existing co-op lobby (gunner crew first; P-51 escort as the second option).
   - Small text links: **HANGAR** and **SETTINGS**. Optional tiny "Quit/Credits" if it exists today.
   - Nothing else on the main menu: no leaderboards, no daily badges, no what's-new panel, no stacked
     prompts. One subtle notification dot on HANGAR if something is unclaimed/new.
2. **Hangar = one tabbed screen** holding everything that was on the menu, grouped into at most 4 tabs:
   *Crew & Skills* (crew panel, skill tree, career/rank) · *Aircraft & Armory* (aircraft gallery,
   customize, armory/upgrades) · *Records* (trophies, leaderboards, daily/weekly orders, squadron, service
   record) · *More* (field manual, what's new, theatre/campaign map, custom battle, training). Reuse the
   existing screens inside the tabs; Esc/Back always returns one level.
3. **P-51 and other non-gunner modes** remain fully playable but only via Survival → More modes, Custom
   Battle, and the campaign where they are part of the story. Don't delete features.
4. **First launch:** instead of a pop-up over the menu, a brand-new player goes straight to a short guided
   first gunner mission (the existing Training / tutorial flow), then lands on the clean menu. Returning
   players never see the prompt again; Training stays reachable from Hangar → More.
5. **Clarity rules for every menu screen:** one primary button per screen, max ~6 visible choices, short
   labels (1–3 words) with a one-line description, consistent Back position, no overlapping panels, readable
   at 1280×720 and on touch, full Arabic/RTL.
6. Keep all existing deep links / `sws` dev hooks working; update tests that assert menu structure; add tests
   for the new menu model (entries, routing, first-launch logic).

## Done when
`npm run check` passes; screenshots before/after (main menu EN + AR, Hangar each tab, Survival with More
modes collapsed/expanded, first-launch flow, 1280×720 and a phone-size viewport); a click-count table
(how many clicks from launch to: next campaign mission, survival gunner, co-op, skills) before vs after;
report with files and anything not done.
