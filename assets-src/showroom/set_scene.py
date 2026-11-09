"""Conservatory showroom set. Geometry authored by script with lighting baked to textures and vertex colors.

Run: blender -b --python set_scene.py -- [preview|bake]
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
import plinth as plinth_mod  # noqa: E402
from plinth import srgb  # noqa: E402

args = sys.argv
mode = "preview" if "preview" in args else ("bake" if "bake" in args else "preview")
lib.reset()
R = lib.rng(11)

# ---- Materials ----
M = {
    "wall": lib.material("wall", srgb("#F6F2E9"), rough=0.75),
    "frame": lib.material("frame", srgb("#FCFAF4"), rough=0.5),
    "floor": lib.material("floor", srgb("#F2ECE1"), rough=0.5),
    "stage_mint": lib.material("stage_mint", srgb("#BFE6D4"), rough=0.4),
    "stage_ivory": lib.material("stage_ivory", srgb("#F5EFE3"), rough=0.3),
    "rug": lib.material("rug", srgb("#CBE9DC"), rough=0.95),
    "shelf": lib.material("shelf", srgb("#FBF8F0"), rough=0.6),
    "birch": lib.material("birch", srgb("#E9D6B8"), rough=0.55),
    "banner": lib.material("banner", srgb("#6FBFA6"), rough=0.7),
    "banner_light": lib.material("banner_light", srgb("#F6F2E9"), rough=0.7),
    "pot": lib.material("pot", srgb("#FBF8F0"), rough=0.4),
    "pouf": lib.material("pouf", srgb("#C7B6EC"), rough=0.85),
}


def add_box(name, loc, size, mat, rounded=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if rounded > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=rounded, segments=2, profile=0.5, affect="EDGES")
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    obj.location = loc
    lib.assign(obj, mat)
    return obj


GEO_FLOOR, GEO_ARCH, GEO_DECOR = [], [], []

# ---- Floor and stage ----
floor = add_box("floor", (0, 3, -0.25), (70, 50, 0.5), M["floor"])
GEO_FLOOR.append(floor)
# Tile grout lines: thin darker strips laid just above the floor for a stone-tile read.
grout_mat = lib.material("grout", srgb("#E0D9CB"), rough=0.7)
for i in range(-18, 19):
    GEO_FLOOR.append(add_box(f"grout_x{i}", (i * 2.4, 3, 0.0015), (0.016, 50, 0.002), grout_mat))
for j in range(-10, 13):
    GEO_FLOOR.append(add_box(f"grout_y{j}", (0, 3 + j * 2.4, 0.0015), (70, 0.016, 0.002), grout_mat))

STAGE_TOP = 0.32
tier_low = lib.lathe("stage_low", lib.rounded_profile([(0, 0, 0), (5.5, 0.0, 0), (5.5, 0.18, 0.05), (5.1, 0.2, 0.04), (0, 0.2, 0)], segments=6), steps=160)
lib.assign(tier_low, M["stage_mint"])
tier_top = lib.lathe("stage_top", lib.rounded_profile([(0, 0.2, 0), (4.75, 0.2, 0), (4.75, 0.32, 0.05), (4.45, 0.34, 0.03), (0, 0.34, 0)], segments=6), steps=160)
lib.assign(tier_top, M["stage_ivory"])
GEO_FLOOR += [tier_low, tier_top]

# ---- Architecture helpers ----
def arch_outline(cx, half, spring, n=32):
    pts = [(cx - half, 0.0)]
    for i in range(n + 1):
        a = math.pi - math.pi * i / n
        pts.append((cx + math.cos(a) * half, spring + math.sin(a) * half))
    pts.append((cx + half, 0.0))
    return pts


def make_curve_mesh(name, outlines, depth, mat, y):
    """Extrudes 2D outlines (XZ plane) along +Y, even-odd holes allowed."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = depth / 2
    curve.bevel_depth = 0.01
    curve.bevel_resolution = 1
    curve.resolution_u = 4
    for outline in outlines:
        spline = curve.splines.new("POLY")
        spline.points.add(len(outline) - 1)
        for i, (x, z) in enumerate(outline):
            spline.points[i].co = (x, z, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    lib.ensure_coll().objects.link(obj)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.location = (0, y, 0)
    bpy.context.view_layer.update()
    lib.activate(obj)
    bpy.ops.object.convert(target="MESH")
    result = bpy.context.view_layer.objects.active
    result.name = name
    lib.assign(result, mat)
    return result


def window(cx, half, spring, y, depth=0.3, frame_mat=None, pane_x=5, pane_z=7):
    """Frames an arched window: rim plus vertical and horizontal bars clipped to the arch."""
    frame_mat = frame_mat or M["frame"]
    parts = []
    outer = arch_outline(cx, half, spring)
    inner = arch_outline(cx, half - 0.2, spring)
    parts.append(make_curve_mesh(f"win_rim_{cx}", [outer, inner], depth, frame_mat, y))
    # Vertical bars.
    for i in range(1, pane_x):
        x = cx - half + 2 * half * i / pane_x
        dx = x - cx
        top = spring + math.sqrt(max(0.0, (half - 0.2) ** 2 - dx * dx))
        parts.append(add_box(f"win_v_{cx}_{i}", (x, y, top / 2), (0.08, depth * 0.7, top), frame_mat))
    # Horizontal bars.
    total = spring + half
    for j in range(1, pane_z):
        z = total * j / pane_z
        if z <= spring:
            w = half - 0.05
        else:
            w = math.sqrt(max(0.0, (half - 0.2) ** 2 - (z - spring) ** 2)) - 0.02
        if w <= 0.05:
            continue
        parts.append(add_box(f"win_h_{cx}_{j}", (cx, y + 0.01, z), (w * 2, depth * 0.62, 0.08), frame_mat))
    return parts


BACK_Y = 16.0
WALL_H = 12.0
ARCHES = [(-12.0, 3.4, 6.2), (-3.6, 3.6, 6.4), (5.0, 3.3, 6.0), (13.2, 3.5, 6.2)]
outer_rect = [(-24, 0), (24, 0), (24, WALL_H), (-24, WALL_H)]
holes = [arch_outline(cx, half - 0.02, spring) for cx, half, spring in ARCHES]
back_wall = make_curve_mesh("back_wall", [outer_rect] + holes, 0.5, M["wall"], BACK_Y)
GEO_ARCH.append(back_wall)
for cx, half, spring in ARCHES:
    if cx == 5.0:
        continue  # Bookcase niche: filled below.
    GEO_ARCH += window(cx, half, spring, BACK_Y + 0.05)

# Pilasters between arches.
for x in (-8.0, 0.5, 9.0):
    GEO_ARCH.append(add_box(f"pilaster_{x}", (x, BACK_Y - 0.4, WALL_H / 2), (1.1, 0.6, WALL_H), M["frame"]))
    GEO_ARCH.append(add_box(f"pilaster_base_{x}", (x, BACK_Y - 0.55, 0.4), (1.35, 0.9, 0.8), M["frame"]))

# Cornice.
GEO_ARCH.append(add_box("cornice", (0, BACK_Y - 0.5, 11.4), (60, 1.0, 0.45), M["frame"], rounded=0.08))
GEO_ARCH.append(add_box("skirting", (0, BACK_Y - 0.28, 0.15), (60, 0.2, 0.3), M["frame"]))

# Side walls, wide and bright, with tall arched windows.
for sign in (-1, 1):
    side_x = sign * 19.0
    wall_h = WALL_H
    outline = [(-16.0, 0.0), (18.0, 0.0), (18.0, wall_h), (-16.0, wall_h)]
    # Build in XZ then rotate to YZ.
    holes2 = [arch_outline(c, 3.0, 4.2) for c in (-9.5, -1.5, 6.5, 14.5)]
    obj = make_curve_mesh(f"side_wall_{sign}", [outline] + holes2, 0.5, M["wall"], 0.0)
    obj.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    obj.location = (side_x, 0, 0)
    bpy.context.view_layer.update()
    GEO_ARCH.append(obj)
    for c in (-9.5, -1.5, 6.5, 14.5):
        parts = window(c, 3.0, 4.2, 0.0, pane_x=4, pane_z=6)
        for p in parts:
            # Parts were authored in the XZ plane at y=0: mirror them onto the side wall.
            p.rotation_euler.z += math.pi / 2
            p.location = Vector((side_x, p.location.x, p.location.z))
            GEO_ARCH.append(p)

# Grand arch rib framing the stage from behind on the right.
rib_pts = []
rib_inner = []
for i in range(0, 61):
    a = math.radians(4) + (math.radians(172)) * i / 60
    rib_pts.append((15.5 + math.cos(a) * 9.5, 1.0 + math.sin(a) * 9.5))
    rib_inner.append((15.5 + math.cos(a) * 9.0, 1.0 + math.sin(a) * 9.0))
rib = make_curve_mesh("grand_rib", [rib_pts + list(reversed(rib_inner))], 0.75, M["frame"], 6.0)
GEO_ARCH.append(rib)
# A narrow warm light strip on the inner edge of the rib.
strip_pts = []
strip_inner = []
for i in range(0, 61):
    a = math.radians(4) + (math.radians(172)) * i / 60
    strip_pts.append((15.5 + math.cos(a) * 9.02, 1.0 + math.sin(a) * 9.02))
    strip_inner.append((15.5 + math.cos(a) * 8.96, 1.0 + math.sin(a) * 8.96))
strip_mat = lib.material("strip", (1, 0.93, 0.82), emit=(1, 0.93, 0.82), strength=6.0)
GEO_ARCH.append(make_curve_mesh("grand_rib_strip", [strip_pts + list(reversed(strip_inner))], 0.05, strip_mat, 5.72))

# Back column cluster left of the stage for depth.
for x, y, h in ((-7.5, 9.5, 9.5),):
    col = lib.lathe(f"column_{x}", lib.rounded_profile([(0.75, 0, 0.05), (0.75, 0.4, 0.04), (0.55, 0.5, 0.04), (0.5, h - 0.6, 0.05), (0.72, h - 0.2, 0.05), (0.72, h, 0)], segments=4), steps=48)
    col.location = (x, y, 0)
    lib.assign(col, M["frame"])
    GEO_ARCH.append(col)

# Bookcase in the arch niche.
bc_x = 5.0
bc_half = 2.7
GEO_ARCH.append(add_box("bookcase_back", (bc_x, BACK_Y + 0.15, 3.6), (bc_half * 2, 0.2, 7.2), M["shelf"]))
GEO_ARCH.append(add_box("bookcase_side_L", (bc_x - bc_half, BACK_Y - 0.2, 3.6), (0.14, 0.7, 7.2), M["shelf"], rounded=0.02))
GEO_ARCH.append(add_box("bookcase_side_R", (bc_x + bc_half, BACK_Y - 0.2, 3.6), (0.14, 0.7, 7.2), M["shelf"], rounded=0.02))
SHELF_Z = [0.35, 1.5, 2.65, 3.8, 4.95, 6.1]
for z in SHELF_Z:
    GEO_ARCH.append(add_box(f"bookcase_shelf_{z}", (bc_x, BACK_Y - 0.2, z), (bc_half * 2, 0.7, 0.1), M["shelf"], rounded=0.015))
GEO_ARCH.append(add_box("bookcase_top", (bc_x, BACK_Y - 0.2, 7.25), (bc_half * 2.1, 0.8, 0.22), M["shelf"], rounded=0.03))

# ---- Decor with vertex colors ----
GEO_DECOR = []


def base_colored(obj, color):
    mesh = obj.data
    if not mesh.color_attributes.get("BaseCol"):
        attr = mesh.color_attributes.new("BaseCol", "FLOAT_COLOR", "POINT")
    attr = mesh.color_attributes["BaseCol"]
    for i in range(len(attr.data)):
        attr.data[i].color = (*color, 1)
    if not mesh.color_attributes.get("Col"):
        mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")


# Material that reads base color from the BaseCol attribute.
decor_mat = bpy.data.materials.new("decor")
decor_mat.use_nodes = True
_nt = decor_mat.node_tree
_bsdf = _nt.nodes["Principled BSDF"]
_attr = _nt.nodes.new("ShaderNodeVertexColor")
_attr.layer_name = "BaseCol"
_nt.links.new(_attr.outputs[0], _bsdf.inputs["Base Color"])
_bsdf.inputs["Roughness"].default_value = 0.6


def jitter_color(col, amt=0.1):
    return tuple(max(0.0, min(1.0, c * (1 + R.uniform(-amt, amt)))) for c in col)


def leaf_mesh(bm, base, tip, width, up=Vector((0, 0, 1)), segments=6):
    """Leaf blade as a slightly folded elongated hexagon strip."""
    axis = (tip - base)
    length = axis.length
    axis_n = axis.normalized()
    side = axis_n.cross(up)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    normal = side.cross(axis_n).normalized()
    verts_left, verts_right, verts_mid = [], [], []
    for i in range(segments + 1):
        t = i / segments
        w = width * math.sin(t * math.pi) ** 0.65
        center = base + axis * t
        fold = normal * width * 0.18 * math.sin(t * math.pi)
        mid = center + fold
        verts_mid.append(bm.verts.new(mid))
        verts_left.append(bm.verts.new(center - side * w))
        verts_right.append(bm.verts.new(center + side * w))
    for i in range(segments):
        bm.faces.new((verts_left[i], verts_mid[i], verts_mid[i + 1], verts_left[i + 1]))
        bm.faces.new((verts_mid[i], verts_right[i], verts_right[i + 1], verts_mid[i + 1]))


def vine(name, start, length, droop_x=0.0, leaves=40, leaf_size=0.34, colors=None):
    colors = colors or [srgb("#6AAE6A"), srgb("#8BC97B"), srgb("#4F9A62"), srgb("#A5D88F")]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pos = Vector(start)
    direction = Vector((droop_x * 0.1, 0, -1)).normalized()
    color_layer = bm.loops.layers.float_color.new("BaseCol")
    prev_face_count = 0
    n_steps = leaves
    step_len = length / n_steps
    for i in range(n_steps):
        direction = (direction + Vector((R.uniform(-0.25, 0.25) + droop_x * 0.03, R.uniform(-0.08, 0.08), -0.1))).normalized()
        pos = pos + direction * step_len
        # Thin stem segment.
        side_sign = 1 if i % 2 == 0 else -1
        leaf_dir = Vector((side_sign * R.uniform(0.4, 1.0), R.uniform(-0.9, -0.1), R.uniform(-0.6, 0.2))).normalized()
        base = pos.copy()
        size = leaf_size * R.uniform(0.75, 1.25)
        tip = base + leaf_dir * size
        leaf_mesh(bm, base, tip, size * 0.42, up=Vector((R.uniform(-0.3, 0.3), -1, R.uniform(-0.2, 0.5))))
    # Colour leaves individually.
    for face in bm.faces[prev_face_count:]:
        pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    faces = list(bm.faces)
    per_leaf = 12
    for i in range(0, len(faces), per_leaf):
        col = jitter_color(R.choice(colors), 0.14)
        for f in faces[i : i + per_leaf]:
            for loop in f.loops:
                loop[color_layer] = (*col, 1)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    lib.assign(obj, decor_mat)
    return obj


def ensure_decor(obj):
    mesh = obj.data
    if not mesh.color_attributes.get("Col"):
        mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    GEO_DECOR.append(obj)


# Hanging ivy from the cornice and arches.
for i, (x, y, l, d, n) in enumerate([
    (-14.2, 15.2, 6.0, 0.4, 42), (-9.4, 15.4, 3.8, -0.3, 30), (-5.5, 15.4, 4.2, 0.2, 34),
    (2.5, 15.4, 3.2, -0.4, 28), (2.0, 15.0, 5.4, 0.2, 40), (7.2, 15.4, 3.6, 0.3, 30), (10.2, 15.0, 5.5, -0.2, 40),
    (14.6, 15.0, 6.5, 0.4, 48), (16.5, 13.0, 5.5, -0.1, 42),
    (-1.5, 14.5, 3.0, 0.1, 24),
]):
    ensure_decor(vine(f"ivy_{i}", (x, y, 8.6), l, droop_x=d, leaves=n))

# Near vines entering from the top corners, the foreground frame.
ensure_decor(vine("near_ivy_R", (8.7, 2.8, 7.2), 3.4, droop_x=-0.6, leaves=40, leaf_size=0.32))
ensure_decor(vine("near_ivy_L", (-8.6, 2.5, 7.0), 3.0, droop_x=0.5, leaves=34, leaf_size=0.3))


def icosphere(name, loc, radius, col, seed=0, subdiv=2, squash=(1, 1, 1)):
    subdiv = 3
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    rnd = lib.rng(seed)
    for v in bm.verts:
        n = v.co.normalized()
        d = 1 + 0.08 * math.sin(n.x * 5 + seed) * math.cos(n.y * 4 + seed * 0.7) * math.sin(n.z * 6)
        v.co = Vector((v.co.x * squash[0] * d, v.co.y * squash[1] * d, v.co.z * squash[2] * d))
    color_layer = bm.loops.layers.float_color.new("BaseCol")
    for f in bm.faces:
        c = col
        for l in f.loops:
            l[color_layer] = (*c, 1)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    obj.location = loc
    lib.assign(obj, decor_mat)
    lib.smooth_mesh(obj)
    return obj


# Trees outside the back windows, kept blobby and bright; these are blurred by the render.
trees = []
for i, (x, y, h, r) in enumerate([
    (-14, 26, 4, 3.2), (-8, 28, 4.5, 3.6), (-2, 25, 3.2, 3.0), (3.5, 27, 4.2, 3.4), (9, 26, 3.5, 3.4), (15, 28, 4.8, 3.8),
    (-11, 32, 7, 5), (0, 33, 7.5, 5.5), (12, 33, 7.0, 5.5),
]):
    for k in range(4):
        offs = Vector((R.uniform(-1.4, 1.4), R.uniform(-1, 1), R.uniform(-1, 1.2)))
        trees.append(icosphere(f"tree_{i}_{k}", Vector((x, y, h)) + offs * (r * 0.45), r * R.uniform(0.55, 0.85),
                               srgb(R.choice(["#A7DBA0", "#BFE7B0", "#8FCB92", "#CDEFC0"])), seed=i * 7 + k, subdiv=3, squash=(1, 0.9, 0.95)))
GEO_DECOR_BACKDROP = trees


def potted_plant(name, x, y, height, spread):
    """Glazed pot and a dense leaf crown."""
    objs = []
    pot = lib.lathe(f"{name}_pot", lib.rounded_profile([(0, 0, 0), (0.42, 0, 0.03), (0.52, 0.55, 0.05), (0.47, 0.6, 0.03), (0.4, 0.58, 0.02), (0.4, 0.52, 0), (0, 0.52, 0)], segments=4), steps=32)
    pot.location = (x, y, 0)
    lib.assign(pot, M["pot"])
    GEO_DECOR.append(pot)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    color_layer = bm.loops.layers.float_color.new("BaseCol")
    colors = [srgb(c) for c in ("#6AAE6A", "#8BC97B", "#4F9A62", "#A5D88F", "#5FA86E")]
    for i in range(46):
        ang = R.uniform(0, 6.28)
        lift = R.uniform(0.35, 1.0)
        base = Vector((x, y, 0.55))
        d = Vector((math.cos(ang) * R.uniform(0.4, 1.0) * spread, math.sin(ang) * R.uniform(0.25, 0.8) * spread, height * lift))
        tip = base + d
        f0 = len(bm.faces)
        leaf_mesh(bm, base + d.normalized() * 0.2, tip, 0.11 + 0.1 * R.random(), up=Vector((math.cos(ang), math.sin(ang), 0.4)))
        c = jitter_color(R.choice(colors), 0.12)
        bm.faces.ensure_lookup_table()
        for fi in range(f0, len(bm.faces)):
            for l in bm.faces[fi].loops:
                l[color_layer] = (*c, 1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    lib.assign(obj, decor_mat)
    ensure_decor(obj)


potted_plant("plant_R", 9.8, 9.5, 2.6, 1.6)
potted_plant("plant_L", -11.2, 11.0, 2.4, 1.6)
potted_plant("plant_R2", 12.5, 13.5, 2.8, 1.6)
potted_plant("plant_C", -3.2, 13.8, 2.2, 1.3)

# Bookshelf books and little ornaments.
book_colors = ["#A9C4E6", "#BBA6E5", "#CFE7DE", "#F5C2BC", "#F5E7C4", "#9CB7DC", "#D9CCF2", "#8ACBB3"]
mesh = bpy.data.meshes.new("shelf_books")
bm = bmesh.new()
color_layer = bm.loops.layers.float_color.new("BaseCol")
for shelf_z in SHELF_Z[:-1]:
    x = bc_x - bc_half + 0.25
    while x < bc_x + bc_half - 0.35:
        if R.random() < 0.18:
            x += R.uniform(0.3, 0.6)
            continue
        w = R.uniform(0.09, 0.18)
        h = R.uniform(0.62, 0.92)
        d = R.uniform(0.4, 0.55)
        res = bmesh.ops.create_cube(bm, size=1.0)
        for v in res["verts"]:
            v.co.x = v.co.x * w + x + w / 2
            v.co.y = v.co.y * d + BACK_Y - 0.2 - 0.02
            v.co.z = v.co.z * h + shelf_z + 0.06 + h / 2
            v.co.x += R.uniform(-0.005, 0.005)
        c = srgb(R.choice(book_colors))
        c = jitter_color(c, 0.08)
        faces = set()
        for v in res["verts"]:
            faces.update(v.link_faces)
        for f in faces:
            for l in f.loops:
                l[color_layer] = (*c, 1)
        x += w + R.uniform(0.0, 0.02)
bm.to_mesh(mesh)
bm.free()
shelf_books = lib.new_obj("shelf_books", mesh)
lib.assign(shelf_books, decor_mat)
ensure_decor(shelf_books)

# Mint banner hung on the right, with a pale cap-and-laurel crest.
bx, by = 9.0, 15.0
GEO_DECOR.append(add_box("banner_rod", (bx, by, 7.6), (2.6, 0.08, 0.08), M["birch"]))
points = [(-1.0, 7.5), (1.0, 7.5), (1.0, 4.0), (0.0, 3.2), (-1.0, 4.0)]
banner = make_curve_mesh("banner_cloth", [[(bx + p[0], p[1]) for p in points]], 0.05, M["banner"], by + 0.05)
GEO_ARCH.append(banner)
trim = [(-0.86, 7.32), (0.86, 7.32), (0.86, 4.1), (0.0, 3.42), (-0.86, 4.1)]
trim_in = [(-0.74, 7.2), (0.74, 7.2), (0.74, 4.15), (0.0, 3.56), (-0.74, 4.15)]
GEO_ARCH.append(make_curve_mesh("banner_trim", [[(bx + p[0], p[1]) for p in trim], [(bx + p[0], p[1]) for p in trim_in]], 0.06, M["banner_light"], by + 0.02))
GEO_ARCH.append(make_curve_mesh("banner_cap", [[(bx - 0.55, 5.9), (bx + 0.55, 5.9), (bx, 5.4)], [(bx - 0.36, 5.86), (bx + 0.36, 5.86), (bx, 5.52)]], 0.06, M["banner_light"], by + 0.015))

# ---- Display plinth (present only for its own bake and for preview) ----
STAGE_TOP_Z = 0.34
plinth_obj = plinth_mod.build_plinth(STAGE_TOP_Z)
glow_ring = plinth_mod.build_glow_ring(STAGE_TOP_Z)
dome, dome_rim = plinth_mod.build_dome(STAGE_TOP_Z + 1.3)

# ---- Lighting ----
lib.sky_world(top=(0.36, 0.6, 0.98), horizon=(0.78, 0.88, 1.0), strength=1.08)
sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 2.6
sun.angle = math.radians(9)
sun.color = (1.0, 0.97, 0.92)
sun_o = bpy.data.objects.new("sun", sun)
lib.ensure_coll().objects.link(sun_o)
# Light rakes in from the back windows toward the camera.
sun_o.rotation_euler = (math.radians(68), 0, math.radians(164))
# Soft fill from the camera side so nothing goes grey.
fill = bpy.data.lights.new("fill", "AREA")
fill.shape = "RECTANGLE"
fill.size = 30
fill.size_y = 14
fill.energy = 230
fill.color = (1.0, 0.99, 0.97)
fill_o = bpy.data.objects.new("fill", fill)
lib.ensure_coll().objects.link(fill_o)
fill_o.location = (0, -12, 12)
fill_o.rotation_euler = (math.radians(65), 0, 0)
top = bpy.data.lights.new("top", "AREA")
top.shape = "RECTANGLE"
top.size = 40
top.size_y = 30
top.energy = 230
top_o = bpy.data.objects.new("top", top)
lib.ensure_coll().objects.link(top_o)
top_o.location = (0, 3, 14)

CAM_LOC = (0, -11.4, 2.75)
CAM_TARGET = (0, 0, 1.9)
CAM_LENS = 34


def bake_prepare(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def join_and_unwrap(objs, name, margin=0.004):
    """Joins objects, smart-unwraps and returns the joined object."""
    for obj in objs:
        bpy.ops.object.select_all(action="DESELECT")
        if obj.type != "MESH":
            continue
    for obj in objs:
        activate = obj
        break
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.make_single_user(type="SELECTED_OBJECTS", object=True, obdata=True)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=margin, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return joined


def bake_to_image(obj, image_name, size, samples, out_name):
    img = bpy.data.images.new(image_name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    for mat in obj.data.materials:
        mat.use_nodes = True
        nt = mat.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = img
        nt.nodes.active = node
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    print("baking", out_name)
    bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "EMIT"}, margin=8, use_clear=True)
    img.filepath_raw = os.path.join(lib.OUT, out_name)
    img.file_format = "PNG"
    img.save()
    print("saved", out_name)
    return img


def bake_vertices(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        obj.data.color_attributes.active_color = obj.data.color_attributes["Col"]
    bpy.context.view_layer.objects.active = objects[0]
    scene = bpy.context.scene
    scene.cycles.samples = 64
    bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "EMIT"}, target="VERTEX_COLORS", margin=0)


if mode == "preview":
    lib.setup_cycles(samples=12, w=800, h=500)
    lib.add_camera(CAM_LOC, CAM_TARGET, lens=CAM_LENS)
    bpy.context.scene.render.filepath = os.path.join(lib.OUT, "preview_set.png")
    bpy.ops.render.render(write_still=True)
    print("preview done")
else:
    lib.setup_cycles(samples=96, w=1024, h=1024)
    scene = bpy.context.scene

    def hide(objs, value):
        for o in objs:
            o.hide_render = value
            o.hide_set(value)

    # The stage and room are baked without the display so its shadow can travel with it at runtime.
    display_parts = [plinth_obj, glow_ring, dome, dome_rim]
    hide(display_parts, True)

    # 1. Decor to vertex colors.
    all_decor = GEO_DECOR + GEO_DECOR_BACKDROP
    for o in all_decor:
        if not o.data.color_attributes.get("Col"):
            o.data.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    scene.cycles.samples = 48
    bpy.ops.object.select_all(action="DESELECT")
    for o in all_decor:
        o.select_set(True)
        attrs = o.data.color_attributes
        attrs.active_color = attrs["Col"]
    bpy.context.view_layer.objects.active = all_decor[0]
    print("baking decor vertices", len(all_decor))
    bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "EMIT"}, target="VERTEX_COLORS", margin=0)
    print("decor baked")

    # 2. Architecture and floor textures.
    floor_joined = join_and_unwrap(GEO_FLOOR, "set_floor")
    arch_joined = join_and_unwrap(GEO_ARCH, "set_arch", margin=0.003)
    img_floor = bake_to_image(floor_joined, "bake_floor", 2048, 96, "bake_floor.png")
    img_arch = bake_to_image(arch_joined, "bake_arch", 2048, 72, "bake_arch.png")

    # 3. Plinth with the room around it.
    hide([plinth_obj], False)
    plinth_joined = join_and_unwrap([plinth_obj], "plinth_body", margin=0.01)
    img_plinth = bake_to_image(plinth_joined, "bake_plinth", 1024, 96, "bake_plinth.png")

    # 4. Reflection environment from the display position.
    hide(display_parts, True)
    cam = bpy.data.cameras.new("env")
    cam.type = "PANO"
    cam.panorama_type = "EQUIRECTANGULAR"
    cam_o = bpy.data.objects.new("env", cam)
    lib.ensure_coll().objects.link(cam_o)
    cam_o.location = (0, 0, 2.8)
    cam_o.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam_o
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 512
    scene.cycles.samples = 64
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = os.path.join(lib.OUT, "environment.webp")
    bpy.ops.render.render(write_still=True)

    def finish(obj, image):
        mat = bpy.data.materials.new(obj.name + "_baked")
        mat.use_nodes = True
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.links.new(node.outputs[0], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    finish(floor_joined, img_floor)
    finish(arch_joined, img_arch)
    finish(plinth_joined, img_plinth)

    # Decor: one mesh, one colour layer holding baked light.
    bpy.ops.object.select_all(action="DESELECT")
    for o in all_decor:
        o.select_set(True)
    bpy.context.view_layer.objects.active = all_decor[0]
    bpy.ops.object.join()
    decor_joined = bpy.context.view_layer.objects.active
    decor_joined.name = "set_decor"
    attrs = decor_joined.data.color_attributes
    if attrs.get("BaseCol"):
        attrs.remove(attrs["BaseCol"])
    attrs.active_color = attrs["Col"]
    attrs.render_color_index = list(attrs).index(attrs["Col"])
    decor_joined.data.materials.clear()
    decor_joined.data.materials.append(bpy.data.materials.new("set_decor_baked"))

    hide([floor_joined, arch_joined, decor_joined, plinth_joined, glow_ring, dome, dome_rim], False)
    lib.export_glb(os.path.join(lib.OUT, "conservatory.raw.glb"), [floor_joined, arch_joined, decor_joined])
    lib.export_glb(os.path.join(lib.OUT, "display-plinth.raw.glb"), [plinth_joined, glow_ring, dome, dome_rim], export_colors=False)
    print("bake complete")
