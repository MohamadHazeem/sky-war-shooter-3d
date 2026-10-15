#!/usr/bin/env python3
"""Recorded crew voices for the radio/interphone, generated offline with Chatterbox or macOS `say`.

Reads tools/voice/lines.json and writes:
  public/audio/voice/<id>.m4a        mono AAC, small (speech is band-limited by the radio chain anyway)
  public/audio/voice/manifest.json   { roles, clips: { id: { file, role, text, dur, h } } }
  src/audio/voiceLines.ts            id -> { speakers, text } table for game code (RadioChatter)

Clips are re-rendered when their engine, voice/reference, emotion or text changes (manifest hash);
`--force` re-renders the selection; `--check` verifies source coverage with explicit dynamic gaps.

`--lang ar` renders the Arabic voice-over instead: the same clip ids and voice references, the Arabic
text from tools/voice/lines_ar.json (node --experimental-strip-types tools/voice/arabic.mjs), the
Chatterbox multilingual model, into public/audio/voice/ar/ (+ its own manifest.json). `--shard i/n`
renders every n-th pending clip so two workers can share a run (manifest writes are merged under a lock).
Needs macOS afconvert; Chatterbox uses the existing .venv-tts. The say/check paths use stdlib only.
"""
import argparse
import math
import time
from pathlib import Path
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import fcntl
import wave
import array
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'audio', 'voice')
TS_OUT = os.path.join(ROOT, 'src', 'audio', 'voiceLines.ts')
AR_OUT = os.path.join(OUT, 'ar')
AR_SRC = os.path.join(HERE, 'lines_ar.json')
WORDS_PER_S = {'en': 2.95, 'ar': 2.4}  # expected speaking rate for the duration sanity check
FORMAT_VERSION = 3  # bump to re-render everything after a processing change

HOURS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
LEVELS = ['high', 'level', 'low']


def load():
    with open(os.path.join(HERE, 'lines.json'), encoding='utf-8') as f:
        return json.load(f)


def expand(cfg):
    """Every concrete clip: dict(id, role, text, spoken, rate, base, kind)."""
    roles = cfg['roles']
    boost = cfg['audio'].get('urgentBoost', 20)
    subs = cfg.get('spoken', [])
    clips = []

    def spoken(text):
        for a, b in subs:
            text = text.replace(a, b)
        return text

    def add(cid, role, text, line, base, kind):
        if role not in roles:
            sys.exit(f'unknown role {role!r} in {cid}')
        rate = line.get('rate', roles[role]['rate'] + (boost if line.get('urgent') else 0))
        clips.append(dict(id=cid, role=role, text=text, spoken=spoken(line.get('say', text)), rate=rate, base=base, kind=kind, noTable=bool(line.get('noTable')),
                          exa=line.get('exa', 0.4 if role == 'briefing' else 0.8 if line.get('urgent') or kind == 'clock' else 0.55),
                          peakDb=line.get('peakDb'), cfg=line.get('cfg', 0.3 if line.get('urgent') or kind == 'clock' else 0.5)))

    for line in cfg['lines']:
        if 'id' not in line:
            continue
        variants = [(line['id'], line['text'])]
        if 'vars' in line:
            (key, values), = line['vars'].items()
            variants = [(line['id'].replace('{i}', str(i + 1)), line['text'].replace('{' + key + '}', v)) for i, v in enumerate(values)]
        for cid, text in variants:
            kind = 'var' if 'vars' in line else 'line'
            if 'roles' in line:
                for r in line['roles']:
                    add(f'{cid}__{r}', r, text, line, cid, kind)
            else:
                add(cid, line['role'], text, line, cid, kind)

    ck = cfg['clock']
    for r in ck['roles']:
        for h in range(1, 13):
            for lv in LEVELS:
                text = f"{HOURS[h]} o'clock {lv}!"
                add(f'clock_{h}_{lv}__{r}', r, text, {'rate': roles[r]['rate'] + ck.get('rateBoost', 20)}, f'clock_{h}_{lv}', 'clock')

    seen = set()
    for c in clips:
        if c['id'] in seen:
            sys.exit(f'duplicate clip id {c["id"]}')
        seen.add(c['id'])
    return clips


