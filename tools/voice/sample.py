#!/usr/bin/env python3
"""Render exactly three existing clips per role via the generator's partial-render CLI."""
import collections
import json
from pathlib import Path
import subprocess
import sys
import generate as g

cfg = g.load()
clips = g.expand(cfg)
ids = []
for role in cfg['roles']:
    candidates = [c for c in clips if c['role'] == role and len(c['spoken'].split()) >= 4 and c['kind'] != 'clock'
                  and sum(other['id'].startswith(c['id']) for other in clips) == 1]
    chosen = candidates[:3]
    clock = next((c for c in clips if c['role'] == role and c['id'].startswith('clock_12_high__')), None)
    if clock:
        chosen[-1] = clock
    if len(chosen) != 3:
        raise RuntimeError(f'{role} needs three sample clips')
    ids.extend(c['id'] for c in chosen)
selected = g.select_clips(clips, ids, None)
assert len(selected) == 51 and collections.Counter(c['role'] for c in selected) == {r: 3 for r in cfg['roles']}, 'sample prefixes overlap'
Path(g.HERE, '.cache').mkdir(exist_ok=True)
Path(g.HERE, '.cache/sample-ids.json').write_text(json.dumps(ids, indent=2) + '\n')
command = [sys.executable, str(Path(g.HERE, 'generate.py')), '--limit', '51']
for cid in ids:
    command += ['--only', cid]
sys.exit(subprocess.call(command))
