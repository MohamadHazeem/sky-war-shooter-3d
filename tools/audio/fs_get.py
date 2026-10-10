#!/usr/bin/env python3
"""Fetch freesound sound page metadata + HQ preview. usage: fs_get.py outdir id [id...]
Writes <outdir>/fs_<id>.mp3 and appends metadata to <outdir>/meta.json"""
import sys, re, html, json, os, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    d = urllib.request.urlopen(req, timeout=180).read()
    return d if binary else d.decode("utf-8", "replace")


out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for sid in sys.argv[2:]:
    jp = os.path.join(out, f"fs_{sid}.json")
    if os.path.exists(jp):
        continue
    try:
        h = get(f"https://freesound.org/s/{sid}/")
    except Exception as e:
        print(sid, "ERR page", e); continue
    title = re.search(r'<meta property="og:title" content="([^"]*)"', h)
    title = html.unescape(title.group(1)) if title else "?"
    pageurl = re.search(r'<meta property="og:url" content="([^"]*)"', h)
    pageurl = pageurl.group(1) if pageurl else f"https://freesound.org/s/{sid}/"
    user = re.search(r'/people/([^/]+)/sounds/' + sid, h)
    user = html.unescape(user.group(1)) if user else "?"
    lic = re.findall(r'href="(https?://creativecommons.org/[^"]+)"', h)
    lic = lic[0] if lic else "?"
    mp3 = re.search(r'(https://cdn\.freesound\.org/previews/[^"]*?-hq\.mp3)', h)
    if not mp3:
        m = re.search(r'(https://cdn\.freesound\.org/previews/[^"]*?)-lq\.mp3', h)
        mp3 = m.group(1) + "-hq.mp3" if m else None
    else:
        mp3 = mp3.group(1)
    if not mp3:
        print(sid, "no preview"); continue
    if "nc" in lic.split("/licenses/")[-1].split("/")[0] or "sampling" in lic:
        print(sid, "SKIP licence", lic); continue
    try:
        data = get(mp3, True)
    except Exception as e:
        print(sid, "ERR dl", e); continue
    open(os.path.join(out, f"fs_{sid}.mp3"), "wb").write(data)
    json.dump(dict(id=sid, title=title, user=user, url=pageurl, license=lic, preview=mp3), open(jp, "w"))
    print(sid, user, "|", title, "|", lic, len(data))
