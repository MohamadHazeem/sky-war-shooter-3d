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

- `build.py` holds every decision: source sound id, cut points, filters, fades, loop crossfades, per-group loudness balancing.
- `fs_search.py "query" [pages] [maxdur]` lists CC0/CC BY Freesound results; `fs_get.py outdir id...` downloads a sound's HQ preview and records its licence.
- Manifest gains are set in `gen_meta.py`.
