# VCTK reference cast

17 distinct male speakers, verified against the Hugging Face dataset viewer metadata.
All references are mono 24 kHz, 16-bit FLAC, 10–12 seconds; 3–5 complete mic2 utterances
per speaker, outer room tone trimmed, 120 ms gaps, peak normalised to −1 dBFS.
No full corpus was downloaded. [sources.json](sources.json) records exact source row indices,
filenames and transcripts; signed CDN URLs are intentionally not persisted.

| Role | Speaker | Accent / region | Age | Reference seconds | Utterances |
|---|---|---|---:|---:|---:|
| pilot | p345 | American / Florida | 22 | 10.870 | 5 |
| copilot | p316 | Canadian / Alberta | 20 | 11.529 | 4 |
| nav | p241 | Scottish / Perth | 21 | 10.987 | 5 |
| tail | p334 | American / Chicago | 18 | 11.003 | 5 |
| top | p360 | American / New Jersey | 19 | 10.956 | 4 |
| ball | p302 | Canadian / Montreal | 20 | 10.999 | 5 |
| bombardier | p292 | NorthernIrish / Belfast | 23 | 10.696 | 4 |
| radio | p286 | English / Newcastle | 23 | 11.028 | 4 |
| waist | p298 | Irish / Tipperary | 19 | 11.016 | 4 |
| lead | p245 | Irish / Dublin | 25 | 11.006 | 4 |
| bigfriend | p311 | American / Iowa | 21 | 10.995 | 4 |
| blue3 | p232 | English / Southern England | 23 | 11.001 | 4 |
| blue2 | p226 | English / Surrey | 22 | 10.992 | 3 |
| control | p281 | Scottish / Edinburgh | 29 | 10.997 | 3 |
| briefing | p227 | English / Cumbria | 38 | 10.986 | 3 |
| blue4 | p271 | Scottish / Fife | 19 | 10.845 | 3 |
| tower | p278 | English / Cheshire | 22 | 10.994 | 5 |

The four verified American males and two Canadian males are all used. They are 18–22;
VCTK does not offer an older American male among these candidates. Pilot uses the oldest
of the four (22); lead uses the older Dublin speaker (25). Tail (18) and ball (20) use young
North American voices. Remaining USAAF roles use distinct Irish / Northern English speakers.
The RAF roles use English / Scottish speakers. Briefing uses the mature Cumbrian speaker
(38) and lower exaggeration (0.4); control uses a 29-year-old Edinburgh speaker.
These are metadata-based casting choices, **not a claim of listening-verified calmness,
clarity or accent fidelity**. Listen to the 51 generated samples before the full migration.

## Rebuild

```sh
"/Users/Digital Next/Projects/Sky War Shooter 3D/.venv-tts/bin/python" tools/voice/build_refs.py
```

Uses already installed numpy/scipy/soundfile. Selected row offsets live in `build_refs.py`.
Downloads individual utterances through the public dataset viewer `/rows` API and its
`audio[0].src` links; caches source clips under ignored `tools/voice/.cache/vctk/`.
The `/filter` endpoint returned HTTP 500 during this task. `/rows` worked with rate-limit
backoff. Reference assembly chooses a 3–5 utterance combination closest to 11 seconds
from eight candidates; it never time-stretches speech or cuts words to fit the duration.

## Attribution and modifications

[CSTR VCTK Corpus v0.92](https://doi.org/10.7488/ds/2645), Junichi Yamagishi,
Christophe Veaux and Kirsten MacDonald, University of Edinburgh Centre for Speech Technology
Research, 2019. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Obtained from the [sanchit-gandhi/vctk mirror](https://huggingface.co/datasets/sanchit-gandhi/vctk).
Modified by trimming room tone, concatenating recordings with gaps, resampling 48 → 24 kHz,
and peak normalisation. Generated game speech uses
[Chatterbox TTS](https://github.com/resemble-ai/chatterbox) (MIT, Resemble AI).
