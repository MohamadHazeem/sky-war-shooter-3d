#!/usr/bin/env python3
"""Resolve git conflict hunks in a file by index: resolve_hunks.py FILE SPEC...
SPEC per hunk (in order): o=ours, t=theirs, ot=ours then theirs, to=theirs then ours,
or @path to substitute that file's text."""
import sys, re
path, specs = sys.argv[1], sys.argv[2:]
src = open(path).read().split('\n')
out, i, h = [], 0, 0
while i < len(src):
    if src[i].startswith('<<<<<<< '):
        ours, theirs = [], []; i += 1
        while not src[i].startswith('======='): ours.append(src[i]); i += 1
        i += 1
        while not src[i].startswith('>>>>>>> '): theirs.append(src[i]); i += 1
        s = specs[h]; h += 1
        if s.startswith('@'): out += open(s[1:]).read().rstrip('\n').split('\n')
        else: out += sum(({'o': ours, 't': theirs}[c] for c in s), [])
    else: out.append(src[i])
    i += 1
open(path, 'w').write('\n'.join(out))
