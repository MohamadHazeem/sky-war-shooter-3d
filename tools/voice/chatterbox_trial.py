#!/usr/bin/env python3
"""Chatterbox voice trial: renders a handful of the game's radio / briefing lines with the local
Chatterbox TTS (Resemble AI, MIT) next to the current macOS `say` clips, so they can be compared by ear.

    uv venv .venv-tts --python 3.11 && uv pip install --python .venv-tts/bin/python chatterbox-tts "setuptools<81"
    .venv-tts/bin/python tools/voice/chatterbox_trial.py      # -> tools/voice/.cache/trial/index.html

Models download once from Hugging Face (ResembleAI/chatterbox) into the HF cache. English uses the
English model; Arabic uses the multilingual one. `exaggeration` is the emotion knob (0.5 neutral).
"""
import html, json, shutil, sys, time
from pathlib import Path

import torch
import torchaudio as ta

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/voice/.cache/trial'
VOICE = ROOT / 'public/audio/voice'

# (clip id in the current manifest or None, text, language, exaggeration, cfg_weight)
LINES = [
    ('tanks', None, 'en', 0.85, 0.3),
    ('sp_barrage', None, 'en', 0.9, 0.3),
    ('mode_ace', None, 'en', 0.75, 0.4),
    ('pace_lot', None, 'en', 0.8, 0.35),
    ('sp_zdone', None, 'en', 0.6, 0.5),
    ('dressing', None, 'en', 0.45, 0.5),
    ('wing_attack', None, 'en', 0.7, 0.4),
    ('raid_r1', None, 'en', 0.55, 0.5),
    ('brief_m1_1', None, 'en', 0.35, 0.5),
    ('brief_m8_2', None, 'en', 0.4, 0.5),
    (None, 'Fighters, twelve o\'clock high! Here they come — short bursts, short bursts!', 'en', 0.95, 0.3),
    (None, 'Pilot to crew: we\'re at altitude. Test fire your guns, and keep your eyes open.', 'en', 0.4, 0.5),
    (None, 'Number three\'s on fire! Feathering three — hit the extinguisher!', 'en', 0.9, 0.3),
    (None, 'They came for the Lucky Lady\'s things an hour ago. Folded the blankets. Took the photographs off the wall.', 'en', 0.3, 0.5),
    (None, 'Tail to pilot, I got him! He\'s going down — no chutes!', 'en', 0.85, 0.35),
    (None, 'قنابل على المطار! أوقفوا البقية!', 'ar', 0.85, 0.3),
    (None, 'المراقبة إلى السرب الأزرق: غارة قادمة، طائرات يونكرز بغطاء من المقاتلات. ادخلوا بينها وبين المطار!', 'ar', 0.6, 0.5),
    (None, 'اثبت — ضمّدت جرحك. عُد إلى ذلك الرشّاش.', 'ar', 0.45, 0.5),
    (None, 'كانت تلك آخر المدمّرات! عمل رائع يا شباب.', 'ar', 0.6, 0.5),
    (None, 'أزرق اثنان، أُصبت! أنا أسقط!', 'ar', 0.95, 0.3),
]


def main():
    manifest = json.loads((VOICE / 'manifest.json').read_text())['clips']
    OUT.mkdir(parents=True, exist_ok=True)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    from chatterbox.tts import ChatterboxTTS
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    en = ar = None
    rows = []
    for i, (cid, text, lang, exa, cfg) in enumerate(LINES, 1):
        clip = manifest.get(cid) if cid else None
        text = text or clip['text']
        t0 = time.time()
        if lang == 'en':
            en = en or ChatterboxTTS.from_pretrained(device=device)
            wav, sr = en.generate(text, exaggeration=exa, cfg_weight=cfg), en.sr
        else:
            ar = ar or ChatterboxMultilingualTTS.from_pretrained(device=device)
            wav, sr = ar.generate(text, language_id='ar', exaggeration=exa, cfg_weight=cfg), ar.sr
        name = f'{i:02d}_{lang}.wav'
        ta.save(str(OUT / name), wav.cpu(), sr)
        old = None
        if clip:
            old = f'old_{clip["file"]}'
            shutil.copy(VOICE / clip['file'], OUT / old)
        rows.append((i, lang, text, exa, name, old, time.time() - t0))
        print(f'{i:02d} {lang} {time.time() - t0:5.1f}s  {text[:70]}', flush=True)
    page = ['<!doctype html><meta charset="utf-8"><title>Chatterbox trial</title>',
            '<style>body{font:15px system-ui;margin:24px;max-width:1000px;background:#14160f;color:#e9e3cf}'
            'td{padding:8px;border-bottom:1px solid #333;vertical-align:middle}td.t{max-width:420px}'
            '[dir=rtl]{font-size:17px}audio{height:32px}</style>',
            '<h1>Chatterbox trial</h1><p>Left: current voice (macOS say). Right: Chatterbox. '
            'Lines without a current clip are new test lines.</p><table>']
    for i, lang, text, exa, name, old, dt in rows:
        d = ' dir="rtl"' if lang == 'ar' else ''
        page.append(f'<tr><td>{i}</td><td class="t"{d}>{html.escape(text)}<br><small>emotion {exa}</small></td>'
                    f'<td>{f"<audio controls src={old!r}></audio>" if old else "—"}</td>'
                    f'<td><audio controls src="{name}"></audio></td></tr>')
    page.append('</table>')
    (OUT / 'index.html').write_text('\n'.join(page), encoding='utf-8')
    print('wrote', OUT / 'index.html')


if __name__ == '__main__':
    sys.exit(main())
