#!/bin/bash
# Download every source used by build.py into ${AUDIO_WORK:-tools/audio/work}/audio-src
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${AUDIO_WORK:-$HERE/work}"
mkdir -p "$WORK/audio-src/fs" "$WORK/audio-src/music"
IDS=$(python3 -I -c "import json,sys; d=json.load(open(sys.argv[1])); print(' '.join(sorted({str(i) for v in d.values() for i in v})))" "$HERE/sources_used.json")
echo $IDS | tr ' ' '\n' | xargs -P 6 -n 2 python3 -I "$HERE/fs_get.py" "$WORK/audio-src/fs"
for t in "For the Fallen" "Clenched Teeth" "Constance" "Long Road Ahead" "Taps v2" "Heroic Age"; do
  [ -f "$WORK/audio-src/music/$t.mp3" ] || curl -sSf -o "$WORK/audio-src/music/$t.mp3" "https://incompetech.com/music/royalty-free/mp3-royaltyfree/${t// /%20}.mp3"
done
echo "sources in $WORK/audio-src"
