"""Display plinth, glass dome and glow ring. Imported by the set script so lighting can be baked together."""
import math

import bmesh
import bpy
from mathutils import Vector

import lib


def srgb(hexcode):
    h = hexcode.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def build_plinth(base_z):
    profile = [
        (0.0, 0.0, 0),
        (1.62, 0.0, 0),
        (1.62, 0.16, 0.06),
        (1.47, 0.20, 0.03),
        (1.46, 0.98, 0.06),
        (1.56, 1.0, 0.03),
        (1.57, 1.16, 0.07),
        (1.34, 1.2, 0.03),
        (1.32, 1.3, 0.05),
        (0.0, 1.3, 0),
    ]
    prof = lib.rounded_profile([(p[0], p[1], p[2]) for p in profile], segments=8)
    obj = lib.lathe("plinth", prof, steps=128)
    obj.location.z = base_z
    # Two-tone: ivory top band above z 0.99, mint body under it. Face-split materials.
    mint = lib.material("plinth_mint", srgb("#BFE6D4"), rough=0.32)
    ivory = lib.material("plinth_ivory", srgb("#F6F1E6"), rough=0.3)
    obj.data.materials.append(mint)
    obj.data.materials.append(ivory)
    for poly in obj.data.polygons:
        z = sum(obj.data.vertices[v].co.z for v in poly.vertices) / len(poly.vertices)
        poly.material_index = 1 if z > 0.985 or z < 0.13 else 0
    return obj


def build_glow_ring(base_z):
    """Emissive strip around the foot of the plinth, drives the selection glow."""
    mesh = bpy.data.meshes.new("glow_ring")
    bm = bmesh.new()
    bmesh.ops.create_circle
    bm.free()
    profile = [(1.49, 0.15, 0), (1.56, 0.165, 0.02), (1.555, 0.205, 0.02), (1.485, 0.195, 0)]
    prof = lib.rounded_profile(profile, segments=4)
    obj = lib.lathe("glow_ring", prof + [Vector((1.49, 0.15))], steps=128)
    obj.location.z = base_z
    lib.assign(obj, lib.material("glow_ring", srgb("#7FE0BE"), emit=srgb("#7FE0BE"), strength=2.0))
    return obj


def build_dome(base_z):
    r = 1.2
    h = 2.65
    prof = [Vector((r, 0.0))]
    # Straight walls, then a soft dome top.
    for i in range(1, 13):
        prof.append(Vector((r, h * 0.7 * i / 12)))
    for i in range(1, 25):
        a = i / 24 * math.pi / 2
        prof.append(Vector((r * math.cos(a), h * 0.7 + h * 0.3 * 1.05 * math.sin(a))))
    prof.append(Vector((0.0, h * 0.7 + h * 0.3 * 1.05)))
    obj = lib.lathe("dome", prof, steps=96)
    obj.location.z = base_z
    lib.assign(obj, lib.material("dome_glass", (1, 1, 1), rough=0.05, alpha=0.2))
    rim_prof = lib.rounded_profile([(1.14, 0.0, 0), (1.26, 0.0, 0.02), (1.27, 0.11, 0.03), (1.13, 0.11, 0.02), (1.14, 0.0, 0)], segments=4)
    rim = lib.lathe("dome_rim", rim_prof + [Vector((1.14, 0.0))], steps=96)
    rim.location.z = base_z
    lib.assign(rim, lib.material("dome_rim", srgb("#EFE8DA"), rough=0.2, metal=0.35))
    return obj, rim
