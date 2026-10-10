"""Processing helpers: one-shots and seamless loops."""
import subprocess, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aud import load, SR, FF, db

def write(a, out, kind=None):
    """a: (n,ch) float32. kind from extension: wav -> 16-bit PCM, mp3 -> 192k LAME, m4a -> aac 192k"""
    a = np.clip(a, -1, 1).astype(np.float32)
    ch = a.shape[1]
    ext = out.rsplit('.', 1)[-1]
    codec = {"wav": ["-c:a", "pcm_s16le"], "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
             "m4a": ["-c:a", "aac", "-b:a", "192k"]}[ext]
    if ext == "mp3" and os.environ.get("MP3RATE"):
        codec = ["-c:a", "libmp3lame", "-b:a", os.environ["MP3RATE"]]
    cmd = [FF, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-map_metadata", "-1"] + codec + [out]
    subprocess.run(cmd, input=a.tobytes(), check=True)

def norm_peak(a, target=-1.0):
    pk = np.abs(a).max()
    return a * (10 ** (target / 20) / max(pk, 1e-9))

def fade(a, fin_ms=1.0, fout_ms=30.0, shape="cos"):
    n = len(a)
    fi = max(1, int(SR * fin_ms / 1000)); fo = max(1, min(n, int(SR * fout_ms / 1000)))
    w = np.ones(n, dtype=np.float32)
    w[:fi] = np.linspace(0, 1, fi)
    if shape == "exp":
        w[n - fo:] *= np.exp(-np.linspace(0, 6, fo)) * np.linspace(1, 0, fo) ** 0.5
    else:
        w[n - fo:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fo)))
    return a * w[:, None]

def trim_start(a, thresh_db=-36.0, pre_ms=1.0):
    """drop leading material quieter than thresh relative to peak (transient at t~0)."""
    m = np.abs(a).max(axis=1)
    pk = m.max()
    idx = np.argmax(m > pk * 10 ** (thresh_db / 20))
    s = max(0, idx - int(SR * pre_ms / 1000))
    return a[s:]

def trim_end(a, thresh_db=-50.0, keep_ms=20):
    m = np.abs(a).max(axis=1)
    pk = m.max()
    above = np.where(m > pk * 10 ** (thresh_db / 20))[0]
    e = min(len(a), above[-1] + int(SR * keep_ms / 1000)) if len(above) else len(a)
    return a[:e]

def oneshot(src, ss, dur, out, fout_ms=40, af=None, ch=2, shape="cos", thresh=-36, endthresh=-50, target=-1.0, fin_ms=1.0):
    a = load(src, ch, ss, dur, af)
    a = trim_start(a, thresh)
    a = trim_end(a, endthresh)
    a = fade(a, fin_ms, fout_ms, shape)
    a = norm_peak(a, target)
    if out:
        write(a, out)
    return len(a) / SR, a

def make_loop(src, ss, dur, xf, out, af=None, ch=2, target_rms=None, peak=-1.0):
    """Take [ss, ss+dur+xf] and crossfade the extra tail over the start -> seamless loop of length dur."""
    a = load(src, ch, ss, dur + xf, af)
    n = int(round(dur * SR)); x = int(round(xf * SR))
    a = a[: n + x]
    body = a[:n].copy()
    tail = a[n:n + x]
    t = np.linspace(0, np.pi / 2, x)[:, None]
    # equal-power crossfade: start of loop fades in while tail fades out
    body[:x] = body[:x] * np.sin(t) + tail * np.cos(t)
    if target_rms is not None:
        r = np.sqrt(np.mean(body ** 2)); body *= 10 ** (target_rms / 20) / r
    pk = np.abs(body).max()
    lim = 10 ** (peak / 20)
    if pk > lim:
        body *= lim / pk
    write(body, out)
    return body

def loop_check(path):
    a = load(path, 2)
    m = a.mean(axis=1)
    n = int(SR * 0.05)
    head = db(np.sqrt(np.mean(m[:n] ** 2))); tail = db(np.sqrt(np.mean(m[-n:] ** 2)))
    full = db(np.sqrt(np.mean(m ** 2)))
    # discontinuity at the wrap: compare jump at wrap to typical sample-to-sample jump
    d = np.abs(np.diff(a, axis=0)).mean()
    wrap = np.abs(a[0] - a[-1]).mean()
    return dict(dur=len(a) / SR, rms=full, head=head, tail=tail, wrap_jump=wrap / (d + 1e-12), peak=db(np.abs(a).max()))
