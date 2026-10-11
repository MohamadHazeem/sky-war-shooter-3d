#!/usr/bin/env python3
"""Write public/audio/manifest.json and CREDITS.md from build output (used.json) and source metadata.

Gains below are set from the loudness report (node tools/audio/loudness.mjs); per-file trims
(loudness.mjs --write) and the adaptive-score metadata (music_build.mjs -> music_meta.json)
are carried into the manifest. CREDITS.md is only rewritten when the Freesound metadata
(work/audio-src/fs/*.json, from fetch.sh) is present."""
import json, os, re, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("AUDIO_WORK", os.path.join(HERE, "work"))  # downloaded sources live in ROOT/audio-src
OUT = os.path.join(HERE, "..", "..", "public", "audio")
used = json.load(open(os.path.join(HERE, "sources_used.json")))
files = sorted(os.listdir(OUT))

LOOPS = {
    "b17_interior": ("loop_b17_interior.wav", 0.73, "4-engine radial bomber cabin drone (Wright Cyclone-class), ~2100-2300 rpm cruise; 0.7 Hz engine beat. Pitch +/-10% only."),
    "radial_exterior": ("loop_radial_exterior.wav", 0.8, "Fw 190 A-5 BMW 801 14-cyl radial at taxi, ~1000 rpm (firing ~117 Hz). playbackRate ~2.0-2.4 = cruise/combat power."),
    "merlin": ("loop_merlin.wav", 0.8, "Spitfire Rolls-Royce Merlin V-12 in flight at high power, ~2850-3000 rpm. playbackRate 0.85-1.1."),
    "wind": ("loop_wind.wav", 0.35, "Broadband airframe wind rush (no engine); scale gain/lowpass with airspeed."),
    "radio_static": ("loop_radio_static.wav", 0.12, "Intercom/radio hiss, band-limited 300-3800 Hz (not an engine)."),
}
SFX_GAIN = {
    "mg50_shot": 0.6, "mg50_burst_far": 0.45, "cannon_shot": 0.7, "impact_metal": 0.9, "impact_heavy": 0.8,
    "explosion_air": 1.25, "explosion_far": 0.6, "flak_burst": 1.0, "shrapnel_rattle": 0.45, "flyby": 0.8,
    "casing": 0.35, "glass_crack": 0.7, "rocket_launch": 0.7, "ui_click": 0.5, "radio_squelch_on": 0.35,
    "radio_squelch_off": 0.35, "hit_confirm": 0.5, "kill_confirm": 0.7,
}
MUSIC = {
    "menu": ("music_menu.mp3", 0.55, True), "combat": ("music_combat.m4a", 0.33, True),
    "tension": ("music_tension.mp3", 0.48, True), "victory": ("music_victory.mp3", 0.6, False),
    "defeat": ("music_defeat.mp3", 0.6, False), "climax": ("music_climax.m4a", 0.33, True),
}
MUSIC_SRC = {
    "music_menu.mp3": ("For the Fallen", "Full piece, trimmed, 3 s fade-out; loops by restarting."),
    "music_combat.m4a": ("Clenched Teeth", "56-bar section at 166 bpm (from 0:02.9, on a downbeat) baked into a bar-exact loop with a 1-bar crossfade (music_build.mjs)."),
    "music_tension.mp3": ("Constance", "44-bar section baked into a seamless loop with a 1-bar crossfade."),
    "music_victory.mp3": ("Long Road Ahead", "Triumphant final ~28 s (from 1:56), 1.5 s fade-in."),
    "music_defeat.mp3": ("Taps v2", "First ~28 s (two phrases) with 3 s fade-out."),
    "music_climax.m4a": ("Heroic Age", "16-bar section at 130 bpm (from 0:54.5, the finale) baked into a bar-exact loop with a 1-bar crossfade (music_build.mjs)."),
}
OLD = json.load(open(os.path.join(OUT, "manifest.json"))) if os.path.exists(os.path.join(OUT, "manifest.json")) else {}
MUSIC_META = json.load(open(os.path.join(HERE, "music_meta.json"))) if os.path.exists(os.path.join(HERE, "music_meta.json")) else {}
MODE_MUSIC_META = json.load(open(os.path.join(HERE, "mode_music_meta.json"))) if os.path.exists(os.path.join(HERE, "mode_music_meta.json")) else {}

manifest = {"loops": {}, "sfx": {}, "music": dict(MODE_MUSIC_META)}
for k, (f, g, hint) in LOOPS.items():
    assert f in files, f
    manifest["loops"][k] = {"file": f, "gain": g, "baseRpmHint": hint}
