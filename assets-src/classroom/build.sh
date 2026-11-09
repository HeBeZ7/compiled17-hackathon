#!/usr/bin/env bash
# Rebuilds every classroom asset. Takes a while: Cycles bakes on the CPU.
# Usage: ./build.sh          full build (fetch sources, teacher, room + lightmap, compress)
#        AA_SKIP_BAKE=1 ./build.sh    reuses the cached lightmap bake for material-only edits
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BLENDER="${AA_BLENDER:-/tmp/aa-tools/blender/blender}"
CACHE="${AA_CACHE_DIR:-/tmp/aa-classroom-cache}"
OUT="$REPO/public/assets/classroom"
"$HERE/fetch_sources.sh"
AA_STAGE=export "$BLENDER" -b --python "$HERE/build_teacher.py" --python-exit-code 1
AA_STAGE=export "$BLENDER" -b --python "$HERE/build_room.py" --python-exit-code 1
cd "$REPO"
for name in classroom teacher; do
  npx gltf-transform dedup "$CACHE/work/${name}_raw.glb" "$CACHE/work/${name}_d.glb"
  npx gltf-transform webp "$CACHE/work/${name}_d.glb" "$CACHE/work/${name}_w.glb" --quality 86 --effort 90
  npx gltf-transform meshopt "$CACHE/work/${name}_w.glb" "$OUT/${name}.glb" --level high
done
ls -la "$OUT"
