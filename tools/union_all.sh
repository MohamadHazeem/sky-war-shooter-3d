#!/usr/bin/env bash
# Resolve every conflict hunk in the given files as "ours then theirs" (both sides kept).
# Only for append-style conflicts (imports, fields, CSS blocks); review the result.
for f in "$@"; do
  n=$(grep -c '^<<<<<<< ' "$f")
  [ "$n" -gt 0 ] && python3 "$(dirname "$0")/resolve_hunks.py" "$f" $(for i in $(seq 1 $n); do printf 'ot '; done)
done
