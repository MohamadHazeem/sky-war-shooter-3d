# Game audio pipeline

Builds everything in `public/audio/` (loops, one-shots, music, `manifest.json`, `CREDITS.md`) from CC0 / CC BY recordings on Freesound.org and Kevin MacLeod music (incompetech.com, CC BY 4.0).

Requirements: Python 3 with `numpy` (`pip install -r requirements.txt`) and `ffmpeg` on PATH (or set `FFMPEG=/path/to/ffmpeg`).

Build:

```
./fetch.sh                      # downloads the sources listed in sources_used.json into work/ (not committed)
python3 build.py                # renders public/audio/* (optional arg: file-name prefix to rebuild only some files)
node music_build.mjs            # adaptive-score loops (combat, climax) + music_meta.json (key, bpm, beat grid, bass root per bar)
node loudness.mjs --write       # per-file trims inside each category (into manifest.json); prints the loudness report
python3 gen_meta.py             # writes public/audio/manifest.json and CREDITS.md
```

Node tools (no numpy needed; decoding uses ffmpeg, or `afconvert` on macOS, which also encodes the AAC loops):

- `loudness.mjs` measures every shipped file and every synthesized buffer (the game's own audio code is bundled with esbuild and rendered against a stub AudioContext): peak, RMS, integrated and max-momentary loudness (BS.1770-4). Its "in-game mix" table renders composites with the code's gains (player gun burst, kill explosion at range, voice through the radio chain, engine beds, music and its layers) against the target ladder: guns > explosions > voice > engines > music > ambience. `--json f` saves the numbers, `--compare f` diffs against a saved run.
- `music_info.mjs file [--bpm n] [--bars n] [--refine n]` reports key, tempo, beat phase (spectral-flux onsets) and the per-bar bass roots.
- `music_build.mjs` builds the bar-exact loops (padded with their own wrapped audio so AAC priming cannot break the loop) and `music_meta.json`.
- Master limiter check, in the browser console of a dev build: `await swsSound.limiterCheck()` renders 8 stacked close explosions over a gun burst through the master chain and returns the input and output peaks.

- `audio3_report.mjs` (audio pass 3) renders every synthesised late-war voice of `src/audio/Synth3.ts` (engines for the He 111 / Me 410 / Do 335 / Me 262 / Me 163, BK 5, MG 81Z, ground flak, distance blast layers, cabin beds) and prints build time, peak / RMS, band energies, spectral centroid, the twin-engine beat (Hz and depth) and the loop seam. Nothing is downloaded: the game builds these lazily after the first mission starts (~350 ms in all, one buffer per idle slice).
- Dev console meters (dev build, `swsSound`): `meterReset()` / `meterPoll()` / `stats()` (one-shots played and refused per priority, voices sounding, output and pre-limiter peaks, non-finite samples, render capacity where the browser exposes it), `cpuCheck()` (offline render of a boss-fight + 30-fighter replica at Normal and Reduced detail: ms of render per audio second), `limiterCheck(n)` (now includes the close blast layers).
- Sound names for other systems (documented at the top of `src/audio/Sound.ts`): `sound.play('flak20', pos)` (20 mm Flak 38 firing, one call per round), `'flak20burst'` (20 mm airburst), `'flakTower'` (Flakturm gun firing), `sound.flakBurst(pos)` (heavy shell burst with whump and shrapnel patter), `'bk5'`, `'mg81'`.

- Airfield sounds of the take-off / landing scenes (`src/audio/SynthField.ts`, played through `src/audio/Field.ts` from `Bookends.ts`): the B-17 heard from outside (four Cyclones: a take-off-power roar loop and a taxi-idle loop cross-faded by throttle, `Acoustics.cycloneMix`, engine kind `cyclone4` = FighterSound type `'b17'`), tyre chirps (both main wheels), gear thump, belly impact, the belly slide (grind / sparks / rumble loops faded by speed, `Acoustics.scrapeMix`), the Very pistol pop and the flare's rising hiss, the fire tender's / crash truck's hand-rung bells and the ambulance bells (loops on moving emitters, `sound.emitter()`, with Doppler). Built lazily one buffer per idle slice when a B-17 briefing opens (`sound.prepareField()`, ~320 ms in all, 0 bytes downloaded). Audio detail Reduced drops the extra layers (`DetailCaps.fieldLayers`: gear thump, sparks and rumble, two of the four bells; the engine plays one loop).
  - `node audio3_report.mjs --field` measures the generators (peak / RMS, bands, centroid, beat, loop seam); `--all` for both catalogues.
  - Dev console: `await swsSound.fieldCheck()` renders the scenarios offline (OfflineAudioContext) through the game's node chains: old vs new B-17 voice (full-power pass with Doppler, taxiing, run-up), touchdown, belly landing, flare close / from the tower, bells passing, and the belly-landing mix through the master chain (peak, RMS, centroid, Doppler ratio, non-finite samples).
- `build.py` holds every decision: source sound id, cut points, filters, fades, loop crossfades, per-group loudness balancing.
- `fs_search.py "query" [pages] [maxdur]` lists CC0/CC BY Freesound results; `fs_get.py outdir id...` downloads a sound's HQ preview and records its licence.
- Manifest gains are set in `gen_meta.py`.

### Original mode scores (Phase 6)

`node tools/audio/mode_music_build.mjs` synthesizes seven original mono AAC cues at 32 kHz,
using the existing afconvert/ffmpeg encoder. It writes `mode_music_meta.json`, updates the
manifest, and prints decoded peak/RMS/BS.1770 loudness. Loops have half-second wrapped padding;
all new music totals 901,542 bytes in the committed build. `gen_meta.py` preserves these entries.

With Vite running, open `/tools/audio/mode_music_check.html`. The audio button renders the
production Music graph in OfflineAudioContext (normal/reduced layers, volume zero, cross-fades
and the breakup overlay). Both volume buses are summed, including the full 0.9 wet send as a
conservative coherent-gain stress case; this is not a measurement of the game's room impulse.
The game button checks the special modes, boss death and crew-room hooks on Low graphics,
using `sws.step`, and captures JPEGs. Save results exports the JSON with embedded screenshots.
`?auto` runs both checks; the optional `&report=5262` POSTs JSON to a local QA receiver instead
of opening a Save dialog. This diagnostic is a development page, outside the production bundle.


### Gunner soundscape (Phase 8)

`python3 tools/audio/fs_get.py <source-dir> 239138 318964 702245 267893 481148 437863 406226 788056 322021 461779`
downloads only the ten individual CC0 previews. Then run
`node tools/audio/soundscape_build.mjs <source-dir>` to reproduce fourteen small mono AAC
files, the runtime mappings in `soundscape_meta.json`, source metadata, and decoded
peak/RMS/BS.1770 loudness in `docs/phase8/reports/05-audio.json`.
`gen_meta.py` preserves these overrides and their CREDITS section.

New voices: `python3 tools/voice/generate.py --only ss_ --only pfx_ss_` (existing Chatterbox
venv/cached model; no dependency installation). `node tools/audio/soundscape_voice_report.mjs`
measures their decoded AAC and records take quality from the generator cache.
`/tools/audio/soundscape_check.html` is a development-only browser harness: the button runs
the live game's four-engine damage/repair, wind, detail, independent volume buses, voice
queue/lookup and offline limiter checks. Low and Arabic buttons provide visual QA frames.
All simulation frames use the project's `sws.step`; this page is outside the production build.
