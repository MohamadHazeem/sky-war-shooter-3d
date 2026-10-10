#!/usr/bin/env python3
"""Build public/audio from downloaded sources. Run: venv/bin/python scripts/build.py [only_prefix]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from aud import load, SR, db
from proc import write, norm_peak, fade, trim_start, trim_end, oneshot, make_loop, loop_check

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("AUDIO_WORK", os.path.join(HERE, "work"))  # downloaded sources live in ROOT/audio-src
FS = os.path.join(ROOT, "audio-src/fs")
MU = os.path.join(ROOT, "audio-src/music")
OUT = os.path.join(HERE, "..", "..", "public", "audio")
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(ROOT, "test"), exist_ok=True)
ONLY = sys.argv[1] if len(sys.argv) > 1 else ""
used = {}  # out file -> list of source ids
PENDING = {}  # out file -> array, written by finalize() after per-group loudness balancing


def fs(i):
    return os.path.join(FS, f"fs_{i}.mp3")


def o(name):
    return os.path.join(OUT, name)


def rec(name, *ids):
    used[name] = list(ids)


def want(name):
    return name.startswith(ONLY)


def report(name, a=None):
    p = o(name)
    a = load(p, 2) if a is None else a
    m = a.mean(axis=1)
    print(f"  {name:28} {len(a)/SR:6.3f}s pk{db(np.abs(a).max()):6.1f} rms{db(np.sqrt(np.mean(m**2))):6.1f} first>-20dB@{np.argmax(np.abs(m) > np.abs(m).max()*0.1)/SR*1000:5.1f}ms  {os.path.getsize(p)//1024}KB")


def shot(name, src, ss, dur, fout, ch=1, af="highpass=f=35", **kw):
    if not want(name):
        rec(name, src); return
    PENDING[name] = oneshot(fs(src), ss, dur, None, fout_ms=fout, af=af, ch=ch, **kw)[1]
    rec(name, src)


def mix_shot(name, parts, fout, ch=1, total=None, target=-1.0):
    """parts: list of (src, ss, dur, gain_db, delay_s, af)"""
    if not want(name):
        rec(name, *[p[0] for p in parts]); return
    layers = []
    for src, ss, dur, g, delay, af in parts:
        a = load(fs(src), ch, ss, dur, af)
        a = trim_start(a, -36)
        a = norm_peak(a, 0.0) * 10 ** (g / 20)
        pad = np.zeros((int(delay * SR), ch), np.float32)
        layers.append(np.concatenate([pad, a]))
    n = max(len(l) for l in layers) if total is None else int(total * SR)
    mix = np.zeros((n, ch), np.float32)
    for l in layers:
        l = l[:n]; mix[:len(l)] += l
    mix = trim_end(mix, -50)
    mix = fade(mix, 1.0, fout)
    mix = norm_peak(mix, target)
    PENDING[name] = mix
    rec(name, *[p[0] for p in parts])


# ------------------------------------------------------------------ LOOPS
def loops():
    # 1. B-17 interior: 4-engine prop steady interior (craigsmith CC0) + low beating weight from twin-prop (Mozfoo CC0)
    if want("loop_b17"):
        L, XF = 8.0, 1.0
        a = load(fs(437863), 2, 14.0, L + XF, "highpass=f=28,lowshelf=f=150:g=3")
        b = load(fs(440164), 2, 55.0, L + XF, "highpass=f=28,lowpass=f=320,lowpass=f=320")
        ra, rb = np.sqrt(np.mean(a ** 2)), np.sqrt(np.mean(b ** 2))
        mixd = a + b * (ra / rb) * 10 ** (-6 / 20)
        tmp = os.path.join(ROOT, "test/_b17mix.wav")
        write(mixd, tmp)
        make_loop(tmp, 0, L, XF, o("loop_b17_interior.wav"), target_rms=-16.0)
        print("  loop_b17_interior", loop_check(o("loop_b17_interior.wav")))
    rec("loop_b17_interior.wav", 437863, 440164)

    # 2. Radial exterior: authentic BMW 801 radial of a Fw 190 A-5 (Fight2FlyPhoto CC-BY 3.0)
    if want("loop_radial"):
        make_loop(fs(143556), 7.5, 6.0, 0.8, o("loop_radial_exterior.wav"), af="highpass=f=35", ch=1, target_rms=-16.0)
        print("  loop_radial_exterior", loop_check(o("loop_radial_exterior.wav")))
    rec("loop_radial_exterior.wav", 143556)

    # 3. Merlin: Spitfire (Rolls-Royce Merlin) at power, steady section (mattew CC-BY 4.0)
    if want("loop_merlin"):
        make_loop(fs(42968), 4.0, 6.0, 0.8, o("loop_merlin.wav"), af="highpass=f=30", ch=2, target_rms=-16.0)
        print("  loop_merlin", loop_check(o("loop_merlin.wav")))
    rec("loop_merlin.wav", 42968)

    # 4. Wind: continuous high wind (zimbot CC-BY 4.0) + airy winter wind layer (craigsmith CC0)
    if want("loop_wind"):
        L, XF = 6.0, 1.0
        a = load(fs(350678), 2, 9.0, L + XF, "highpass=f=30")
        b = load(fs(481148), 2, 28.5, L + XF, "highpass=f=400")
        ra, rb = np.sqrt(np.mean(a ** 2)), np.sqrt(np.mean(b ** 2))
        tmp = os.path.join(ROOT, "test/_windmix.wav")
        write(a + b * (ra / rb) * 10 ** (-5 / 20), tmp)
        make_loop(tmp, 0, L, XF, o("loop_wind.wav"), target_rms=-18.0)
        print("  loop_wind", loop_check(o("loop_wind.wav")))
    rec("loop_wind.wav", 350678, 481148)

    # 5. Radio static bed (clesquir CC0), band-limited like an aircraft intercom
    if want("loop_radio"):
        make_loop(fs(110739), 74.0, 5.0, 0.5, o("loop_radio_static.wav"), af="highpass=f=300,lowpass=f=3800",
                  ch=1, target_rms=-20.0)
        print("  loop_radio_static", loop_check(o("loop_radio_static.wav")))
    rec("loop_radio_static.wav", 110739)


# ------------------------------------------------------------------ ONE-SHOTS
def oneshots():
    # mg50_shot: real .50 BMG reports (single shots / burst-final rounds), <=0.33 s with exponential tail
    shot("mg50_shot_1.mp3", 865990, 0.0, 0.32, 260, shape="exp")
    shot("mg50_shot_2.mp3", 855595, 0.0, 0.32, 260, shape="exp")
    shot("mg50_shot_3.mp3", 668071, 0.0, 0.30, 240, shape="exp", thresh=-20)
    shot("mg50_shot_4.mp3", 239138, 3.275, 0.33, 260, shape="exp", thresh=-14)
    # distant bursts: WWII Maxim at ~200 m (poissonmort CC-BY 3.0/4.0), Bren distant (craigsmith CC0), distant MG (qubodup CC0)
    shot("mg50_burst_far_1.mp3", 160771, 15.10, 1.9, 500, ch=1, af="highpass=f=60")
    shot("mg50_burst_far_2.mp3", 160771, 20.30, 1.9, 500, ch=1, af="highpass=f=60")
    shot("mg50_burst_far_3.mp3", 675591, 11.80, 3.0, 700, ch=1, af="highpass=f=60")
    shot("mg50_burst_far_4.mp3", 854635, 0.0, 1.2, 300, ch=1, af="highpass=f=60")
    # cannon: 25 mm chain-gun three-round burst cut into single rounds (qubodup CC0)
    shot("cannon_shot_1.mp3", 854186, 0.0, 0.27, 120, shape="exp", thresh=-24)
    shot("cannon_shot_2.mp3", 854186, 0.262, 0.28, 120, shape="exp", thresh=-24)
    shot("cannon_shot_3.mp3", 854186, 0.540, 0.55, 380, shape="exp", thresh=-24)
    # impact_metal: bullets on sheet metal / ricochets
    shot("impact_metal_1.mp3", 182263, 0.0, 1.1, 500)
    shot("impact_metal_2.mp3", 182263, 2.17, 1.2, 500)
    shot("impact_metal_3.mp3", 267893, 0.22, 0.6, 250)
    shot("impact_metal_4.mp3", 351371, 0.0, 0.35, 150)
    shot("impact_metal_5.mp3", 399550, 0.08, 0.6, 300, thresh=-22)
    shot("impact_metal_6.mp3", 30932, 0.0, 0.5, 300)
    # impact_heavy: big metal bangs (harrisonlace CC0)
    shot("impact_heavy_1.mp3", 798843, 23.35, 1.0, 600, ch=2)
    shot("impact_heavy_2.mp3", 798843, 17.62, 1.0, 600, ch=2)
    shot("impact_heavy_3.mp3", 798843, 7.90, 1.0, 600, ch=2)
    mix_shot("impact_heavy_4.mp3", [(798843, 1.41, 1.0, 0, 0, None), (108641, 0.10, 1.2, -6, 0.0, "lowpass=f=1500")], 600, ch=2)
    # explosions
    shot("explosion_air_1.mp3", 108641, 0.0, 3.2, 1200, ch=2, af="highpass=f=25")
    shot("explosion_air_2.mp3", 182432, 0.35, 2.6, 900, ch=2, af="highpass=f=25", thresh=-26)
    shot("explosion_air_3.mp3", 587180, 0.0, 1.8, 700, ch=2, af="highpass=f=25")
    mix_shot("explosion_air_4.mp3", [(108641, 0.10, 3.0, 0, 0, "highpass=f=25"), (483289, 0.15, 3.0, -4, 0.05, "highpass=f=80")], 1200, ch=2)
    shot("explosion_far_1.mp3", 108640, 0.10, 3.4, 1500, ch=2, af="highpass=f=20", thresh=-26)
    shot("explosion_far_2.mp3", 121371, 0.0, 4.0, 1800, ch=2, af="highpass=f=20")
    # flak bursts: sharp crack + boom
    shot("flak_burst_1.mp3", 702245, 0.0, 1.6, 900, ch=2, af="highpass=f=30")
    shot("flak_burst_2.mp3", 621003, 0.0, 1.9, 900, ch=2, af="highpass=f=30")
    mix_shot("flak_burst_3.mp3", [(702245, 0.0, 0.5, 0, 0, "highpass=f=200"), (108640, 0.15, 2.4, -2, 0.0, "highpass=f=25")], 1100, ch=2)
    mix_shot("flak_burst_4.mp3", [(621003, 0.0, 0.4, -2, 0, "highpass=f=300"), (121371, 0.0, 2.5, 0, 0.0, "highpass=f=25")], 1100, ch=2)
    # shrapnel / debris on metal
    shot("shrapnel_rattle_1.mp3", 121634, 0.08, 2.4, 700, ch=2, af="highpass=f=150")
    shot("shrapnel_rattle_2.mp3", 275727, 1.48, 1.3, 500, ch=2, af="highpass=f=150")
    shot("shrapnel_rattle_3.mp3", 461779, 1.38, 2.2, 700, ch=2, af="highpass=f=150")
    shot("shrapnel_rattle_4.mp3", 675465, 0.0, 2.6, 700, ch=2, af="highpass=f=150")
    # flybys (real warbirds, Fight2FlyPhoto CC-BY 3.0 + craigsmith CC0)
    shot("flyby_1.mp3", 143558, 3.6, 6.0, 1500, ch=2, af="highpass=f=30", thresh=-60, fin_ms=600)
    shot("flyby_2.mp3", 143560, 5.1, 6.0, 1500, ch=2, af="highpass=f=30", thresh=-60, fin_ms=600)
    shot("flyby_3.mp3", 143562, 0.0, 6.0, 1500, ch=2, af="highpass=f=30", thresh=-60, fin_ms=200)
    shot("flyby_4.mp3", 142901, 16.4, 6.0, 1500, ch=2, af="highpass=f=30", thresh=-60, fin_ms=600)
    # casings
    shot("casing_1.mp3", 318964, 16.80, 0.95, 300, af="highpass=f=300")
    shot("casing_2.mp3", 318964, 19.00, 0.70, 250, af="highpass=f=300")
    shot("casing_3.mp3", 318964, 13.05, 0.85, 250, af="highpass=f=300")
    shot("casing_4.mp3", 171322, 0.94, 0.5, 200, af="highpass=f=300")
    # glass / perspex
    shot("glass_crack_1.mp3", 221528, 0.30, 1.2, 500, ch=2)
    shot("glass_crack_2.mp3", 758207, 0.0, 1.6, 600, ch=2)
    shot("glass_crack_3.mp3", 418194, 0.0, 0.6, 250, ch=2)
    shot("glass_crack_4.mp3", 336425, 0.0, 2.2, 700, ch=2)
    # rocket launch
    shot("rocket_launch_1.mp3", 521377, 0.0, 1.35, 500, ch=2)
    shot("rocket_launch_2.mp3", 857959, 0.0, 2.7, 900, ch=2)
    shot("rocket_launch_3.mp3", 479517, 0.0, 2.8, 1200, ch=2, thresh=-40, fin_ms=60)
    # UI / radio
    shot("ui_click.mp3", 423957, 0.0, 0.3, 80, af=None)
    shot("radio_squelch_on.mp3", 522164, 0.0, 0.12, 30, af="highpass=f=250,lowpass=f=4000")
    shot("radio_squelch_off.mp3", 760245, 0.0, 0.45, 80, af="highpass=f=250,lowpass=f=4000")
    # hit_confirm: metallic ping + short low thunk ; kill_confirm: heavy metal bang + boom
    mix_shot("hit_confirm.mp3", [(217461, 0.0, 0.35, 0, 0, "highpass=f=300"), (798843, 23.35, 0.12, -9, 0.0, "lowpass=f=900")], 120)
    mix_shot("kill_confirm.mp3", [(798843, 15.42, 0.6, 0, 0, None), (587180, 0.0, 0.7, -5, 0.0, "lowpass=f=2500")], 300, ch=2)


def short_loudness(a, win=0.05):
    m = a.mean(axis=1); n = int(SR * win)
    if len(m) <= n:
        return db(np.sqrt(np.mean(m ** 2)))
    c = np.convolve(m ** 2, np.ones(n) / n, "valid")
    return db(np.sqrt(c.max()))


def finalize():
    import re
    groups = {}
    for name in PENDING:
        groups.setdefault(re.sub(r"_\d+\.mp3$", "", name), []).append(name)
    for g, names in sorted(groups.items()):
        L = {n: short_loudness(PENDING[n]) for n in names}
        target = float(np.median(list(L.values())))
        for n in sorted(names):
            a = PENDING[n]
            pk = db(np.abs(a).max())
            gain = min(target - L[n], -1.0 - pk) if len(names) > 1 else 0.0
            write(a * 10 ** (gain / 20), o(n))
            report(n)


# ------------------------------------------------------------------ MUSIC
def music_file(src, out, ss=None, dur=None, fin=0.05, fout=2.0, loop_xf=None, rate="160k"):
    a = load(os.path.join(MU, src), 2, ss, dur)
    if loop_xf:
        n = len(a) - int(loop_xf * SR)
        body = a[:n].copy(); tail = a[n:]
        x = len(tail); t = np.linspace(0, np.pi / 2, x)[:, None]
        body[:x] = body[:x] * np.sin(t) + tail * np.cos(t)
        a = body
    else:
        a = trim_start(a, -50, 0)
        a = trim_end(a, -55, 50)
        a = fade(a, fin * 1000, fout * 1000)
    a = norm_peak(a, -1.0)
    os.environ["MP3RATE"] = rate
    write(a, o(out))
    del os.environ["MP3RATE"]
    report(out)


def music():
    if want("music"):
        # menu: For the Fallen (solemn symphonic, marching drums) - whole piece, natural restart
        music_file("For the Fallen.mp3", "music_menu.mp3", fout=3.0)
        # combat (Clenched Teeth, really 166 bpm) and climax (Heroic Age) are bar-exact loops
        # built by music_build.mjs (node), which also writes their beat-grid metadata
        # tension: Constance (83 bpm) - baked loop of 44 bars from 0.3 s with 1-bar crossfade
        bar = 4 * 60 / 83.0
        music_file("Constance.mp3", "music_tension.mp3", ss=0.3, dur=44 * bar + bar, loop_xf=bar)
        # victory: triumphant final section of Long Road Ahead (last ~28 s)
        music_file("Long Road Ahead.mp3", "music_victory.mp3", ss=116.0, dur=30.0, fin=1.5, fout=2.5)
        # defeat: Taps (solo trumpet), first two phrases
        music_file("Taps v2.mp3", "music_defeat.mp3", ss=0.0, dur=28.5, fin=0.02, fout=3.0)


if __name__ == "__main__":
    print("LOOPS"); loops()
    print("ONESHOTS"); oneshots(); finalize()
    print("MUSIC"); music()
    json.dump(used, open(os.path.join(HERE, "sources_used.json"), "w"), indent=1)
