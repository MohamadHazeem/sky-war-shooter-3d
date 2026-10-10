"""Audio analysis helpers (numpy + ffmpeg)."""
import subprocess, sys, json, os
import numpy as np

import shutil
FF = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
SR = 44100


def load(path, ch=2, ss=None, t=None, af=None):
    cmd = [FF, "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-i", path]
    if af:
        cmd += ["-af", af]
    cmd += ["-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    return a.reshape(-1, ch)


def db(x):
    return 20 * np.log10(max(float(x), 1e-9))


def envelope(m, win=0.25):
    n = int(SR * win)
    k = len(m) // n
    if k == 0:
        return np.array([db(np.sqrt(np.mean(m ** 2)))])
    seg = m[: k * n].reshape(k, n)
    return np.array([db(v) for v in np.sqrt(np.mean(seg ** 2, axis=1))])


SPARK = " .:-=+*#%@"


def spark(env, lo=-60, hi=-6):
    s = ""
    for v in env:
        i = int((min(max(v, lo), hi) - lo) / (hi - lo) * (len(SPARK) - 1))
        s += SPARK[i]
    return s


def centroid(m):
    if len(m) < 2048:
        return 0
    x = m[: SR * 20]
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float(np.sum(f * spec) / np.sum(spec))


def band_ratio(m):
    """fraction of energy below 300 Hz / 300-3k / above 3k"""
    x = m[: SR * 20]
    spec = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    tot = spec.sum() + 1e-12
    return (spec[f < 300].sum() / tot, spec[(f >= 300) & (f < 3000)].sum() / tot, spec[f >= 3000].sum() / tot)


def summary(path, win=0.25):
    a = load(path)
    m = a.mean(axis=1)
    env = envelope(m, win)
    lo, mid, hi = band_ratio(m)
    return dict(dur=len(m) / SR, peak=db(np.abs(a).max()), rms=db(np.sqrt(np.mean(m ** 2))),
                cent=centroid(m), lo=lo, mid=mid, hi=hi, spark=spark(env))


if __name__ == "__main__":
    win = float(os.environ.get("WIN", "0.25"))
    for p in sys.argv[1:]:
        try:
            s = summary(p, win)
        except Exception as e:
            print(p, "ERR", e); continue
        name = os.path.basename(p)
        meta = p.replace(".mp3", ".json")
        if os.path.exists(meta):
            name = name + " " + json.load(open(meta))["title"][:40]
        print(f"{name[:58]:58} {s['dur']:6.1f}s pk{s['peak']:6.1f} rms{s['rms']:6.1f} c{s['cent']:5.0f} L{s['lo']:.2f} M{s['mid']:.2f} H{s['hi']:.2f}")
        print("   |" + s["spark"][:200] + "|")
