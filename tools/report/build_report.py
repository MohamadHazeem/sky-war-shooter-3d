#!/usr/bin/env python3
"""Builds the overnight morning report (docs/overnight/report.html) from the phase trackers
(docs/PHASE4.md, docs/PHASE5.md), the screenshots in docs/overnight/ and a few hand-written
notes below. Images are referenced relatively, so the page works opened from the repo and when
published with its images alongside.

    python3 tools/report/build_report.py --tests 343
"""
import argparse, html, os, re, subprocess, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'overnight', 'report.html')

LIVE = 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev'
REPO = 'https://github.com/MohamadHazeem/sky-war-shooter-3d'

# What to try first in the morning (title, how)
PLAY_FIRST = [
    ('Campaign map', 'Campaign → the strategic map. Fly a story mission, then a side raid, and watch the gauges change.'),
    ('Take-off and landing', 'Start Mission 1 from its briefing: dawn take-off at Deenethorpe, then a landing (a belly landing if the Sky Queen is badly hurt).'),
    ('Boss battle group', 'Mission 5 (and the m12 finale): several giant warships with weak points, salvos and enrage.'),
    ('Living B-17', 'Hold C at a waist gun to look around: the other gunner, the radio room, the tunnel to the tail.'),
    ('Train Busting', 'Survival → Special operations → Train Busting: low-level P-51 strafing over the countryside.'),
    ('Night Fighter', 'Survival → Night Fighter: searchlights, exhaust flames, Blue Two on your wing (keys 1–4).'),
    ('Luftwaffe Experten', 'Career → Experten: the named aces who come back with grudges.'),
    ('Crew room', 'After each story mission the crew talks it over in Hut 14 (voiced, reacting to what happened).'),
    ('Arabic', 'Settings → Language → العربية: the whole game in Arabic, right to left.'),
]

# Things the player should know or decide (short, honest)
NOTES = [
    'Boss fights were rebalanced with a human-like autoplay bot (35–45 % accuracy): about 5 min for the m5 battle group and 5–7 min for the m12 finale, with every mechanic kept. The m12 finale still fails roughly 2 in 5 human-level runs (the B-17 shot apart or crew wounds). That is "very hard"; the knobs are in docs/BALANCE.md if you want it easier.',
    'Night Fighter is still on the easy side, and P-51 campaign missions give fewer kills than gunner ones (target switching in big furballs). Both are listed in docs/BALANCE.md.',
    'Performance on this Mac (heavy combat, 34 aircraft, 2.3 MP): about 4.4 ms on Low, 5.5 ms on Medium, 7.5–9 ms on High and 10.4 ms on Ultra per frame, with no steady-state stutters. A first-launch benchmark now picks the preset; its thresholds have not been tried on a weak laptop yet.',
    'First-kill shader stutters are fixed (the warm-up was discarding its compiled shaders); one shadow variant for an exploding Fw 190 still compiles once per session.',
    'The Me 410 uses the Bf 110 airframe with its own guns: no open-licence Me 410 model exists. He 219 and Ta 152 are not available either.',
    'Co-op is a beta: peer-to-peer with no relay server, so some strict networks cannot connect; the guest\'s score stays local.',
    'Phone portrait shows "rotate your phone" by design; landscape phones and tablets are supported.',
]

def status_kind(s: str) -> str:
    s = s.strip().lower()
    if s.startswith('done (beta)'): return 'beta'
    if s.startswith('done'): return 'done'
    if s.startswith('partly'): return 'part'
    if s.startswith('in progress'): return 'wip'
    return 'todo' if not s else 'part'

def parse_tracker(path):
    rows, section = [], ''
    for line in open(path, encoding='utf-8'):
        if line.startswith('## '):
            section = line[3:].strip()
        m = re.match(r'^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|?\s*$', line)
        if m:
            num, goal, a, b = m.groups()
            status = b if b else a           # "| n | goal || status |" rows have an empty middle cell
            rows.append({'n': int(num), 'goal': goal, 'status': status, 'kind': status_kind(status), 'section': section})
    return rows

