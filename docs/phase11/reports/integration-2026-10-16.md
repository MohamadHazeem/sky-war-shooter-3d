# Integration — 16 October 2026

Merged in the requested order: gamepad accessibility w7okb7, limping-home rework vmzxzr, museum/codex, station-tutorial evidence cnzx5q, share cards, Arabic voice.

Conflicts resolved:
- Accessibility: retained live remapping hints, gyro controls and Arabic typography; used incoming evidence images.
- Limping home: combined the requested crew voting/fuel rework with touch prompts and lifecycle cleanup. Retained all campaign hooks.
- Training: combined range and lesson fields, lifecycle/director hooks and lead-pip rules. Both use the extracted TrainingDrones helper. Kept every i18n table and both Tour/lesson voice groups before briefings.
- Arabic audio: combined language selection with crew stories and translated reading times; retained both Python test groups.

Integration fixes:
- Added French, German and Spanish lesson tables and new crew-vote labels.
- Updated arabic.mjs to use Vite for auto-discovered phrase tables and to include lines.d groups. Regenerated all 963 Arabic text entries.
- Generated all 16 English lesson recordings. All 1,403 previous English clips remain unchanged. Arabic now has 1,142/1,419 clips (80.5%), including six new lesson recordings; every original Arabic clip id remains present. Low-quality takes were rejected and retain the runtime English fallback. The supplementary lesson batch was stopped after coverage passed; completed takes were checkpointed.

Validation:
- TypeScript passed after each merge resolution.
- Related suites passed per merge; final combined gameplay/localisation selection: 8 files / 152 tests. Arabic voice/localisation selection: 3 files / 54 tests.
- Voice pipeline Python tests: 17 passed.
- Real-game headless lesson checks passed in English, Arabic and phone layout: progression, forced pip, convergence, jams, hypoxia, touch skipping and subtitle separation. Twelve JPEGs and results.json: docs/phase6/shots/integration-lessons/. The initial attempt was interrupted by Vite reloading generated voiceLines.ts; the completed rerun passed. Browser and dev server stopped.
- English and Arabic manifest unions verified. Full build and test suite are validated by the integration push's GitHub Actions run (result reported in the final handoff).

Known pre-existing limitations: voice --check reports five literal limping-home lines without recordings plus a museum crew-label false positive; the limping-home report already documents subtitle/speech fallback. Arabic coverage remains partial, with English fallback per missing clip. No deployment or main-branch changes.
