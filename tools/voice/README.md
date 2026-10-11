# Recorded crew voices

Generates the interphone/radio voice clips in `public/audio/voice/` with Chatterbox (default) or macOS `say`.

```
python3 tools/voice/generate.py           # render new or changed lines (unchanged clips are skipped)
python3 tools/voice/generate.py --force   # re-render everything
python3 tools/voice/generate.py --check   # verify callout coverage; report known dynamic gaps
```

- `lines.json` is the source: roles (voice, words per minute, subtitle speaker), the clock set
  ("nine o'clock low!" for every hour x high/level/low, per role) and every line. A line's `text`
  must equal the subtitle text in the game, because that is how `World.callout` finds its clip.
- Output: `public/audio/voice/<id>.m4a` (mono AAC, 16 kHz, 24 kbps), `manifest.json`
  (id -> file, role, text, duration) and `src/audio/voiceLines.ts` (named lines for game code).
- Runtime: `src/audio/Voice.ts` plays them through the radio chain; `src/game/RadioChatter.ts`
  triggers the instruction lines.
- Mission briefings (role `briefing`, the group intelligence officer, one clip per paragraph
  `brief_<mission>_<n>`, 16 kbps) are copied from `src/game/Missions.ts` into `lines.json` by
  `node --experimental-strip-types tools/voice/briefings.mjs`; run it, then `generate.py`, after
  editing any briefing text (`tests/story.test.ts` fails while a clip's text is out of date).
  `src/audio/BriefingVoice.ts` plays them clean (no radio chain) on the briefing screen.
  Roles may set `bitrate` (overrides `audio.bitrate`) and `noTable` (left out of `voiceLines.ts`); a line may
  set `noTable` too.
- Crew-room interludes (`src/game/CrewRoom.ts`, played by `src/ui/CrewRoomScene.ts`) are copied into
  `lines.json` by `node --experimental-strip-types tools/voice/crewroom.mjs` (group "crew room", ids `cr_*`,
  the crewmen's own voice roles); run it, then `generate.py`, after editing a vignette (`tests/crewRoom.test.ts`
  fails while a line has no clip).
- Needs macOS `afconvert`. Chatterbox uses the **existing** `.venv-tts` in the main checkout;
  `generate.py` re-execs that Python if torch is unavailable. `TTS_PYTHON` overrides the path.
  Models load from the local Hugging Face cache (`HF_HUB_OFFLINE=1`); no installation is performed.
  `--check`, unit tests and the `say` fallback need only Python's standard library.

## Chatterbox generation

```sh
PYTORCH_ENABLE_MPS_FALLBACK=1 python3 tools/voice/generate.py --only pilot --limit 3
python3 tools/voice/generate.py --only brief_ --limit 3
python3 tools/voice/sample.py          # exactly 3 per role (51), including clocks and briefings
python3 tools/voice/generate.py --engine say --only pilot --limit 3
# Full migration, resumable (run this when ready to replace every remaining legacy clip):
PYTORCH_ENABLE_MPS_FALLBACK=1 python3 tools/voice/generate.py
```

`audio.engine` selects `chatterbox` / `say`; role `ref` paths are relative to this directory.
The historical `voice` / `rate` fields and say hashes are preserved for fallback. Chatterbox
hashes include the engine, reference **contents**, spoken text, emotion, sample rate and bitrate.
Changing a reference invalidates only that role. Reference casting and provenance: [refs/README.md](refs/README.md).

Chatterbox runs sequentially with one model on MPS (CPU if unavailable), resamples 24 → 16 kHz,
then uses the same silence trim, fades, peak normalisation, AAC encoding and padding removal.
Urgent/clock lines use `exa=0.8,cfg=0.3`; normal lines `0.55,0.5`; briefings `0.4,0.5`.
A line can override `exa` and `cfg` independently. No runtime or subtitle changes are required.

`--only` matches an exact role first, otherwise an ID prefix; repeat it to combine selections.
`--limit` applies **before** the unchanged-hash check, so repeating a sample command is a no-op.
`--force` applies only to the selected clips. Unselected files/manifest entries are preserved.
The manifest is atomically saved every 50 attempts, at completion, and on Python exceptions/Ctrl-C.
A hard kill can lose at most 49 manifest updates; those clips safely regenerate on the next run.
Progress/ETA prints every 25 attempts and at completion.

Each generated take is checked against `words / 2.95` expected seconds (the midpoint of
2.3–3.6 words/s); durations outside 0.35–2.2× retry with up to three different seeds.
Silent takes also retry. Four rejected takes leave the previous audio/hash intact, log `FAILED`,
and exit nonzero. Metrics are written after every attempt batch to `.cache/quality.json`:
text/spoken text, duration, words/s, peak/RMS dBFS, 20 ms RMS silence fraction below −40 dBFS,
seed, retries and total render seconds. These proxies cannot establish intelligibility or accent quality.

`--check` checks source callout coverage, not acoustic quality. It prints the 11 pre-existing,
exactly enumerated dynamic subtitle-only gaps (`DYNAMIC_CALLOUTS` in `generate.py`) separately;
any other missing literal/template fails. It does not pretend those dynamic lines are recorded.
`python3 tools/voice/test_generate.py` runs offline pipeline tests, also invoked by `npm run check`.
