# Phase 6 · Extra 13 — Natural crew voices (Chatterbox)

Report to: `docs/phase6/reports/13.md` · No dev server needed (audio pipeline only)

## Problem
All 1,167 recorded radio/briefing clips (`public/audio/voice/`, ~62 min of speech) come from macOS `say`
(`tools/voice/generate.py`, roles in `tools/voice/lines.json` → each role has a `say` voice). They are
varied per role but robotic. The owner wants natural voices, still one distinct voice per role.

## Tools already installed (do not reinstall)
- `.venv-tts/` in the MAIN checkout (`/Users/Digital Next/Projects/Sky War Shooter 3D/.venv-tts`):
  Python 3.11, `chatterbox-tts` 0.1.7, torch 2.6 with MPS, `setuptools<81`. Models are already in the
  Hugging Face cache (`ResembleAI/chatterbox`). Run with `PYTORCH_ENABLE_MPS_FALLBACK=1`.
- `tools/voice/chatterbox_trial.py` shows the API: `ChatterboxTTS.from_pretrained(device='mps')`,
  `model.generate(text, audio_prompt_path=<ref wav>, exaggeration=0.5, cfg_weight=0.5)`, `model.sr` (24 kHz).
  `audio_prompt_path` clones the voice of a ~10 s reference clip.

## What to build
1. **Reference voices, one per role (17 roles), all different speakers.** Use the VCTK corpus
   (CC BY 4.0, has gender/accent/age metadata), fetched clip-by-clip from the Hugging Face dataset viewer
   API — no full-corpus download:
   `https://datasets-server.huggingface.co/rows?dataset=sanchit-gandhi/vctk&config=default&split=train&offset=N&length=100`
   (rows have `speaker_id, gender, accent, age, text, audio[0].src`). Use `/filter` or `/search` endpoints
   if handy. For each chosen speaker concatenate 3–5 clean utterances into a ~10–12 s mono reference
   (short gaps between), save as FLAC in `tools/voice/refs/<role>.flac` (commit them; small).
   Casting (male voices; fit the role):
   - USAAF B-17 crew and US fighters: `pilot, copilot, tail, top, ball, bombardier, radio, waist, lead,
     bigfriend, tower` → American / Canadian male speakers first (VCTK has p311, p334, p345, p360 American,
     p316 Canadian, check metadata); when American males run out use Irish / Northern English / other
     clearly different males. Pilot and lead: calm, mature. Ball/tail: younger.
   - RAF side: `nav, blue2, blue3, blue4, control, briefing` → English / Scottish / Welsh males.
     Briefing (intelligence officer, read clean, long paragraphs): the clearest, steadiest speaker.
   - Document the casting table (role → speaker id, accent, age) in `tools/voice/refs/README.md` and add a
     CC BY 4.0 attribution for VCTK (Yamagishi, Veaux, MacDonald, University of Edinburgh CSTR) to
     `public/audio/CREDITS.md` (voices: speech generated with Chatterbox TTS (MIT, Resemble AI) cloned from
     VCTK reference recordings).
2. **Engine switch in the voice pipeline.** Add `"engine": "chatterbox"` to `lines.json` → `audio`, and a
   `"ref": "refs/<role>.flac"` per role (keep the old `voice` field for the `say` fallback). In
   `tools/voice/generate.py`:
   - engine `chatterbox`: re-exec itself with the `.venv-tts` python (main checkout path, or `$TTS_PYTHON`)
     when torch is not importable; load the model once; render clips SEQUENTIALLY (one model on MPS, no
     thread pool); resample 24 kHz → `audio.sampleRate`; then the existing `trim_normalise` +
     `afconvert` + `slim_m4a` chain, so file format, manifest and `voiceLines.ts` stay identical.
   - Emotion instead of `say` rate: `urgent` lines and clock calls → exaggeration ~0.8, cfg_weight ~0.3;
     normal radio ~0.55 / 0.5; briefing ~0.4 / 0.5; allow per-line `"exa"` / `"cfg"` overrides in lines.json.
   - Robustness: Chatterbox can garble or add trailing noise on very short lines. After each render check
     the duration against the text (≈ 2.3–3.6 words/s; flag < 0.35× or > 2.2× the expected length) and
     retry up to 3 times with a different seed (`torch.manual_seed`); log clips that still fail.
   - Hash key must include engine + ref file content hash + exa/cfg, so changing a role's reference
     re-renders only that role. The `say` path must keep working unchanged when engine is `say`.
   - `--only <role|id-prefix>` and `--limit N` options for partial renders; progress every 25 clips with
     an ETA; resumable (manifest written every 50 clips so an interrupted run continues).
3. **Do NOT render all 1,167 clips** (≈3 h; the reviewer runs it). Render a sample: 3 clips per role
   (51 clips) into the real `public/audio/voice/` via `--only`/`--limit`, plus all 46 `briefing` clips only
   if time allows. Run `python3 tools/voice/generate.py --check` and `npm run check`.
4. **Quality report without ears:** for the sample, list each clip's text, duration, words/s, peak/RMS,
   retries. Use a quick objective check if you can do it offline with what's installed (e.g. Whisper is NOT
   installed — do not install large packages; a simple speech-rate + silence analysis is enough).

## Done when
`npm run check` passes; `generate.py --check` passes; sample clips rendered with the Chatterbox engine;
refs + README + CREDITS committed; report `docs/phase6/reports/13.md` with the casting table, timing per
clip (to estimate the full run), failures, and the exact command for the full render.
