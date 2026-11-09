# Asset inventory

| Asset | Source | License | Format | Intended use |
| --- | --- | --- | --- | --- |
| public/assets/classroom/classroom.glb | Authored by assets-src/classroom/build_room.py in Blender; floor and rug maps from Poly Haven laminate_floor_02 and waffle_pique_cotton, tinted | Script output; Poly Haven maps CC0 | GLB, meshopt, webp | Static classroom slice: shell, arched windows, board, desk, props, rug, pendant |
| public/assets/classroom/lightmap.webp | Cycles bake from build_room.py, draft settings (1024, 8 samples, OIDN) | Script output | WebP, TEXCOORD_1 | Baked room lighting |
| public/assets/classroom/env_room.webp | Cycles interior probe from build_room.py, draft settings | Script output | WebP equirect | Reflections |
| public/assets/classroom/backdrop_meadow.webp | Poly Haven meadow_2 HDRI, softened | CC0 | WebP equirect | View outside the windows |
| Board wordmark geometry | Plus Jakarta Sans 800 instance from the app's @fontsource-variable dependency, extruded | SIL OFL | Mesh inside classroom.glb | "Agent Academy" on the board |