def log_lines(path):
    out, on = [], False
    for line in open(path, encoding='utf-8'):
        if line.startswith('## Log'): on = True; continue
        if on and line.startswith('- '): out.append(line[2:].strip())
    return out

def git(*args):
    try: return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
    except Exception: return ''

def md_inline(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    return s

GALLERY = [
    ('boss-battle-group.jpg', 'Boss battle group: giant warships, escorts and the formation (m12)'),
    ('takeoff-runway.jpg', 'Dawn take-off at Deenethorpe'),
    ('takeoff-climb.jpg', 'Climbing out above the overcast to join the formation'),
    ('belly-landing.jpg', 'A badly damaged Sky Queen comes home on her belly'),
    ('crew-room.jpg', 'Crew-room interlude after Black Thursday: Hut 14, an emptied bunk across the aisle'),
    ('campaign-map.jpg', 'Strategic campaign map with side raids and gauges'),
    ('combat-right-waist.jpg', 'Right waist gun in combat'),
    ('interior-other-gunner.jpg', 'Free look: the other waist gunner at his M2'),
    ('interior-tunnel.jpg', 'Looking aft down the tunnel to the tail gunner'),
    ('train-busting.jpg', 'Train Busting: low-level P-51 over the countryside'),
    ('front-m9-wall-near.jpg', 'Weather front: a storm wall looms over the P-51 before the storm arrives (m9)'),
    ('night-flares-cloud.jpg', 'Night Fighter: pathfinder flares lighting the cloud tops'),
    ('night-flak-cloud-glow.jpg', 'Night: flak bursts glowing inside the cloud'),
    ('surface-wing.jpg', 'Surface detail: panel lines, rivets, chipping, exhaust streaks'),
    ('surface-fw190close.jpg', 'Fw 190 close pass with panel detail'),
    ('glass-p51-storm.jpg', 'Rain streaking across the P-51 canopy in a storm'),
    ('glass-top-turret-frost.jpg', 'Frost and a bullet crack on the top-turret dome'),
    ('clouds-cloudsea.jpg', 'Cloud shadows on the cloud sea'),
    ('distant.jpg', 'Living sky: a distant bomber box under flak'),
    ('dusk.jpg', 'Dusk with the warm rim light'),
    ('skill-tree.jpg', 'Skill tree (blueprint style)'),
    ('weekly.jpg', 'Weekly challenge with its own leaderboard'),
    ('title-menu.jpg', 'Grouped title menu'),
]

CSS = r"""
:root{
  /* flight-log paper by day, blacked-out ops room by night */
  --bg:#ece6d6; --paper:#f6f1e3; --ink:#1f2116; --dim:#5f604f; --line:#cfc6ad;
  --olive:#4b5320; --khaki:#a08a52; --red:#9b2d20; --ok:#3f6b2a; --wip:#a06d12; --part:#7a6a3a;
  --display:'Oswald','Arial Narrow',sans-serif; --type:'Special Elite','Courier New',monospace;
  --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#12140e; --paper:#1a1d14; --ink:#e9e3cf; --dim:#a29c84; --line:#34382a;
  --olive:#9aa860; --khaki:#c9b27a; --red:#e07a62; --ok:#8fc06e; --wip:#e2b04a; --part:#c2b07a; color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#12140e; --paper:#1a1d14; --ink:#e9e3cf; --dim:#a29c84; --line:#34382a;
  --olive:#9aa860; --khaki:#c9b27a; --red:#e07a62; --ok:#8fc06e; --wip:#e2b04a; --part:#c2b07a; color-scheme:dark }
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.55 var(--body);margin:0}
.wrap{max-width:1120px;margin:0 auto;padding-inline:16px;padding-block:28px 64px}
header{display:grid;gap:10px;border-bottom:3px double var(--line);padding-bottom:22px}
.stamp{font:12px var(--type);letter-spacing:3px;color:var(--red);text-transform:uppercase}
h1{font:600 clamp(30px,5vw,52px)/1.02 var(--display);letter-spacing:1px;margin:0;text-transform:uppercase;text-wrap:balance}
h1 span{color:var(--khaki)}
.sub{color:var(--dim);max-width:70ch;margin:0}
.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.links a{font:600 13px var(--display);letter-spacing:1.5px;text-transform:uppercase;color:var(--ink);text-decoration:none;border:1.5px solid var(--ink);padding:8px 14px}
.links a:hover,.links a:focus-visible{background:var(--ink);color:var(--paper);outline:none}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:26px 0}
.stat{background:var(--paper);padding:14px 16px}
.stat b{display:block;font:600 30px/1 var(--display);font-variant-numeric:tabular-nums}
.stat small{font:11px var(--type);letter-spacing:1.5px;color:var(--dim);text-transform:uppercase}
h2{font:600 22px var(--display);letter-spacing:1.5px;text-transform:uppercase;margin:40px 0 4px}
h2 + p{color:var(--dim);margin:0 0 16px;max-width:75ch}
.first{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;padding:0;list-style:none;margin:0}
.first li{background:var(--paper);border:1px solid var(--line);padding:12px 14px;min-width:0}
.first b{font:600 15px var(--display);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:2px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
figure{margin:0;background:var(--paper);border:1px solid var(--line);padding:8px 8px 10px}
figure img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--line)}
figcaption{font-size:13px;color:var(--dim);margin-top:7px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);background:var(--paper)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--line)}
th{font:11px var(--type);letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);background:var(--bg)}
td.n{font:600 14px var(--display);color:var(--dim);width:42px}
td.goal{font-weight:600;width:34%;min-width:200px}
td.st{min-width:280px;color:var(--dim)}
.pill{display:inline-block;font:600 10.5px var(--display);letter-spacing:1.5px;text-transform:uppercase;padding:2px 7px;margin-right:6px;border:1.5px solid currentColor;vertical-align:1px}
.k-done{color:var(--ok)} .k-beta{color:var(--ok)} .k-wip{color:var(--wip)} .k-part{color:var(--part)} .k-todo{color:var(--red)}
.sect td{background:var(--bg);font:600 12px var(--display);letter-spacing:1.5px;text-transform:uppercase;color:var(--olive)}
details{margin-top:12px}
summary{cursor:pointer;font:600 14px var(--display);letter-spacing:1px;text-transform:uppercase}
.notes{padding-left:18px;margin:0;display:grid;gap:8px;max-width:85ch}
.log{font:12.5px/1.6 var(--mono);color:var(--dim);padding-left:18px;max-width:100ch}
code{font:12.5px var(--mono)}
footer{margin-top:48px;border-top:1px solid var(--line);padding-top:14px;color:var(--dim);font-size:13px}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
"""

def table(rows, sections=True):
    out, last = [], None
    for r in rows:
        if sections and r['section'] != last:
            last = r['section']
            out.append(f'<tr class="sect"><td colspan="3">{html.escape(last)}</td></tr>')
        label = {'done': 'Done', 'beta': 'Beta', 'wip': 'In progress', 'part': 'Partly', 'todo': 'Open'}[r['kind']]
        detail = re.sub(r'^(Done \(beta\)|Done|Partly|In progress)\s*[—-]?\s*', '', r['status']).strip()
        out.append(f'<tr><td class="n">{r["n"]}</td><td class="goal">{md_inline(r["goal"])}</td>'
                   f'<td class="st"><span class="pill k-{r["kind"]}">{label}</span>{md_inline(detail)}</td></tr>')
    return '<div class="tablewrap"><table><thead><tr><th>#</th><th>Goal</th><th>Result</th></tr></thead><tbody>' + ''.join(out) + '</tbody></table></div>'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tests', type=int, default=0)
    ap.add_argument('--grade', default='')
    a = ap.parse_args()
    p4 = parse_tracker(os.path.join(ROOT, 'docs', 'PHASE4.md'))
    p5 = parse_tracker(os.path.join(ROOT, 'docs', 'PHASE5.md'))
    done4 = sum(r['kind'] in ('done', 'beta') for r in p4)
    done5 = sum(r['kind'] in ('done', 'beta') for r in p5)
    log4, log5 = log_lines(os.path.join(ROOT, 'docs', 'PHASE4.md')), log_lines(os.path.join(ROOT, 'docs', 'PHASE5.md'))
    deploys = max([int(x) for x in re.findall(r'deploy #(\d+)', ' '.join(log4 + log5))] or [0])
    commits = git('rev-list', '--count', '--since=2026-10-10 21:30', 'HEAD') or '?'
    imgs = [(f, c) for f, c in GALLERY if os.path.exists(os.path.join(ROOT, 'docs', 'overnight', f))]
    stats = [(f'{done4}/{len(p4)}', 'Phase 4 goals done'), (f'{done5}/{len(p5)}', 'Phase 5 goals done'),
             (str(deploys), 'deploys to the live site'), (str(commits), 'commits overnight')]
    if a.tests: stats.append((str(a.tests), 'automated tests passing'))
    if a.grade: stats.append((a.grade, 'self-assessed grade'))
    page = f"""<meta charset="utf-8"><title>Sky War Overnight Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Special+Elite&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<style>{CSS}</style>
<div class="wrap">
<header>
  <div class="stamp">Overnight · 10–11 October 2026 · 21:37 → 08:00</div>
  <h1>Sky War Shooter 3D <span>· Overnight report</span></h1>
  <p class="sub">Phase 4 ("Overnight v1.0", 42 goals) ran end to end, then Phase 5 ("Next level: graphics &amp; gameplay") was created and worked until morning. Every merge passed type-checks, the build and the unit tests; campaign regressions ran in autoplay before each deploy.</p>
  <div class="links"><a href="{LIVE}">Play the live build</a><a href="{REPO}">GitHub repository</a></div>
</header>
<div class="stats">{''.join(f'<div class="stat"><b>{html.escape(v)}</b><small>{html.escape(k)}</small></div>' for v, k in stats)}</div>

<h2>Try these first</h2>
<p>The biggest new things, and where to find them.</p>
<ul class="first">{''.join(f'<li><b>{html.escape(t)}</b>{html.escape(d)}</li>' for t, d in PLAY_FIRST)}</ul>

<h2>Screenshots</h2>
<p>Captured from the game during the night (some at small size from the testing browser).</p>
<div class="gallery">{''.join(f'<figure><img src="{f}" alt="{html.escape(c)}" loading="lazy"><figcaption>{html.escape(c)}</figcaption></figure>' for f, c in imgs)}</div>

<h2>Worth knowing</h2>
<p>Open points and decisions for you.</p>
<ul class="notes">{''.join(f'<li>{md_inline(n)}</li>' for n in NOTES)}</ul>

<h2>Phase 5 · Next level: graphics &amp; gameplay</h2>
<p>Created overnight once Phase 4 was nearly done; goals 17–26 were added during the night.</p>
{table(p5)}

<h2>Phase 4 · Overnight v1.0</h2>
<p>The 42 goals agreed before the night, in tiers A → G → B → C.</p>
{table(p4)}

<details><summary>Timeline (from the trackers)</summary>
<ul class="log">{''.join(f'<li>{md_inline(l)}</li>' for l in log4 + log5)}</ul></details>

<footer>Generated from <code>docs/PHASE4.md</code> and <code>docs/PHASE5.md</code> by <code>tools/report/build_report.py</code> · {html.escape(git('log', '-1', '--format=%h %cd', '--date=format:%Y-%m-%d %H:%M'))}</footer>
</div>
"""
    open(OUT, 'w', encoding='utf-8').write(page)
    print(OUT, f'{len(imgs)} images, P4 {done4}/{len(p4)}, P5 {done5}/{len(p5)}, deploys {deploys}, commits {commits}')

if __name__ == '__main__':
    main()
