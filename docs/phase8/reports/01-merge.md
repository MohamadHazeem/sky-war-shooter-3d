# Phase 8 · 01 merge resolutions

Merged `phase8/01-simple-menu` into `phase8/merge-01`, preserving goal 2's HUD detail, queued notifications and simplified Settings.

- Resolved all seven conflicted files: `Game.ts`, `ManualHooks.ts`, `Onboarding.ts`, `ServiceRecord.ts`, `TitleExtras.ts`, `i18n/phrases.ts`, and `UI.ts`.
- Retained the gunner-first title, four Hangar tabs, first-flight onboarding and child-screen return callbacks. Combined onboarding hint policy and service notification imports with the new menu hooks.
- One Settings implementation: goal 2's nine basic controls and collapsed Advanced section. Removed goal 1's competing `groupSettings` helper from `MenuSections.ts`.
- `Game.ts:172` owns the shared Settings callback; `SimpleMenu.ts:51` / `:103` route title and Hangar through it. `HangarScreen.ts:11` adds a localized Settings link without displacing tab entries. Returning restores the selected tab, including through Credits.
- `ManualHooks.ts:46`, `TitleExtras.ts:43`, `Game.ts:376` mount extras in Advanced. `UI.ts:505` preserves cloud/privacy controls on language changes; `:627` combines loadout Back behavior with the hidden-Hangar keyboard guard.
- Both Arabic tables are registered in `phrases.ts:40`. `simpleMenu.css` keeps queued HUD toasts off the clean title. Added a shared-Settings routing regression in `tests/menuRouting.test.ts`.

Verification: final `npm run check` passed (TypeScript, Vite, **58 test files / 611 tests**, plus **8 Python tests**); `git diff --check` passed. Headless Chrome on this worktree's Vite server at **5288**, Low preset, 1280×720, with explicit `sws.step` frames: title; all four Hangar tabs; basic/Advanced Settings from title and every tab; Back/Escape and Credits return paths; Arabic/RTL and language rebuilds; direct campaign briefing; Armory and between-round Hangar Settings keyboard guards; Standard gunner HUD with three-line feed, incoming fire, radio and deferred/resumed achievement toast. No browser errors or HUD overlap issues.

Evidence: [browser checks](../../phase6/shots/01-merge/checks.json), [title](../../phase6/shots/01-merge/title-en.jpg), [Hangar](../../phase6/shots/01-merge/hangar-more-en.jpg), [Settings basic](../../phase6/shots/01-merge/title-settings-en-basic.jpg), [Advanced](../../phase6/shots/01-merge/title-settings-en-advanced.jpg), [Arabic Hangar](../../phase6/shots/01-merge/hangar-more-ar.jpg), [busy Standard HUD](../../phase6/shots/01-merge/gunner-standard-heavy-en.jpg), [resumed toast](../../phase6/shots/01-merge/gunner-standard-toast-en.jpg). Other tab and Settings captures are in the same directory.

No requested work left pending. This merge check did not repeat full campaign playthroughs or network co-op. Dev server stopped after verification. No dependencies installed, push or deployment.
