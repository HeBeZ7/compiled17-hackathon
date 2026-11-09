#!/usr/bin/env bash
# Compresses the Blender output into the runtime assets: meshopt geometry and WebP textures.
# Joining and instancing stay off so the app can address nodes by name.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$root/public/assets/showroom"
bin="$root/node_modules/.bin/gltf-transform"
mkdir -p "$out"
for name in "$@"; do
  "$bin" optimize "$here/build/$name.raw.glb" "$out/$name.glb" \
    --compress meshopt --texture-compress webp --texture-size 2048 \
    --join false --instance false --flatten false --simplify false --palette false
done
