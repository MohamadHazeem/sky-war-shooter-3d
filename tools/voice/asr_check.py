#!/usr/bin/env python3
"""Intelligibility check for the recorded voices: transcribe clips with Whisper and score them
against the text they were meant to speak (character error rate, after normalisation).

    python3 tools/voice/asr_check.py --lang ar                 # every Arabic clip in the manifest
    python3 tools/voice/asr_check.py --lang ar --only pilot    # a role or id prefix
    python3 tools/voice/asr_check.py --lang ar --dir <wavs>    # ad-hoc files: <id>.wav/.m4a vs lines_ar.json

Writes tools/voice/.cache/asr_<lang>.json { id: { cer, hyp, ref } } and prints the worst clips.
Uses Whisper large-v3-turbo from the LOCAL Hugging Face cache (mlx-community weights, mapped onto the
transformers model in .venv-tts; nothing is downloaded or installed) and the multilingual tokenizer
of the cached faster-whisper model (text tokens are identical across Whisper versions).
A machine transcript is a proxy: a low CER means a Whisper listener understood the clip, not that the
accent is native. Run through tools/heavy.sh.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
HUB = os.path.expanduser('~/.cache/huggingface/hub')
LANG_TOKEN = {'ar': 50272, 'en': 50259}
SOT, EOT, TRANSCRIBE, NO_TS = 50258, 50257, 50360, 50364  # large-v3 ids (100 language tokens)

# ---------- Arabic normalisation (pure python, unit-tested) ----------
ONES = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']
TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة']


def arabic_number(n):
    """Same words as src/audio/arabicSpoken.ts arabicNumber (Whisper often writes spoken numbers as digits)."""
    if n <= 10:
        return ONES[n]
    if n < 13:
        return ['أحد عشر', 'اثنا عشر'][n - 11]
    if n < 20:
        return f'{ONES[n - 10]} عشر'
    if n < 100:
        return f'{ONES[n % 10]} و{TENS[n // 10]}' if n % 10 else TENS[n // 10]
    if n < 1000:
        return HUNDREDS[n // 100] + (f' و{arabic_number(n % 100)}' if n % 100 else '')
    if n < 1000000:
        k, r = divmod(n, 1000)
        head = 'ألف' if k == 1 else 'ألفان' if k == 2 else f'{arabic_number(k)} آلاف' if k <= 10 else f'{arabic_number(k)} ألف'
        return head + (f' و{arabic_number(r)}' if r else '')
    return str(n)


def normalise(s, lang='ar'):
    s = s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
    if lang == 'ar':
        s = re.sub(r'\d+', lambda m: ' ' + arabic_number(int(m.group())) + ' ', s)
        s = re.sub('[ً-ٰٟـ]', '', s)          # tashkeel, dagger alef, tatweel
        s = re.sub('[إأآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
        s = re.sub(r'(^|\s)ال', r'\1', s)                           # the article is often merged/elided
    s = s.lower()
    s = re.sub(r"[^\w\s]", ' ', s)
    return ' '.join(s.split())


def cer(ref, hyp):
    a, b = ref.replace(' ', ''), hyp.replace(' ', '')
    if not a:
        return 0.0 if not b else 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return round(prev[-1] / len(a), 3)


# ---------- model ----------
def snapshot(repo):
    found = glob.glob(os.path.join(HUB, f'models--{repo.replace("/", "--")}', 'snapshots', '*'))
    if not found:
        sys.exit(f'{repo} is not in the local Hugging Face cache')
    return found[0]


def load_model(device):
    import numpy as np
    import torch
    from safetensors import safe_open
    from transformers import WhisperConfig, WhisperForConditionalGeneration
    d = snapshot('mlx-community/whisper-large-v3-turbo')
    c = json.load(open(os.path.join(d, 'config.json')))
    cfg = WhisperConfig(vocab_size=c['n_vocab'], num_mel_bins=c['n_mels'], d_model=c['n_audio_state'],
                        encoder_layers=c['n_audio_layer'], encoder_attention_heads=c['n_audio_head'],
                        decoder_layers=c['n_text_layer'], decoder_attention_heads=c['n_text_head'],
                        encoder_ffn_dim=4 * c['n_audio_state'], decoder_ffn_dim=4 * c['n_text_state'],
                        max_source_positions=c['n_audio_ctx'], max_target_positions=c['n_text_ctx'],
                        decoder_start_token_id=SOT, eos_token_id=EOT, pad_token_id=EOT, bos_token_id=EOT)
    model = WhisperForConditionalGeneration(cfg)
    subs = [('.blocks.', '.layers.'), ('.mlp1.', '.fc1.'), ('.mlp2.', '.fc2.'), ('.mlp_ln.', '.final_layer_norm.'),
            ('.cross_attn_ln.', '.encoder_attn_layer_norm.'), ('.attn_ln.', '.self_attn_layer_norm.'),
            ('.cross_attn.query.', '.encoder_attn.q_proj.'), ('.cross_attn.key.', '.encoder_attn.k_proj.'),
            ('.cross_attn.value.', '.encoder_attn.v_proj.'), ('.cross_attn.out.', '.encoder_attn.out_proj.'),
            ('.attn.query.', '.self_attn.q_proj.'), ('.attn.key.', '.self_attn.k_proj.'),
            ('.attn.value.', '.self_attn.v_proj.'), ('.attn.out.', '.self_attn.out_proj.'),
            ('encoder.ln_post.', 'encoder.layer_norm.'), ('decoder.ln.', 'decoder.layer_norm.'),
            ('decoder.token_embedding.', 'decoder.embed_tokens.'), ('decoder.positional_embedding', 'decoder.embed_positions.weight')]
    state = {}
    with safe_open(os.path.join(d, 'weights.safetensors'), 'np') as f:
        for k in f.keys():
            if k == 'alignment_heads':
                continue
            v = f.get_tensor(k).astype(np.float32)
            if k.startswith('encoder.conv') and v.ndim == 3:
                v = v.transpose(0, 2, 1)  # MLX conv layout (out, k, in) -> torch (out, in, k)
            name = k
            for a, b in subs:
                name = name.replace(a, b)
            state['model.' + name] = torch.from_numpy(np.ascontiguousarray(v))
    # encoder positions are fixed sinusoids (MLX computes them, the checkpoint omits them)
    n, ch = c['n_audio_ctx'], c['n_audio_state']
    inc = np.log(10000) / (ch // 2 - 1)
    t = np.arange(n)[:, None] * np.exp(-inc * np.arange(ch // 2))[None, :]
    state['model.encoder.embed_positions.weight'] = torch.from_numpy(np.concatenate([np.sin(t), np.cos(t)], 1).astype(np.float32))
    state['proj_out.weight'] = state['model.decoder.embed_tokens.weight']
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        sys.exit(f'whisper weight mapping failed: missing {missing[:5]} unexpected {unexpected[:5]}')
    return model.to(device=device, dtype=torch.float16).eval()


def looping(ids, start):
    """Greedy Whisper can fall into a loop on unclear audio: the same 1-8 tokens 3+ times in a row."""
    seq = ids[start:]
    for n in range(1, 9):
        if len(seq) >= 3 * n and seq[-n:] == seq[-2 * n:-n] == seq[-3 * n:-2 * n]:
            return n
    return 0


def transcribe(model, fe, tok, audio, lang='ar'):
    """Greedy transcript of one clip (<= 30 s, 16 kHz float32). Repetition loops are cut, so a
    clip that turns into babble scores as missing words rather than as a long hallucination."""
    import torch
    device = model.device
    feats = fe(audio, sampling_rate=16000, return_tensors='pt').input_features.to(device, torch.float16)
    prompt = [SOT, LANG_TOKEN[lang], TRANSCRIBE, NO_TS]
    budget = int(len(audio) / 16000 * 10) + 12   # ~10 tokens per second of speech at most
    with torch.inference_mode():
        enc = model.model.encoder(feats).last_hidden_state
        ids = list(prompt)
        for _ in range(min(400, budget)):
            logits = model(encoder_outputs=(enc,), decoder_input_ids=torch.tensor([ids], device=device)).logits[0, -1]
            nxt = int(logits.argmax())
            if nxt >= EOT:
                break
            ids.append(nxt)
            n = looping(ids, len(prompt))
            if n:
                del ids[len(ids) - 2 * n:]
                break
    return tok.decode(ids[len(prompt):], skip_special_tokens=True).strip()


class Listener:
    """Whisper loaded once, for the generator's per-take intelligibility check."""
    def __init__(self, lang='ar'):
        import torch
        from tokenizers import Tokenizer
        from transformers import WhisperFeatureExtractor
        self.lang = lang
        self.model = load_model('mps' if torch.backends.mps.is_available() else 'cpu')
        self.fe = WhisperFeatureExtractor(feature_size=self.model.config.num_mel_bins)
        self.tok = Tokenizer.from_file(os.path.join(snapshot('Systran/faster-whisper-medium'), 'tokenizer.json'))

    def score(self, wav_path, text):
        hyp = transcribe(self.model, self.fe, self.tok, decode_audio(wav_path), self.lang)
        return cer(normalise(text, self.lang), normalise(hyp, self.lang)), hyp