def localize(clips, cfg, lang):
    """Arabic clips: same ids/roles/emotion, the Arabic subtitle as text and its speakable form as spoken."""
    if lang == 'en':
        return clips
    texts = json.loads(Path(AR_SRC).read_text(encoding='utf-8'))['texts']
    missing = [c['text'] for c in clips if c['text'] not in texts]
    if missing:
        sys.exit(f'{len(missing)} clips have no Arabic in lines_ar.json (run tools/voice/arabic.mjs), e.g. {missing[0]!r}')
    over = cfg['audio'].get('ar', {})
    out = []
    for c in clips:
        a = texts[c['text']]
        d = dict(c, en=c['text'], text=a['text'], spoken=a.get('say', a['text']), lang=lang)
        # cross-lingual cloning: English references, Arabic speech (lower guidance limits accent transfer)
        if 'cfgScale' in over:
            d['cfg'] = round(c['cfg'] * over['cfgScale'], 3)
        out.append(d)
    return out


def bitrate(c, cfg):
    """Per-role override: the long briefing clips use a lower rate than the short radio lines."""
    return cfg['roles'][c['role']].get('bitrate', cfg['audio']['bitrate'])


def clip_hash(c, cfg):
    v = cfg['roles'][c['role']]['voice']
    a = cfg['audio']
    key = f"{FORMAT_VERSION}|{v}|{c['rate']}|{c['spoken']}|{a['sampleRate']}|{bitrate(c, cfg)}"
    if cfg['audio'].get('engine', 'say') == 'chatterbox':
        ref = Path(HERE, cfg['roles'][c['role']]['ref'])
        ref_hash = hashlib.sha256(ref.read_bytes()).hexdigest()
        key = f"{FORMAT_VERSION}|chatterbox|{ref_hash}|{c['exa']}|{c['cfg']}|{c['spoken']}|{a['sampleRate']}|{bitrate(c, cfg)}"
        if c.get('lang', 'en') != 'en':
            key += f"|lang={c['lang']}"
    if c.get('peakDb') is not None:
        key += f"|peakDb={c['peakDb']}"
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:10]


def trim_normalise(src, dst, sr, peak_db=None):
    """Trim/fade and peak-normalise (default -1 dBFS, optional headroom). Returns seconds."""
    with wave.open(src, 'rb') as w:
        a = array.array('h', w.readframes(w.getnframes()))
    if sys.byteorder != 'little':
        a.byteswap()
    peak = max((abs(x) for x in a), default=0)
    if peak == 0:
        raise RuntimeError(f'silent render: {src}')
    thr = max(250, peak * 0.03)
    first = next(i for i, x in enumerate(a) if abs(x) > thr)
    last = len(a) - 1 - next(i for i, x in enumerate(reversed(a)) if abs(x) > thr)
    s = max(0, first - int(0.025 * sr))
    e = min(len(a), last + int(0.07 * sr))
    seg = a[s:e]
    target = 0.89 if peak_db is None else 10 ** (min(-1, max(-12, float(peak_db))) / 20)
    g = target * 32767 / peak
    n = len(seg)
    fi, fo = int(0.004 * sr), int(0.02 * sr)
    out = array.array('h', bytes(2 * n))
    for i in range(n):
        env = 1.0
        if i < fi:
            env = i / fi
        elif i > n - fo:
            env = (n - i) / fo
        out[i] = int(max(-32767, min(32767, seg[i] * g * env)))
    if sys.byteorder != 'little':
        out.byteswap()
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(out.tobytes())
    return n / sr