for k, g in SFX_GAIN.items():
    fl = [f for f in files if re.fullmatch(re.escape(k) + r"(_\d+)?\.mp3", f)]
    fl.sort(key=lambda s: int(re.findall(r"_(\d+)\.mp3$", s)[0]) if re.search(r"_\d+\.mp3$", s) else 0)
    assert fl, k
    manifest["sfx"][k] = {"files": fl, "gain": g}
    trim = OLD.get("sfx", {}).get(k, {}).get("trim")
    if trim and len(trim) == len(fl) and OLD["sfx"][k].get("files") == fl:
        manifest["sfx"][k]["trim"] = trim
manifest["sfx"]["flyby"]["peakAt"] = 2.5
for k, (f, g, loop) in MUSIC.items():
    assert f in files, f
    manifest["music"][k] = {"file": f, "gain": g, "loop": loop}
    meta = MUSIC_META.get(k)
    if meta and meta.get("file") == f:
        manifest["music"][k].update({x: meta[x] for x in ("bpm", "bars", "loopStart", "loopEnd", "beat0", "frames", "sampleRate", "root", "pitched", "roots")})
txt = json.dumps(manifest, indent=2)
txt = re.sub(r"\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]", lambda m: "[" + ", ".join(re.split(r",\s*", m.group(1))) + "]", txt)
open(os.path.join(OUT, "manifest.json"), "w").write(txt + "\n")


def lic(url):
    if "publicdomain/zero" in url:
        return "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"
    m = re.search(r"licenses/(by(?:-sa)?)/(\d\.\d)", url)
    return f"CC {m.group(1).upper()} {m.group(2)}", f"https://creativecommons.org/licenses/{m.group(1)}/{m.group(2)}/"


meta = {}
for p in glob.glob(os.path.join(ROOT, "audio-src/fs/fs_*.json")):
    m = json.load(open(p)); meta[int(m["id"])] = m
if not meta:
    print("manifest.json written; no Freesound metadata in work/ (run fetch.sh): CREDITS.md left as it is")
    raise SystemExit(0)

by_src = {}
for f, ids in used.items():
    for i in ids:
        by_src.setdefault(int(i), []).append(f)

lines = ["# Audio credits", "",
         "All audio in this folder comes from third-party recordings that are free to reuse under the licences listed below.",
         "Files were trimmed, faded, filtered, mixed and/or looped, and loudness-normalised for this game (these are modifications of the originals).",
         "CC0 sounds need no attribution and are listed for provenance. CC BY sounds **must** be credited in the game's credits screen or documentation, as below.",
         "", "## Music", "",
         "Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, faded, looped). In the game, synthesized drums, brass and strings are layered over the combat and climax loops (adaptive score).", "",
         "| File | Track | Source | Licence | Edit |", "|---|---|---|---|---|"]
for f, (t, note) in MUSIC_SRC.items():
    lines.append(f"| `{f}` | \"{t}\" by Kevin MacLeod | https://incompetech.com/music/royalty-free/mp3-royaltyfree/{t.replace(' ', '%20')}.mp3 | CC BY 4.0 | {note} |")

lines += ["", "## Sound effects and loops (Freesound.org)", "",
          "| Source sound | Author | Licence | Used in |", "|---|---|---|---|"]
for i in sorted(by_src, key=lambda x: (lic(meta[x]["license"])[0] == "CC0 1.0", meta[x]["user"].lower(), x)):
    m = meta[i]
    title = re.sub(r" by [^ ]+$", "", m["title"])
    ln, lu = lic(m["license"])
    lines.append(f"| [\"{title}\"]({m['url']}) (#{i}) | {m['user']} | [{ln}]({lu}) | {', '.join('`'+x+'`' for x in sorted(by_src[i]))} |")

lines += ["", "## Attribution text for the in-game credits (CC BY items)", ""]
for i in sorted(by_src, key=lambda x: (meta[x]["user"].lower(), x)):
    m = meta[i]
    ln, lu = lic(m["license"])
    if ln.startswith("CC BY"):
        title = re.sub(r" by [^ ]+$", "", m["title"])
        lines.append(f"- \"{title}\" by {m['user']} ({m['url']}), licensed {ln}. Modified.")
for f, (t, _) in MUSIC_SRC.items():
    lines.append(f"- \"{t}\" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/. Modified.")
lines.append("")
lines += ["", "## Original mode scores", "", "`music_night/field/train/boss/crew/crewLoss/breakup.m4a` are original procedural compositions, generated by `tools/audio/mode_music_build.mjs`, licensed GPL-2.0-or-later with this game. No sampled or borrowed music."]
open(os.path.join(OUT, "CREDITS.md"), "w").write("\n".join(lines))
print(json.dumps(manifest, indent=1)[:3000])
