#!/usr/bin/env python3
"""Recorded crew voices for the radio/interphone, generated offline with Chatterbox or macOS `say`.

Reads tools/voice/lines.json and writes:
  public/audio/voice/<id>.m4a        mono AAC, small (speech is band-limited by the radio chain anyway)
  public/audio/voice/manifest.json   { roles, clips: { id: { file, role, text, dur, h } } }
  src/audio/voiceLines.ts            id -> { speakers, text } table for game code (RadioChatter)

Clips are re-rendered when their engine, voice/reference, emotion or text changes (manifest hash);
`--force` re-renders the selection; `--check` verifies source coverage with explicit dynamic gaps.
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
import wave
import array
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'audio', 'voice')
TS_OUT = os.path.join(ROOT, 'src', 'audio', 'voiceLines.ts')
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
                          cfg=line.get('cfg', 0.3 if line.get('urgent') or kind == 'clock' else 0.5)))

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
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:10]


def trim_normalise(src, dst, sr):
    """Cut leading/trailing silence, short fades, peak to -1 dBFS. Returns duration (s)."""
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
    g = 0.89 * 32767 / peak
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


def audio_metrics(path, text):
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
    expected = max(1, words) / 2.95  # midpoint of 2.3–3.6 words/s
    return dict(duration=round(dur, 3), words=words, wordsPerSecond=round(words / max(dur, 0.001), 3),
                peakDb=round(20 * math.log10(max(peak, 1e-9)), 2),
                rmsDb=round(20 * math.log10(max(rms, 1e-9)), 2),
                silenceFraction=round(silent / max(1, n), 3),
                durationOK=0.35 * expected <= dur <= 2.2 * expected)


def render(c, cfg, tmp, model=None):
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
        dur = trim_normalise(raw, cut, sr)
    else:
        import torch
        import torchaudio as ta
        import soundfile as sf
        for attempt in range(4):  # first take plus at most three retries
            seed = (int(hashlib.sha256(c['id'].encode()).hexdigest()[:8], 16) + attempt) % (2 ** 31)
            torch.manual_seed(seed)
            wav = model.generate(c['spoken'], audio_prompt_path=str(Path(HERE, cfg['roles'][c['role']]['ref'])),
                                 exaggeration=c['exa'], cfg_weight=c['cfg']).detach().cpu()
            wav = ta.functional.resample(wav, model.sr, sr).mean(dim=0)
            sf.write(raw, wav.numpy(), sr, subtype='PCM_16')
            try:
                dur = trim_normalise(raw, cut, sr)
                quality = audio_metrics(cut, c['spoken'])
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
    os.replace(encoded, os.path.join(OUT, c['id'] + '.m4a'))
    quality.update(renderSeconds=round(time.monotonic() - started, 2))
    return dur, quality


class RenderRejected(RuntimeError):
    def __init__(self, cid, quality):
        super().__init__(f'{cid}: rejected after three retries; previous clip retained')
        self.quality = quality


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


# Existing runtime-only subtitles, not finite recordings. Keep this exact and visible:
# --check still fails on any NEW missing literal or template (never skip all templates).
DYNAMIC_CALLOUTS = {
    ('Director.ts', "${v.label}s coming in — ${v.blurb}!"),
    ('NemesisRuntime.ts', "He's back — the one who wounded ${wounded.wounded[0]} over ${wounded.place}!"),
    ('NemesisRuntime.ts', "He's back — the one who shot us down over ${downedUs.place}!"),
    ('SpecialEvents.ts', "Yellow noses, twelve o'clock high! That's ${this.ace.last}'s Staffel — ${this.ace.victories} kills!"),
    ('SpecialEvents.ts', "${this.ace.last} is breaking off — the yellow noses are heading home."),
    ('SpecialEvents.ts', "You got ${a.last}! The whole group saw him go down!"),
    ('SpecialEvents.ts', "Somebody got ${a.last}! Scratch one Experte!"),
    ('PilotOps.ts', "Careful, Blue two — that ${f.label} has a rear gunner. Come at him from below!"),
    ('PilotOps.ts', "He's seen you — he's breaking ${side}! Stay with him!"),
    ('PilotOps.ts', "Little friends, this is ${b.name}. We've lost two engines and can't keep up — can you cover us?"),
    ('PilotOps.ts', "${v.label}s in this bunch — ${v.blurb}!"),
}


def check(clips):
    texts = {c['text'] for c in clips}
    prefixes = {c['text'] for c in clips if c['base'].startswith('pfx_')}
    bad = deferred = 0
    found = callout_texts()
    print(f'check: {len(found)} callout texts found in src/')
    for fn, body, rx in found:
        ok = body in texts if rx is None else any(rx.match(t) for t in texts)
        # clock-composed template like `Fighters, ${clock}!`: prefix clip + clock clip
        if not ok and rx is not None:
            ok = body.split('${')[0].strip() in prefixes
        if not ok and (fn, body) in DYNAMIC_CALLOUTS:
            deferred += 1
            print(f'  known dynamic subtitle (not recorded): {fn}: {body}')
            continue
        if not ok:
            bad += 1
            print(f'  no clip: {fn}: {body}')
    print(f'check: {deferred} known dynamic subtitles deferred')
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only', action='append', help='role or id prefix; repeat to combine selections')
    parser.add_argument('--limit', type=int, help='maximum selected clips, including cached clips')
    parser.add_argument('--engine', choices=['say', 'chatterbox'], help='override lines.json engine')
    args = parser.parse_args()
    if args.limit is not None and args.limit < 0:
        parser.error('--limit must be non-negative')
    cfg = load()
    clips = expand(cfg)
    if args.check:
        return 0 if check(clips) else 1
    if args.engine:
        cfg['audio']['engine'] = args.engine
    engine = cfg['audio'].get('engine', 'say')
    if engine not in ('say', 'chatterbox'):
        parser.error(f'unknown engine: {engine}')
    try:
        selected = select_clips(clips, args.only, args.limit)
    except ValueError as e:
        parser.error(str(e))
    os.makedirs(OUT, exist_ok=True)
    man_path = Path(OUT, 'manifest.json')
    old = json.loads(man_path.read_text(encoding='utf-8')).get('clips', {}) if man_path.exists() else {}
    # Keep unselected entries, including their old hashes, during migration and --force.
    result = {c['id']: old[c['id']] for c in clips if c['id'] in old}
    todo = []
    for c in selected:
        h = clip_hash(c, cfg)
        prev = result.get(c['id'])
        if args.force or not prev or prev.get('h') != h or not Path(OUT, prev['file']).is_file():
            todo.append((c, h))
    print(f'{len(clips)} clips, {len(selected)} selected, {len(todo)} to render ({engine})', flush=True)
    model = None
    if todo and engine == 'chatterbox':
        ensure_tts_python()
        import torch
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device='mps' if torch.backends.mps.is_available() else 'cpu')
    quality_path = Path(HERE, '.cache', 'quality.json')
    quality_log = json.loads(quality_path.read_text()) if quality_path.exists() else {}

    def checkpoint():
        atomic_json(man_path, {
            'version': FORMAT_VERSION,
            'roles': {k: {'speaker': v['speaker'], 'aliases': v.get('aliases', []), 'voice': v['voice']} for k, v in cfg['roles'].items()},
            'clockRoles': cfg['clock']['roles'],
            'clips': {c['id']: result[c['id']] for c in clips if c['id'] in result},
        })

    failures = 0
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as tmp:
        def job(item):
            c, h = item
            t0 = time.monotonic()
            try:
                dur, quality = render(c, cfg, tmp, model)
                return c, h, dur, quality, None
            except RenderRejected as e:
                e.quality['renderSeconds'] = round(time.monotonic() - t0, 2)
                return c, h, None, e.quality, str(e)
        executor = ThreadPoolExecutor(max_workers=min(6, os.cpu_count() or 4)) if engine == 'say' else None
        try:
            # Chatterbox MUST stay sequential: one model on MPS.
            jobs = executor.map(job, todo) if executor else map(job, todo)
            for i, (c, h, dur, quality, error) in enumerate(jobs, 1):
                quality_log[c['id']] = dict(text=c['text'], spoken=c['spoken'], role=c['role'], engine=engine, hash=h, **quality)
                atomic_json(quality_path, quality_log)
                if error:
                    failures += 1
                    print(f'FAILED: {error}', flush=True)
                else:
                    result[c['id']] = dict(file=c['id'] + '.m4a', role=c['role'], text=c['text'], dur=round(dur, 3), h=h)
                if i % 25 == 0 or i == len(todo):
                    elapsed = time.monotonic() - started
                    print(f'  {i}/{len(todo)}, elapsed {elapsed:.0f}s, ETA {elapsed / i * (len(todo) - i):.0f}s', flush=True)
                if i % 50 == 0:
                    checkpoint()
        finally:
            if executor:
                executor.shutdown(wait=True)
            checkpoint()  # also save completed clips on Ctrl-C or a render exception
    write_ts(cfg, clips)
    # No pruning in partial runs: unrelated assets must remain playable.
    print(f'wrote manifest with {len(result)} clips; {failures} rejected; metrics: {quality_path}', flush=True)
    return 0 if check(clips) and not failures else 1


if __name__ == '__main__':
    sys.exit(main())