def slim_m4a(path):
    """afconvert pads every .m4a with a ~3 KB 'free' atom before the audio data. With hundreds of
    one-second clips that padding is half the size, so drop it and shift the chunk offsets."""
    d = open(path, 'rb').read()
    atoms, o = [], 0
    while o < len(d):
        sz, t = struct.unpack('>I4s', d[o:o + 8])
        if sz < 8:
            return  # 64-bit or malformed atom: leave the file as it is
        atoms.append((t, o, sz))
        o += sz
    if not any(t == b'free' for t, _, _ in atoms):
        return
    names = [t for t, _, _ in atoms]
    if names[-1] != b'mdat' or b'moov' not in names:
        return
    old_mdat = atoms[-1][1]
    kept = [d[o:o + sz] for t, o, sz in atoms if t != b'free']
    new_mdat = sum(len(k) for k in kept[:-1])
    delta = new_mdat - old_mdat
    out = bytearray(b''.join(kept))
    # patch every stco table (32-bit chunk offsets); co64 is not used for files this small
    i = out.find(b'stco', 0, new_mdat)
    while i != -1:
        n = struct.unpack('>I', out[i + 8:i + 12])[0]
        for k in range(n):
            p = i + 12 + 4 * k
            struct.pack_into('>I', out, p, struct.unpack('>I', out[p:p + 4])[0] + delta)
        i = out.find(b'stco', i + 12 + 4 * n, new_mdat)
    open(path, 'wb').write(out)


def ensure_tts_python():
    """Locate the main checkout even from a worktree; never install dependencies."""
    os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
    os.environ.setdefault('HF_HUB_OFFLINE', '1')  # the task's models are already cached
    try:
        import torch  # noqa: F401
        return
    except ImportError:
        pass
    common = subprocess.check_output(['git', '-C', ROOT, 'rev-parse', '--git-common-dir'], text=True).strip()
    main_root = Path(ROOT, common).resolve().parent
    python = os.environ.get('TTS_PYTHON', str(main_root / '.venv-tts/bin/python'))
    if os.environ.get('SWS_TTS_REEXEC') or not Path(python).is_file():
        raise RuntimeError('Chatterbox needs the existing .venv-tts; set TTS_PYTHON to its Python')
    os.environ['SWS_TTS_REEXEC'] = '1'
    os.execv(python, [python, str(Path(__file__).resolve()), *sys.argv[1:]])


def audio_metrics(path, text, lang='en'):
    """PCM quality proxies, not an intelligibility or speaker-similarity judgement."""
    with wave.open(str(path), 'rb') as w:
        sr = w.getframerate()
        samples = array.array('h', w.readframes(w.getnframes()))
    if sys.byteorder != 'little':
        samples.byteswap()
    n = len(samples)
    dur = n / sr
    words = len(re.findall(r"\b[\w]+(?:['’][\w]+)*\b", text))
    peak = max((abs(v) for v in samples), default=0) / 32768
    rms = math.sqrt(sum(v * v for v in samples) / max(1, n)) / 32768
    # Silence: 20 ms windows with RMS below -40 dBFS.
    window = max(1, int(sr * 0.02))
    silent = 0
    for i in range(0, n, window):
        chunk = samples[i:i + window]
        if sum(v * v for v in chunk) / len(chunk) < (32768 * 0.01) ** 2:
            silent += len(chunk)
    expected = max(1, words) / WORDS_PER_S.get(lang, 2.95)  # en: midpoint of 2.3–3.6 words/s
    return dict(duration=round(dur, 3), words=words, wordsPerSecond=round(words / max(dur, 0.001), 3),
                peakDb=round(20 * math.log10(max(peak, 1e-9)), 2),
                rmsDb=round(20 * math.log10(max(rms, 1e-9)), 2),
                silenceFraction=round(silent / max(1, n), 3),
                durationOK=0.35 * expected <= dur <= 2.2 * expected)