def decode_audio(path):
    """16 kHz mono float32 via afconvert (m4a) or soundfile (wav)."""
    import numpy as np
    import soundfile as sf
    import librosa
    if str(path).endswith('.m4a'):
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, 'a.wav')
            subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', str(path), wav], check=True)
            data, sr = sf.read(wav, dtype='float32')
    else:
        data, sr = sf.read(str(path), dtype='float32')
    if data.ndim > 1:
        data = data.mean(1)
    if sr != 16000:
        data = librosa.resample(data, orig_sr=sr, target_sr=16000)
    return np.asarray(data, dtype=np.float32)


def main():
    os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--lang', choices=['ar', 'en'], default='ar')
    ap.add_argument('--only', action='append', help='role or id prefix')
    ap.add_argument('--dir', help='transcribe <id>.wav/.m4a files from this directory instead of the manifest')
    ap.add_argument('--out', help='results json (default tools/voice/.cache/asr_<lang>.json)')
    ap.add_argument('--worst', type=int, default=25)
    ap.add_argument('--limit', type=int)
    args = ap.parse_args()
    import torch
    from tokenizers import Tokenizer
    from transformers import WhisperFeatureExtractor

    voice = Path(ROOT, 'public', 'audio', 'voice')
    man_dir = voice / 'ar' if args.lang == 'ar' else voice
    if args.lang == 'ar':
        texts = json.loads(Path(HERE, 'lines_ar.json').read_text(encoding='utf-8'))['texts']
        en = json.loads((voice / 'manifest.json').read_text(encoding='utf-8'))['clips']
        ref_of = lambda cid: (lambda e: e.get('say', e['text']))(texts[en[cid]['text']])
    else:
        en = json.loads((voice / 'manifest.json').read_text(encoding='utf-8'))['clips']
        ref_of = lambda cid: en[cid]['text']
    if args.dir:
        files = {Path(p).stem: p for p in sorted(glob.glob(os.path.join(args.dir, '*.wav')) + glob.glob(os.path.join(args.dir, '*.m4a')))}
    else:
        man = json.loads((man_dir / 'manifest.json').read_text(encoding='utf-8'))['clips']
        files = {cid: str(man_dir / c['file']) for cid, c in man.items()}
    if args.only:
        files = {k: v for k, v in files.items() if any(k.startswith(s) or (en.get(k, {}).get('role') == s) for s in args.only)}
    if args.limit:
        files = dict(list(files.items())[:args.limit])
    # ad-hoc files may be named <clip id>@<variant>.wav
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = load_model(device)
    fe = WhisperFeatureExtractor(feature_size=model.config.num_mel_bins)
    tok = Tokenizer.from_file(os.path.join(snapshot('Systran/faster-whisper-medium'), 'tokenizer.json'))
    out_path = Path(args.out or Path(HERE, '.cache', f'asr_{args.lang}.json'))
    results = json.loads(out_path.read_text()) if out_path.exists() and not args.dir else {}
    for i, (cid, path) in enumerate(files.items(), 1):
        clip_id = cid.split('@')[0]
        if clip_id not in en:
            continue
        hyp = transcribe(model, fe, tok, decode_audio(path), args.lang)
        ref = ref_of(clip_id)
        results[cid] = dict(cer=cer(normalise(ref, args.lang), normalise(hyp, args.lang)), hyp=hyp, ref=ref)
        if i % 25 == 0:
            print(f'  {i}/{len(files)}', flush=True)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    scored = [(v['cer'], k) for k, v in results.items() if k in files]
    if scored:
        vals = sorted(s for s, _ in scored)
        mean = sum(vals) / len(vals)
        print(f'{len(vals)} clips: mean CER {mean:.3f}, median {vals[len(vals) // 2]:.3f}, '
              f'<=0.15: {sum(v <= .15 for v in vals)}, >0.35: {sum(v > .35 for v in vals)}')
        for s, k in sorted(scored, reverse=True)[:args.worst]:
            print(f'  {s:.2f} {k}: {results[k]["hyp"]}  ||  {results[k]["ref"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
