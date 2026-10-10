"""Decode a canvas dataURL (saved by the Playwright evaluate tool) into an image file.
Usage: python3 tools/frame2jpg.py <frame.txt> <out.jpg>"""
import base64, json, re, sys
raw = open(sys.argv[1]).read().strip()
try:
    raw = json.loads(raw)
except Exception:
    pass
if not isinstance(raw, str):
    raw = json.dumps(raw)
m = re.search(r'base64,([A-Za-z0-9+/=]+)', raw)
open(sys.argv[2], 'wb').write(base64.b64decode(m.group(1)))