def render(c, cfg, tmp, model=None, out_dir=None):
    out_dir = out_dir or OUT
    sr = cfg['audio']['sampleRate']
    raw = os.path.join(tmp, c['id'] + '.raw.wav')
    cut = os.path.join(tmp, c['id'] + '.wav')
    encoded = os.path.join(tmp, c['id'] + '.m4a')
    started = time.monotonic()
    quality = {}
    if model is None:
        voice = cfg['roles'][c['role']]['voice']
        # Preserve the existing say voice/rate and timeout behaviour.
        for attempt in range(4):
            try:
                subprocess.run(['say', '-v', voice, '-r', str(c['rate']), '--file-format=WAVE', f'--data-format=LEI16@{sr}', '-o', raw, c['spoken']], check=True, timeout=20)
                break
            except subprocess.TimeoutExpired:
                if attempt == 3:
                    raise
        dur = trim_normalise(raw, cut, sr, c.get('peakDb'))
    elif c.get('lang', 'en') != 'en':
        dur, quality = render_chunked(c, cfg, tmp, model, cut)
    else:
        import torch
        import torchaudio as ta
        import soundfile as sf
        for attempt in range(4):  # first take plus at most three retries
            seed = (int(hashlib.sha256(c['id'].encode()).hexdigest()[:8], 16) + attempt + 101 * c.get('reseed', 0)) % (2 ** 31)
            torch.manual_seed(seed)
            kw = dict(language_id=c['lang']) if c.get('lang', 'en') != 'en' else {}
            wav = model.generate(c['spoken'], audio_prompt_path=str(Path(HERE, cfg['roles'][c['role']]['ref'])),
                                 exaggeration=c['exa'], cfg_weight=c['cfg'], **kw).detach().cpu()
            wav = ta.functional.resample(wav, model.sr, sr).mean(dim=0)
            sf.write(raw, wav.numpy(), sr, subtype='PCM_16')
            try:
                dur = trim_normalise(raw, cut, sr, c.get('peakDb'))
                quality = audio_metrics(cut, c['spoken'], c.get('lang', 'en'))
            except RuntimeError:  # silence is also a failed take
                quality = dict(durationOK=False, duration=0)
            quality.update(retries=attempt, seed=seed)
            if quality['durationOK']:
                break
            print(f"  retry/flag {c['id']}: take {attempt + 1}, duration {quality['duration']}s", flush=True)
        if not quality['durationOK']:
            # Preserve the old playable clip/hash so the next run tries again.
            raise RenderRejected(c['id'], quality)
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(bitrate(c, cfg)), '-q', '127', cut, encoded], check=True)
    slim_m4a(encoded)
    os.replace(encoded, os.path.join(out_dir, c['id'] + '.m4a'))
    quality.update(renderSeconds=round(time.monotonic() - started, 2))
    return dur, quality


CHUNK_WORDS = 7          # longer sentences are split at their commas
ACCEPT_CER = 0.25        # a take Whisper understands this well is kept at once
CHUNK_TAKES = 3          # otherwise the best of this many takes (lowest CER, plausible duration)
LISTENER = None          # asr_check.Listener when the per-take intelligibility check is on


def split_chunks(text, max_words=CHUNK_WORDS):
    """Sentences, and long sentences at their commas: the multilingual model stays clear for one
    short phrase but tends to babble after the first sentence of a long line."""
    out = []
    for sent in re.findall(r'[^.!?؟]+[.!?؟]*', text):
        sent = sent.strip()
        if not sent:
            continue
        parts = [p.strip() for p in re.findall(r'[^،,]+[،,]?', sent) if p.strip()]
        cur = ''
        for p in parts:
            if cur and len((cur + ' ' + p).split()) > max_words and len(cur.split()) >= 3:
                out.append(cur)
                cur = p
            else:
                cur = (cur + ' ' + p).strip()
        if cur:
            if out and len(cur.split()) < 2 and not re.search(r'[.!?؟]$', out[-1]):
                out[-1] += ' ' + cur
            else:
                out.append(cur)
    # a trailing Arabic comma would make the model add a full stop: give it the Latin comma
    return [re.sub('،$', ',', ch) for ch in out] or [text]


def _pcm(path):
    with wave.open(path, 'rb') as w:
        a = array.array('h', w.readframes(w.getnframes()))
    if sys.byteorder != 'little':
        a.byteswap()
    return a


