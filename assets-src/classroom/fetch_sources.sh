#!/usr/bin/env bash
# Downloads the CC0 Poly Haven sources and instances the wordmark font into a local cache.
# Nothing here is committed; outputs in the cache are inputs for build_room.py and build_teacher.py.
set -euo pipefail
CACHE="${AA_CACHE_DIR:-/tmp/aa-classroom-cache}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
mkdir -p "$CACHE/ph" "$CACHE/venv"
fetch() { # id kind(ext) size mapType
  local id="$1" size="$2"; shift 2
  local json; json="$(curl -sf "https://api.polyhaven.com/files/$id")"
  for map in "$@"; do
    python3 - "$json" "$id" "$map" "$size" "$CACHE/ph" <<'PY'
import json,sys,urllib.request,os
d=json.loads(sys.argv[1]); id_,m,size,out=sys.argv[2:6]
f=d[m][size]["jpg"]
dst=os.path.join(out,f"{id_}_{m}_{size}.jpg")
if not os.path.exists(dst):
    urllib.request.urlretrieve(f["url"],dst)
print(dst, f["url"])
PY
  done
}
fetch laminate_floor_02 2k Diffuse nor_gl Rough
fetch waffle_pique_cotton 1k Diffuse nor_gl Rough
HDR="$CACHE/ph/meadow_2_2k.hdr"
[ -f "$HDR" ] || curl -sf -o "$HDR" "$(curl -sf https://api.polyhaven.com/files/meadow_2 | python3 -c 'import json,sys;print(json.load(sys.stdin)["hdri"]["2k"]["hdr"]["url"])')"
# Wordmark: Plus Jakarta Sans (SIL OFL, from the app's own @fontsource dependency), weight 800 instance.
if [ ! -f "$CACHE/jakarta-800.ttf" ]; then
  python3 -m venv "$CACHE/venv"
  "$CACHE/venv/bin/pip" -q install fonttools brotli
  "$CACHE/venv/bin/python" - "$REPO/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2" "$CACHE/jakarta-800.ttf" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f=TTFont(sys.argv[1]); f.flavor=None
i=instancer.instantiateVariableFont(f,{"wght":800}); i.save(sys.argv[2])
PY
fi
ls -la "$CACHE/ph" "$CACHE/jakarta-800.ttf"
