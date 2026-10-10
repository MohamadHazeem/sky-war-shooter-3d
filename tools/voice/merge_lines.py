#!/usr/bin/env python3
"""Resolve a git conflict in tools/voice/lines.json by merging both sides' entries (by id),
then regenerate the clips/manifest. Usage (during a conflicted merge): python3 tools/voice/merge_lines.py"""
import json, subprocess, sys
ours = json.loads(subprocess.check_output(['git', 'show', ':2:tools/voice/lines.json']))
theirs = json.loads(subprocess.check_output(['git', 'show', ':3:tools/voice/lines.json']))
def merge(a, b):
    if isinstance(a, list) and isinstance(b, list):
        key = lambda x: x.get('id') if isinstance(x, dict) else json.dumps(x)
        seen = {key(x) for x in a}
        return a + [x for x in b if key(x) not in seen]
    if isinstance(a, dict) and isinstance(b, dict):
        out = dict(a)
        for k, v in b.items(): out[k] = merge(a[k], v) if k in a else v
        return out
    return a
json.dump(merge(ours, theirs), open('tools/voice/lines.json', 'w'), indent=2, ensure_ascii=False)
subprocess.call(['git', 'checkout', '--ours', 'public/audio/voice/manifest.json'])
sys.exit(subprocess.call(['python3', 'tools/voice/generate.py']))