def render_chunked(c, cfg, tmp, model, cut):
    """Arabic take: each chunk rendered separately (best of up to CHUNK_TAKES by Whisper CER and
    duration), then joined with short pauses and trimmed/normalised like every clip."""
    import torch
    import torchaudio as ta
    import soundfile as sf
    sr = cfg['audio']['sampleRate']
    ref = str(Path(HERE, cfg['roles'][c['role']]['ref']))
    base_seed = int(hashlib.sha256(c['id'].encode()).hexdigest()[:8], 16) + 101 * c.get('reseed', 0)
    chunks = split_chunks(c['spoken'])
    joined = array.array('h')
    report = []
    takes = 0
    for k, ch in enumerate(chunks):
        best = None
        for attempt in range(CHUNK_TAKES):
            seed = (base_seed + 7 * k + attempt) % (2 ** 31)
            torch.manual_seed(seed)
            # the reference is re-embedded only when the role changes
            prompt = None if getattr(model, '_sws_ref', None) == ref else ref
            wav = model.generate(ch, language_id=c['lang'], audio_prompt_path=prompt,
                                 exaggeration=c['exa'], cfg_weight=c['cfg']).detach().cpu()
            model._sws_ref = ref
            takes += 1
            wav = ta.functional.resample(wav, model.sr, sr).mean(dim=0)
            raw = os.path.join(tmp, f'{c["id"]}.{k}.raw.wav')
            part = os.path.join(tmp, f'{c["id"]}.{k}.{attempt}.wav')
            sf.write(raw, wav.numpy(), sr, subtype='PCM_16')
            try:
                trim_normalise(raw, part, sr)
                m = audio_metrics(part, ch, c['lang'])
            except RuntimeError:
                continue
            score, hyp = LISTENER.score(part, ch) if LISTENER else (0.0, '')
            bad = score + (0 if m['durationOK'] else 1)   # an implausible length loses to any plausible take
            if best is None or bad < best[0]:
                best = (bad, score, hyp, part, m['duration'], seed)
            if m['durationOK'] and score <= ACCEPT_CER:
                break
        if best is None or best[0] >= 1:
            raise RenderRejected(c['id'], dict(durationOK=False, duration=0, chunk=k, text=ch))
        pcm = _pcm(best[3])
        if joined:
            gap = 0.28 if re.search(r'[.!?؟]$', chunks[k - 1]) else 0.12
            joined.extend(array.array('h', bytes(2 * int(gap * sr))))
        joined.extend(pcm)
        report.append(dict(text=ch, cer=best[1], hyp=best[2], duration=best[4], seed=best[5]))
    full = os.path.join(tmp, c['id'] + '.joined.wav')
    out = joined
    if sys.byteorder != 'little':
        out = array.array('h', joined)
        out.byteswap()
    with wave.open(full, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(out.tobytes())
    dur = trim_normalise(full, cut, sr, c.get('peakDb'))
    quality = audio_metrics(cut, c['spoken'], c['lang'])
    words = [len(r['text'].split()) for r in report]
    quality.update(chunks=report, takes=takes,
                   cer=round(sum(r['cer'] * w for r, w in zip(report, words)) / max(1, sum(words)), 3) if LISTENER else None)
    return dur, quality


class RenderRejected(RuntimeError):
    def __init__(self, cid, quality):
        super().__init__(f'{cid}: rejected after three retries; previous clip retained')
        self.quality = quality


def merged_json(path, update):
    """Read-modify-write a JSON file under an exclusive lock, so parallel --shard workers never
    overwrite each other's entries. update(current) -> new value."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    locks = Path(HERE, '.cache', 'locks')   # outside public/: never deployed
    locks.mkdir(parents=True, exist_ok=True)
    with open(locks / (hashlib.sha1(str(path.resolve()).encode()).hexdigest()[:12] + '.lock'), 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            current = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
            atomic_json(path, update(current))
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(temp, path)


def select_clips(clips, only, limit):
    selected = clips
    roles = {c['role'] for c in clips}
    def matches(c, selector):
        return c['role'] == selector if selector in roles else c['id'].startswith(selector)
    if only:
        for selector in only:
            if not any(matches(c, selector) for c in clips):
                raise ValueError(f'--only matched no clips: {selector}')
        selected = [c for c in clips if any(matches(c, s) for s in only)]
    # Limit the selection BEFORE cache filtering: rerunning a sample is a no-op.
    return selected if limit is None else selected[:limit]


def callout_texts():
    """Literal and template callout texts in src/ (for --check). Templates become regexes."""
    found = []
    pat_call = re.compile(r"callout\(\s*'[^']*'(?:\s*\+[^,]+)?,\s*(?:'[^']*'|\[[^\]]*\][^,]*|[^,]+),\s*(`[^`]*`|'(?:[^'\\]|\\.)*')\s*(?:,\s*[\d.]|\))")
    pat_radio = re.compile(r"radio:\s*\['[^']*',\s*'((?:[^'\\]|\\.)*)'\]")
    pat_pair = re.compile(r"\['(?:Pilot|Tail|Navigator|Ball Turret|Radio|Top Turret|Bombardier|Lead|Big Friend|Blue Three|Waist)',\s*'((?:[^'\\]|\\.)*)'\]")
    pat_lines = re.compile(r"const lines = \[(.*?)\];")
    for dp, _, fs in os.walk(os.path.join(ROOT, 'src')):
        for fn in fs:
            if not fn.endswith('.ts') or fn == 'voiceLines.ts':
                continue
            src = open(os.path.join(dp, fn), encoding='utf-8').read()
            for m in pat_call.finditer(src):
                found.append((fn, m.group(1)))
            for m in pat_radio.finditer(src):
                found.append((fn, "'" + m.group(1) + "'"))
            for m in pat_pair.finditer(src):
                found.append((fn, "'" + m.group(1) + "'"))
            for m in pat_lines.finditer(src):
                for lit in re.findall(r"`[^`]*`|'(?:[^'\\]|\\.)*'", m.group(1)):
                    if re.search(r"[!.?][`']$", lit):  # sentences only, not labels like 'Bf 109'
                        found.append((fn, lit))
    out = []
    for fn, lit in found:
        body = lit[1:-1].replace("\\'", "'")
        if lit.startswith('`'):
            parts = re.split(r'\$\{[^}]*\}', body)
            rx = '^' + '(.+?)'.join(re.escape(p) for p in parts) + '$'
            out.append((fn, body, re.compile(rx)))
        elif body:
            out.append((fn, body, None))
    return out


# Exact source templates with voiced semantic equivalents. Names/locations remain in
# subtitles; finite type/clock clips and contextual sentences keep the radio readable.
DYNAMIC_CALLOUTS = {(r['source'], r['template']) for r in load().get('dynamic', [])}


def check(clips):
    texts = {c['text'] for c in clips}
    prefixes = {c['text'] for c in clips if c['base'].startswith('pfx_')}
    bad = composed = 0
    rules = load().get('dynamic', [])
    ids = {c['id'] for c in clips}
    found = callout_texts()
    print(f'check: {len(found)} callout texts found in src/')
    for fn, body, rx in found:
        ok = body in texts if rx is None else any(rx.match(t) for t in texts)
        # clock-composed template like `Fighters, ${clock}!`: prefix clip + clock clip
        if not ok and rx is not None:
            ok = body.split('${')[0].strip() in prefixes
        if not ok and (fn, body) in DYNAMIC_CALLOUTS:
            mapped = [r for r in rules if (r['source'], r['template']) == (fn, body)]
            if mapped and all(r['clip'] in ids for r in mapped):
                composed += 1
                continue
        if not ok:
            bad += 1
            print(f'  no clip: {fn}: {body}')
    print(f'check: {composed} dynamic templates have recorded equivalents; 0 deferred')
    print(f'check: {"all other callout texts covered" if not bad else f"{bad} callout texts without a clip"}')
    return bad == 0


def write_ts(cfg, clips):
    """Base lines (not clock clips or name/number variants) for game code: id -> speakers + text."""
    roles = cfg['roles']
    table = {}
    for c in clips:
        if c['kind'] != 'line' or roles[c['role']].get('noTable') or c['noTable']:  # briefings / crew room: found by id or text, not named in game code
            continue
        e = table.setdefault(c['base'], {'speakers': [], 'text': c['text']})
        e['speakers'].append(roles[c['role']]['speaker'])
    lines = ['// GENERATED by tools/voice/generate.py from tools/voice/lines.json. Do not edit by hand.',
             '// Named radio lines: id -> who can say it (subtitle speaker) and the exact subtitle text.',
             '// A clip for each exists in public/audio/voice/ (id, or id__role for multi-speaker lines).',
             '',
             'export const VOICE_LINES = {']
    for k in sorted(table):
        e = table[k]
        lines.append(f'  {k}: {{ speakers: {json.dumps(e["speakers"])}, text: {json.dumps(e["text"], ensure_ascii=False)} }},')
    lines += ['} as const;', '', 'export type VoiceLineId = keyof typeof VOICE_LINES;', '']
    with open(TS_OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def main():
    global LISTENER
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only', action='append', help='role or id prefix; repeat to combine selections')
    parser.add_argument('--limit', type=int, help='maximum selected clips, including cached clips')
    parser.add_argument('--engine', choices=['say', 'chatterbox'], help='override lines.json engine')
    parser.add_argument('--lang', choices=['en', 'ar'], default='en', help='ar: the Arabic voice-over (Chatterbox multilingual)')
    parser.add_argument('--shard', help='i/n: render only every n-th pending clip, starting at i (parallel workers)')
    parser.add_argument('--reseed', type=int, default=0, help='other random takes for the selection (with --force): fix a bad clip')
    parser.add_argument('--max-render', type=int, help='render at most this many pending clips (batches)')
    parser.add_argument('--no-asr', action='store_true', help='--lang ar: skip the Whisper check of each take (faster, worse)')
    args = parser.parse_args()
    if args.limit is not None and args.limit < 0:
        parser.error('--limit must be non-negative')
    shard = None
    if args.shard:
        m = re.fullmatch(r'(\d+)/(\d+)', args.shard)
        if not m or not 0 <= int(m[1]) < int(m[2]):
            parser.error('--shard must be i/n with 0 <= i < n')
        shard = (int(m[1]), int(m[2]))
    cfg = load()
    clips = expand(cfg)
    if args.check:
        return 0 if check(clips) else 1
    lang = args.lang
    clips = localize(clips, cfg, lang)
    if args.reseed:
        clips = [dict(c, reseed=args.reseed) for c in clips]
    if args.engine:
        cfg['audio']['engine'] = args.engine
    engine = cfg['audio'].get('engine', 'say')
    if engine not in ('say', 'chatterbox'):
        parser.error(f'unknown engine: {engine}')
    if lang != 'en' and engine != 'chatterbox':
        parser.error('--lang ar needs the chatterbox engine (macOS say voices are English here)')
    try:
        selected = select_clips(clips, args.only, args.limit)
    except ValueError as e:
        parser.error(str(e))
    out_dir = OUT if lang == 'en' else AR_OUT
    os.makedirs(out_dir, exist_ok=True)
    man_path = Path(out_dir, 'manifest.json')
    old = json.loads(man_path.read_text(encoding='utf-8')).get('clips', {}) if man_path.exists() else {}
    # Keep unselected entries, including their old hashes, during migration and --force.
    result = {c['id']: old[c['id']] for c in clips if c['id'] in old}
    quality_path = Path(HERE, '.cache', 'quality.json' if lang == 'en' else f'quality_{lang}.json')
    # Arabic batches: a clip rejected with these exact seeds is not retried (same seeds, same takes);
    # run again with another --reseed to give it new takes.
    tried = json.loads(quality_path.read_text()) if lang != 'en' and quality_path.exists() else {}
    todo = []
    for c in selected:
        h = clip_hash(c, cfg)
        prev = result.get(c['id'])
        if args.force or not prev or prev.get('h') != h or not Path(out_dir, prev['file']).is_file():
            q = tried.get(c['id'], {})
            if not args.force and q.get('rejected') and q.get('hash') == h and q.get('reseed', 0) == args.reseed:
                continue
            todo.append((c, h))
    if shard:  # stable split by position in the full clip list: workers never overlap, whenever they start
        pos = {c['id']: i for i, c in enumerate(clips)}
        todo = [(c, h) for c, h in todo if pos[c['id']] % shard[1] == shard[0]]
    if args.max_render is not None:
        todo = todo[:args.max_render]
    print(f'{len(clips)} clips, {len(selected)} selected, {len(todo)} to render ({engine}, {lang})', flush=True)
    model = None
    if todo and engine == 'chatterbox':
        ensure_tts_python()
        import torch
        device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        if lang == 'en':
            from chatterbox.tts import ChatterboxTTS
            model = ChatterboxTTS.from_pretrained(device=device)
        else:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            if not args.no_asr:
                sys.path.insert(0, HERE)
                from asr_check import Listener
                LISTENER = Listener(lang)
    quality_new = {}
    done = {}  # clips this process rendered (merged into the on-disk manifest under a lock)

    def header():
        if lang != 'en':
            return {'version': FORMAT_VERSION, 'lang': lang}
        return {
            'version': FORMAT_VERSION,
            'roles': {k: {'speaker': v['speaker'], 'aliases': v.get('aliases', []), 'voice': v['voice']} for k, v in cfg['roles'].items()},
            'clockRoles': cfg['clock']['roles'],
            'dynamic': cfg.get('dynamic', []),
        }

    def checkpoint():
        def update(current):
            have = dict(current.get('clips', {}))
            have.update(done)
            result.update(have)
            return {**header(), 'clips': {c['id']: have[c['id']] for c in clips if c['id'] in have}}
        merged_json(man_path, update)
        merged_json(quality_path, lambda q: {**q, **quality_new})
        quality_new.clear()

    failures = 0
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as tmp:
        def job(item):
            c, h = item
            t0 = time.monotonic()
            try:
                dur, quality = render(c, cfg, tmp, model, out_dir)
                return c, h, dur, quality, None
            except RenderRejected as e:
                e.quality['renderSeconds'] = round(time.monotonic() - t0, 2)
                return c, h, None, e.quality, str(e)
        executor = ThreadPoolExecutor(max_workers=min(6, os.cpu_count() or 4)) if engine == 'say' else None
        try:
            # Chatterbox MUST stay sequential: one model on MPS.
            jobs = executor.map(job, todo) if executor else map(job, todo)
            for i, (c, h, dur, quality, error) in enumerate(jobs, 1):
                quality_new[c['id']] = dict(text=c['text'], spoken=c['spoken'], role=c['role'], engine=engine, hash=h, **quality)
                if lang != 'en':
                    quality_new[c['id']].update(rejected=bool(error), reseed=args.reseed)
                if error:
                    failures += 1
                    print(f'FAILED: {error}', flush=True)
                else:
                    done[c['id']] = result[c['id']] = dict(file=c['id'] + '.m4a', role=c['role'], text=c['text'], dur=round(dur, 3), h=h)
                if i % 25 == 0 or i == len(todo):
                    elapsed = time.monotonic() - started
                    print(f'  {i}/{len(todo)}, elapsed {elapsed:.0f}s, ETA {elapsed / i * (len(todo) - i):.0f}s', flush=True)
                if i % 10 == 0:
                    checkpoint()
        finally:
            if executor:
                executor.shutdown(wait=True)
            checkpoint()  # also save completed clips on Ctrl-C or a render exception
    # No pruning in partial runs: unrelated assets must remain playable.
    print(f'wrote manifest with {len(result)} clips; {failures} rejected; metrics: {quality_path}', flush=True)
    if lang != 'en':
        print(f'{lang}: {len(result)}/{len(clips)} clips rendered', flush=True)
        return 1 if failures else 0
    write_ts(cfg, clips)
    return 0 if check(clips) and not failures else 1


if __name__ == '__main__':
    sys.exit(main())
