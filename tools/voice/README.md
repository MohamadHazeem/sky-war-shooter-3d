# Recorded crew voices

Generates the interphone/radio voice clips in `public/audio/voice/` with macOS `say`.

```
python3 tools/voice/generate.py           # render new or changed lines (unchanged clips are skipped)
python3 tools/voice/generate.py --force   # re-render everything
python3 tools/voice/generate.py --check   # only check that every callout text in src/ has a clip
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
  Roles may set `bitrate` (overrides `audio.bitrate`) and `noTable` (left out of `voiceLines.ts`).
- Needs macOS (`say`, `afconvert`) and Python 3 (standard library only).
