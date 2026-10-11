#!/usr/bin/env python3
"""Fetch only selected VCTK utterances via the dataset viewer, then build mono references.
Run with the existing .venv-tts Python (numpy, scipy, soundfile); no corpus download.
The row offsets and source IDs are recorded in refs/sources.json for reproducibility.
"""
import io
import itertools
import json
from pathlib import Path
import time
import urllib.request
import urllib.error

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = Path(__file__).resolve().parent
CACHE = HERE / '.cache/vctk'
REFS = HERE / 'refs'
DATASET = 'https://datasets-server.huggingface.co/rows?dataset=sanchit-gandhi/vctk&config=default&split=train'
# Populated from the dataset viewer's actual gender/accent/age/region metadata.
CAST = {
    'pilot': ('p345', 80500), 'tower': ('p278', 42000),
    'copilot': ('p316', 67900), 'tail': ('p334', 74200),
    'ball': ('p302', 58100), 'top': ('p360', 82600), 'lead': ('p245', 14700),
    'bombardier': ('p292', 50400), 'radio': ('p286', 48300),
    'waist': ('p298', 54600), 'bigfriend': ('p311', 64400),
    'nav': ('p241', 11900), 'blue2': ('p226', 700),
    'blue3': ('p232', 5600), 'blue4': ('p271', 35700),
    'control': ('p281', 44100), 'briefing': ('p227', 1400),
}  # role -> (speaker ID, row offset)


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if attempt == 2:
                raise
            delay = int(e.headers.get('Retry-After', '60')) if e.code == 429 else 2
            print(f'HTTP {e.code}; backing off {delay}s', flush=True)
            time.sleep(delay)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def build(role, speaker, offset):
    listing = CACHE / f'{speaker}-utterances.json'
    if not listing.exists():
        listing.write_bytes(fetch(f'{DATASET}&offset={offset}&length=40'))
    rows = json.loads(listing.read_text())['rows']
    candidates = []
    for item in rows:
        r = item['row']
        if r['speaker_id'] != speaker or not r['file'].endswith('_mic2.flac'):
            continue
        assert r['gender'] == 'M', (role, r)
        source = CACHE / Path(r['file']).name
        if not source.exists():
            source.write_bytes(fetch(r['audio'][0]['src']))
        wav, sr = sf.read(io.BytesIO(source.read_bytes()), dtype='float32')
        if wav.ndim == 2:
            wav = wav.mean(axis=1)
        # Trim only outer room tone, retaining consonants and complete utterances.
        active = np.flatnonzero(np.abs(wav) > max(.002, np.max(np.abs(wav)) * .015))
        if not len(active):
            continue
        wav = wav[max(0, active[0] - int(sr * .025)):min(len(wav), active[-1] + int(sr * .05))]
        wav = resample_poly(wav, 24000, sr)
        candidates.append((item, wav))
        if len(candidates) == 8:
            break
    combos = [combo for n in range(3, 6) for combo in itertools.combinations(range(len(candidates)), n)]
    best = min(combos, key=lambda combo: abs(sum(len(candidates[i][1]) / 24000 for i in combo) + .12 * (len(combo) - 1) - 11))
    pieces = []
    sources = []
    for i in best:
        item, wav = candidates[i]
        if pieces:
            pieces.append(np.zeros(2880, dtype='float32'))
        pieces.append(wav)
        r = item['row']
        sources.append(dict(row=item['row_idx'], file=Path(r['file']).name, text=r['text']))
    joined = np.concatenate(pieces)
    assert 10 <= len(joined) / 24000 <= 12, (role, len(joined) / 24000)
    joined *= .89 / np.max(np.abs(joined))
    sf.write(REFS / f'{role}.flac', joined, 24000, subtype='PCM_16')
    r = candidates[0][0]['row']
    return dict(speaker=speaker, **{k: r[k] for k in ('gender', 'accent', 'age', 'region')},
                duration=round(len(joined) / 24000, 3), sampleRate=24000, sources=sources)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    REFS.mkdir(exist_ok=True)
    records = {}
    for role, (speaker, offset) in CAST.items():
        records[role] = build(role, speaker, offset)
        print(role, records[role], flush=True)
        (REFS / 'sources.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    main()
