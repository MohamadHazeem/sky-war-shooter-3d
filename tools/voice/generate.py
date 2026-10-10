#!/usr/bin/env python3
"""Recorded crew voices for the radio/interphone, generated offline with macOS `say`.

Reads tools/voice/lines.json and writes:
  public/audio/voice/<id>.m4a        mono AAC, small (speech is band-limited by the radio chain anyway)
  public/audio/voice/manifest.json   { roles, clips: { id: { file, role, text, dur, h } } }
  src/audio/voiceLines.ts            id -> { speakers, text } table for game code (RadioChatter)

Clips are only re-rendered when their voice, rate or spoken text changed (hash `h` in the manifest);
`--force` re-renders everything, `--check` only verifies that every callout text in src/ has a clip.
Needs macOS (`say`, `afconvert`, `afinfo`) and Python 3.8+ (standard library only).
"""
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
        clips.append(dict(id=cid, role=role, text=text, spoken=spoken(line.get('say', text)), rate=rate, base=base, kind=kind))

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


def clip_hash(c, cfg):
    v = cfg['roles'][c['role']]['voice']
    a = cfg['audio']
    key = f"{FORMAT_VERSION}|{v}|{c['rate']}|{c['spoken']}|{a['sampleRate']}|{a['bitrate']}"
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


def render(c, cfg, tmp):
    sr = cfg['audio']['sampleRate']
    voice = cfg['roles'][c['role']]['voice']
    raw = os.path.join(tmp, c['id'] + '.raw.wav')
    cut = os.path.join(tmp, c['id'] + '.wav')
    dst = os.path.join(OUT, c['id'] + '.m4a')
    # `say` occasionally stalls when many run at once: time out and retry
    for attempt in range(4):
        try:
            subprocess.run(['say', '-v', voice, '-r', str(c['rate']), '--file-format=WAVE', f'--data-format=LEI16@{sr}', '-o', raw, c['spoken']], check=True, timeout=20)
            break
        except subprocess.TimeoutExpired:
            if attempt == 3:
                raise
    dur = trim_normalise(raw, cut, sr)
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(cfg['audio']['bitrate']), '-q', '127', cut, dst], check=True)
    slim_m4a(dst)
    return dur


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


def check(clips):
    texts = {c['text'] for c in clips}
    prefixes = {c['text'] for c in clips if c['base'].startswith('pfx_')}
    bad = 0
    found = callout_texts()
    print(f'check: {len(found)} callout texts found in src/')
    for fn, body, rx in found:
        ok = body in texts if rx is None else any(rx.match(t) for t in texts)
        # clock-composed template like `Fighters, ${clock}!`: prefix clip + clock clip
        if not ok and rx is not None:
            ok = body.split('${')[0].strip() in prefixes
        if not ok:
            bad += 1
            print(f'  no clip: {fn}: {body}')
    print(f'check: {"all callout texts covered" if not bad else f"{bad} callout texts without a clip"}')
    return bad == 0


def write_ts(cfg, clips):
    """Base lines (not clock clips or name/number variants) for game code: id -> speakers + text."""
    roles = cfg['roles']
    table = {}
    for c in clips:
        if c['kind'] != 'line':
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
    cfg = load()
    clips = expand(cfg)
    if '--check' in sys.argv:
        sys.exit(0 if check(clips) else 1)
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    old = {}
    if os.path.exists(man_path) and not force:
        try:
            old = json.load(open(man_path, encoding='utf-8')).get('clips', {})
        except Exception:
            old = {}
    todo, result = [], {}
    for c in clips:
        h = clip_hash(c, cfg)
        prev = old.get(c['id'])
        if prev and prev.get('h') == h and os.path.exists(os.path.join(OUT, prev['file'])):
            result[c['id']] = prev
        else:
            todo.append((c, h))
    print(f'{len(clips)} clips, {len(todo)} to render')
    with tempfile.TemporaryDirectory() as tmp:
        def job(item):
            c, h = item
            dur = render(c, cfg, tmp)
            return c['id'], {'file': c['id'] + '.m4a', 'role': c['role'], 'text': c['text'], 'dur': round(dur, 3), 'h': h}
        with ThreadPoolExecutor(max_workers=min(6, os.cpu_count() or 4)) as ex:
            for i, (cid, entry) in enumerate(ex.map(job, todo)):
                result[cid] = entry
                if (i + 1) % 50 == 0:
                    print(f'  {i + 1}/{len(todo)}')
    # drop files no longer listed
    keep = {e['file'] for e in result.values()} | {'manifest.json'}
    for fn in os.listdir(OUT):
        if fn not in keep:
            os.remove(os.path.join(OUT, fn))
    ordered = {c['id']: result[c['id']] for c in clips}
    manifest = {
        'version': FORMAT_VERSION,
        'roles': {k: {'speaker': v['speaker'], 'aliases': v.get('aliases', []), 'voice': v['voice']} for k, v in cfg['roles'].items()},
        'clockRoles': cfg['clock']['roles'],
        'clips': ordered,
    }
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    write_ts(cfg, clips)
    total = sum(os.path.getsize(os.path.join(OUT, fn)) for fn in os.listdir(OUT))
    secs = sum(e['dur'] for e in ordered.values())
    print(f'wrote {len(ordered)} clips, {secs:.0f} s of speech, {total / 1024 / 1024:.2f} MB in public/audio/voice')
    check(clips)


if __name__ == '__main__':
    main()
