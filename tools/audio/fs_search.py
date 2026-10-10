#!/usr/bin/env python3
"""Search freesound (public HTML) and list CC0/CC-BY results.
usage: fs_search.py "query" [pages] [maxdur]
"""
import sys, re, html, urllib.request, urllib.parse, json, os

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
OK = ("Creative Commons 0", "Attribution")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def search(q, pages=1, maxdur=1e9, f=None):
    out = []
    for p in range(1, pages + 1):
        url = "https://freesound.org/search/?" + urllib.parse.urlencode(dict({"q": q, "page": p}, **({"f": f} if f else {})))
        try:
            h = get(url)
        except Exception as e:
            print("ERR", e, file=sys.stderr)
            break
        blocks = h.split('class="bw-search__result"')[1:]
        for b in blocks:
            def a(name):
                m = re.search(name + r'="([^"]*)"', b)
                return html.unescape(m.group(1)) if m else ""
            lic = re.search(r'title="License: ([^"]*)"', b)
            lic = lic.group(1) if lic else "?"
            desc = re.search(r'<p class="text-grey[^>]*>(.*?)</p>', b, re.S)
            item = dict(id=a("data-sound-id"), user=a("data-username"), title=a("data-title"),
                        dur=float(a("data-duration") or 0), sr=a("data-samplerate"), lic=lic,
                        dl=a("data-num-downloads"), mp3=a("data-mp3").replace("-lq.mp3", "-hq.mp3"))
            out.append(item)
    return [o for o in out if o["lic"] in OK and o["dur"] <= maxdur]


if __name__ == "__main__":
    q = sys.argv[1]
    pages = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    maxdur = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
    f = sys.argv[4] if len(sys.argv) > 4 else None
    for o in search(q, pages, maxdur, f):
        print(f'{o["id"]:>7} {o["dur"]:7.2f}s {o["lic"][:5]:5} dl={o["dl"]:>6} {o["user"][:18]:18} | {o["title"][:70]}')
