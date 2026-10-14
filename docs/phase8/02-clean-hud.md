# Phase 8 · Goal 2 — Clean gunner HUD and simple settings

Report to: `docs/phase8/reports/02.md` · Dev server port: 5282 · Screenshots: `docs/phase8/shots/02/`

## Owner feedback
"So many things on the screen, making it very hard to understand the game." The owner plays mostly the
B-17 gunner.

## Problem
During a gunner mission the screen stacks: score/round/time, multiplier, formation count, achievement
toasts, controls hint ("H — controls"), ability buttons (Z/X/G), kill feed, +100 popups, radio subtitles,
objective cards, threat ring, radar, damage panel, combo, loot/crate prompts, mid-round events, special
HUDs. Much of it is useful but it all shows at once with similar weight.

## Read first
`src/game/GameHud.ts`, `src/ui/UI.ts` (HUD + settings panel), `src/ui/CombatFeedback.ts`, `AbilityBar.ts`,
`ObjectiveCard.ts`, `Radar.ts`, `ThreatRing.ts`, `SpecialHud.ts`, `CrateUI.ts`, `TouchHud.ts`,
`src/game/Hints.ts`, `Achievements.ts`, `Combo.ts`, `GunnerController.ts`, `src/game/AutoGraphics.ts`,
`src/ui/AccessibilityPanel.ts`, `src/style.css`, `src/i18n`.

## What to build
1. **HUD detail setting: Minimal / Standard (default) / Full.**
   - *Minimal*: gun sight, ammo + barrel heat for the current gun (small, near the bottom centre), a compact
     B-17 damage silhouette, incoming-attack threat ring, radio subtitles. Nothing else.
   - *Standard*: Minimal + small score/round line top-left, kill feed (max 3 lines, fades fast), objective
     line (one line), abilities shown only when ready. Achievements → a small toast that queues and shows
     one at a time for ≤2.5 s, never during a heavy attack. "+100" popups smaller and shorter.
   - *Full*: today's HUD (cleaned up so nothing overlaps).
   - One consistent HUD layout grid: top-left status, top-right reserved for toasts only, bottom-centre gun
     info, bottom-left damage, subtitles above gun info. No element may overlap another at 1280×720,
     1920×1080 and phone landscape; add a dev check that reports overlaps.
2. **Hints:** first-time hints appear once, one at a time, as a single line near the bottom; "H — controls"
   becomes a small key hint only in the first 2 missions.
3. **Settings simplified:** the first page shows only: Graphics (Low / Medium / High / Auto), Difficulty
   (Recruit / Veteran / Ace mapped onto existing balance knobs), HUD detail (Minimal / Standard / Full),
   Master / Music / Voice volume, Language, Mouse sensitivity, Invert. Everything else moves to an
   "Advanced" section (collapsed), unchanged in behaviour. The Hangar → Settings link (goal 1) opens this.
4. Same treatment applies to the P-51 HUD where it shares components, but optimise for the gunner.
5. Arabic/RTL for all new text; keep Low preset fast; tests for the HUD-detail visibility model, toast
   queue, overlap checker and settings mapping.

## Done when
`npm run check` passes; screenshots of a busy gunner moment (heavy attack + kill + achievement + radio) in
Minimal / Standard / Full, before vs after, EN + AR, 1280×720 + 1920×1080 + phone; settings page before/after;
overlap-check output; report with files and anything not done.
