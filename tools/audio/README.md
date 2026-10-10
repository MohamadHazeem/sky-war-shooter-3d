# Game audio pipeline

Builds everything in `public/audio/` (loops, one-shots, music, `manifest.json`, `CREDITS.md`) from CC0 / CC BY recordings on Freesound.org and Kevin MacLeod music (incompetech.com, CC BY 4.0).

Requirements: Python 3 with `numpy` (`pip install -r requirements.txt`) and `ffmpeg` on PATH (or set `FFMPEG=/path/to/ffmpeg`).

Build:

```
./fetch.sh                      # downloads the sources listed in sources_used.json into work/ (not committed)
python3 build.py                # renders public/audio/* (optional arg: file-name prefix to rebuild only some files)
python3 gen_meta.py             # writes public/audio/manifest.json and CREDITS.md
```

- `build.py` holds every decision: source sound id, cut points, filters, fades, loop crossfades, per-group loudness balancing.
- `fs_search.py "query" [pages] [maxdur]` lists CC0/CC BY Freesound results; `fs_get.py outdir id...` downloads a sound's HQ preview and records its licence.
- Manifest gains are set in `gen_meta.py`.
