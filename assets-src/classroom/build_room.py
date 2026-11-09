"""Builds the static classroom slice (shell, windows, board, desk, rug, pendant).

Stages, selected by AA_STAGE: "preview" renders a Cycles still from SPAWN, "bake"
writes the Blender file with the lightmap UV set and bakes it, "export" writes
the GLB. The geometry is rebuilt on every run so the output is reproducible.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aa_common as aa  # noqa: E402
from aa_common import srgb  # noqa: E402

STAGE = os.environ.get("AA_STAGE", "preview")
SHADOW_BLEND = os.path.join(aa.WORK, "teacher.blend")
LAY = aa.layout()
R = LAY["ROOM"]
H = R["height"]
X0, X1 = R["minX"], R["maxX"]
Y0, Y1 = -R["maxZ"], -R["minZ"]  # far wall is y = Y1


def window_centers():
    """Four arched windows on the left wall, on a 3 m rhythm."""
    return [Y1 - 1.9, Y1 - 4.9, Y1 - 7.9, Y1 - 10.9]


WIN_W = 2.4
WIN_SILL = 1.12
WIN_SPRING = 2.72
BOARD_CX = 0.8
BOARD_W = 6.3
BOARD_Z0 = 1.2
BOARD_SPRING = 2.78
BOARD_TOP = 3.72
DESK_H = 1.02


# ------------------------------------------------------------------ materials
def build_materials():
    floor_a = os.path.join(aa.WORK, "floor_albedo.png")
    rug_a = os.path.join(aa.WORK, "rug_albedo.png")
    if not os.path.exists(floor_a) or os.environ.get("AA_REBUILD_TEX"):
        tex = aa.image_to_numpy(f"{aa.CACHE}/ph/laminate_floor_02_Diffuse_2k.jpg")
        rgb = tex[..., :3]
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
        rel = lum / lum.mean()
        target = np.array(srgb("#efdccc")[:3], np.float32)
        out = np.clip(target[None, None, :] * (0.88 + (rel[..., None] - 1) * 1.15) + (rgb - lum[..., None]) * 0.25, 0, 1)
        aa.numpy_to_png(np.dstack([out ** (1 / 2.2), np.ones_like(lum)]), floor_a)
    if not os.path.exists(rug_a) or os.environ.get("AA_REBUILD_TEX"):
        tex = aa.image_to_numpy(f"{aa.CACHE}/ph/waffle_pique_cotton_Diffuse_1k.jpg")
        lum = tex[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
        rel = (lum / lum.mean())[..., None]
        out = np.clip(np.array(srgb("#f6efe6")[:3], np.float32)[None, None, :] * (0.92 + (rel - 1) * 1.6), 0, 1)
        aa.numpy_to_png(np.dstack([out ** (1 / 2.2), np.ones_like(lum)]), rug_a)

    m = {}
    m["floor"] = aa.textured_mat(
        "floor_wood",
        albedo=floor_a,
        normal=f"{aa.CACHE}/ph/laminate_floor_02_nor_gl_2k.jpg",
        roughness=f"{aa.CACHE}/ph/laminate_floor_02_Rough_2k.jpg",
        normal_strength=0.6,
        rough=0.55,
    )
    m["rug_field"] = aa.textured_mat("rug_field", albedo=rug_a, normal=f"{aa.CACHE}/ph/waffle_pique_cotton_nor_gl_1k.jpg", roughness=f"{aa.CACHE}/ph/waffle_pique_cotton_Rough_1k.jpg", rough=0.95, spec=0.2)
    rb = aa.make_mat("rug_border", "#a9d5c2", rough=0.92, spec=0.2)
    m["rug_border"] = rb
    m["wall"] = aa.make_mat("wall_plaster", "#f7f3ea", rough=0.85, spec=0.25)
    m["ceiling"] = aa.make_mat("ceiling", "#f4efe6", rough=0.9, spec=0.2)
    m["wainscot"] = aa.make_mat("paint_mint", "#b5dccb", rough=0.5, spec=0.4)
    m["trim"] = aa.make_mat("paint_ivory", "#f4eee2", rough=0.45, spec=0.45)
    m["birch"] = aa.make_mat("wood_birch", "#e6cfaf", rough=0.5, spec=0.4)
    m["board"] = aa.make_mat("board_blue", "#7eaccb", rough=0.72, spec=0.3)
    m["letters"] = aa.make_mat("board_letters", "#fbf7ef", rough=0.5, spec=0.35)
    m["desk_mint"] = aa.make_mat("desk_mint", "#a7d2bf", rough=0.45, spec=0.45)
    m["desk_ivory"] = aa.make_mat("desk_ivory", "#f6efe2", rough=0.35, spec=0.5, coat=0.2, coat_rough=0.2)
    m["ceramic"] = aa.make_mat("ceramic_white", "#f7f2ea", rough=0.2, spec=0.6, coat=0.6, coat_rough=0.1)
    m["brass"] = aa.make_mat("brass", "#d7b36a", rough=0.32, metal=1.0)
    m["silver"] = aa.make_mat("laptop_silver", "#d5d4d3", rough=0.38, metal=0.85)
    m["keys"] = aa.make_mat("laptop_keys", "#3a3f46", rough=0.5)
    m["screen"] = aa.make_mat("laptop_screen", "#d9e8f6", rough=0.2, emission="#d9e8f6", emit=0.15)
    m["paper"] = aa.make_mat("paper", "#f8f3e7", rough=0.9, spec=0.2)
    m["cover_teal"] = aa.make_mat("cover_teal", "#7cc0b2", rough=0.55)
    m["cover_lav"] = aa.make_mat("cover_lavender", "#b9a7e0", rough=0.55)
    m["cover_mint"] = aa.make_mat("cover_mint", "#bfe6d4", rough=0.55)
    m["cover_sky"] = aa.make_mat("cover_sky", "#a9cfe8", rough=0.55)
    m["cover_coral"] = aa.make_mat("cover_coral", "#f2a6a0", rough=0.55)
    m["shade_lav"] = aa.make_mat("shade_lavender", "#c7b8e8", rough=0.28, spec=0.55, coat=0.4, coat_rough=0.15)
    m["shade_inner"] = aa.make_mat("shade_inner", "#fff5e6", rough=0.5, emission="#fff0d8", emit=1.5)
    m["cord"] = aa.make_mat("cord_grey", "#c9c2b6", rough=0.7)
    m["lamp_dome"] = aa.make_mat("lamp_dome", "#fff4e1", rough=0.32, emission="#fff0d4", emit=0.6)
    m["pencil_c"] = aa.make_mat("pencil_coral", "#f2998f", rough=0.5)
    m["pencil_m"] = aa.make_mat("pencil_mint", "#7fc8ab", rough=0.5)
    m["pencil_s"] = aa.make_mat("pencil_sky", "#8fc2e6", rough=0.5)
    m["graphite"] = aa.make_mat("graphite", "#4a4a4a", rough=0.5)
    m["petal"] = aa.make_mat("petal_pink", "#f3bfd0", rough=0.75, spec=0.3)
    m["leaf"] = aa.make_mat("leaf_green", "#7fb06a", rough=0.55, spec=0.4)
    m["glass"] = aa.make_mat("window_glass", "#ffffff", rough=0.05, spec=0.6)
    return m


# ------------------------------------------------------------------ builders
def wainscot(name, a, b, normal, z0, z1, mat, plank=0.22, groove=0.012, depth=0.008):
    a = np.array(a[:2], float)
    b = np.array(b[:2], float)
    length = np.linalg.norm(b - a)
    t = (b - a) / length
    n = np.array(normal[:2], float)
    count = max(1, round(length / plank))
    pw = length / count
    pts = []
    for i in range(count):
        s0 = i * pw
        for s, d in [(s0, -depth), (s0 + groove, 0.0), (s0 + pw - groove, 0.0)]:
            pts.append(a + t * s + n * d)
    pts.append(b - n * depth)
    pts = np.array(pts)
    lo = np.column_stack([pts, np.full(len(pts), z0)])
    hi = np.column_stack([pts, np.full(len(pts), z1)])
    verts = list(lo) + list(hi)
    m = len(pts)
    faces = [(i, i + 1, i + 1 + m, i + m) for i in range(m - 1)]
    return aa.obj_from(name, verts, faces, mat, sharp_deg=25.0)


def arch_outline(width, sill, spring, n=20):
    """Semicircular-arch window outline, counter-clockwise, in (u, z)."""
    r = width / 2
    pts = [(r, sill)]
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts.append((-r, sill))
    return pts


def to_wall(pts, x, cy):
    return [(x, cy + u, v) for u, v in pts]


def build_shell(M):
    parts = []
    # Floor slab, walls and ceiling are finite-thickness boxes so bake rays cannot leak.
    floor = aa.obj_from(
        "floor",
        [(X0 - 0.4, Y0 - 0.4, 0), (X1 + 0.4, Y0 - 0.4, 0), (X1 + 0.4, Y1 + 0.4, 0), (X0 - 0.4, Y1 + 0.4, 0)],
        [(0, 1, 2, 3)],
        M["floor"],
        smooth=False,
    )
    aa.uv_planar(floor, scale=1 / 1.7, rotate=True)
    parts.append(floor)
    ceil = aa.obj_from(
        "ceiling",
        [(X0 - 0.4, Y0 - 0.4, H), (X0 - 0.4, Y1 + 0.4, H), (X1 + 0.4, Y1 + 0.4, H), (X1 + 0.4, Y0 - 0.4, H)],
        [(0, 1, 2, 3)],
        M["ceiling"],
        smooth=False,
    )
    parts.append(ceil)

    def wall_box(name, xa, xb, ya, yb):
        ob = aa.obj_from(
            name,
            [(xa, ya, 0), (xb, ya, 0), (xb, yb, 0), (xa, yb, 0), (xa, ya, H), (xb, ya, H), (xb, yb, H), (xa, yb, H)],
            [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
            M["wall"],
            smooth=False,
        )
        return ob

    parts.append(wall_box("wall_right", X1, X1 + 0.3, Y0 - 0.3, Y1 + 0.3))
    parts.append(wall_box("wall_far", X0 - 0.35, X1 + 0.3, Y1, Y1 + 0.3))
    parts.append(wall_box("wall_back", X0 - 0.35, X1 + 0.3, Y0 - 0.3, Y0))

    # Window wall with real openings.
    left = wall_box("wall_left", X0 - 0.35, X0, Y0 - 0.3, Y1 + 0.3)
    cutters = []
    for i, cy in enumerate(window_centers()):
        out = arch_outline(WIN_W, WIN_SILL, WIN_SPRING, 24)
        ring0 = to_wall(out, X0 - 0.5, cy)
        ring1 = to_wall(out, X0 + 0.15, cy)
        cutters.append(aa.loft(f"cut{i}", [ring0, ring1], None, sharp_deg=None))
    cutter = aa.join(cutters, "window_cutter")
    bpy.context.view_layer.update()
    mod = left.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    aa.apply_modifiers(left)
    bpy.data.objects.remove(cutter, do_unlink=True)
    parts.append(left)
    return parts


def build_windows(M):
    baked, glass = [], []
    bar_w, bar_d = 0.045, 0.06
    frame_w, frame_d = 0.085, 0.09
    x_plane = X0 - 0.2
    sec_bar = aa.rrect_pts(bar_w, bar_d, 0.012, seg=2)
    sec_frame = aa.rrect_pts(frame_w, frame_d, 0.016, seg=2)
    sec_case = aa.rrect_pts(0.16, 0.06, 0.018, seg=3)

    for i, cy in enumerate(window_centers()):
        r = WIN_W / 2
        out = arch_outline(WIN_W - 0.06, WIN_SILL + 0.03, WIN_SPRING, 28)
        path = to_wall(out, x_plane, cy)
        baked.append(aa.sweep(f"w{i}_frame", path, sec_frame, (1, 0, 0), closed=True, mat=M["birch"]))
        # Interior casing following the arch, chunky like the concept's timber arches.
        case_out = arch_outline(WIN_W + 0.12, WIN_SILL, WIN_SPRING, 28)
        case_path = to_wall(case_out, X0 + 0.015, cy)
        baked.append(aa.sweep(f"w{i}_case", case_path, sec_case, (1, 0, 0), closed=False, mat=M["birch"]))
        # Muntins: vertical and horizontal lights below the spring line, fan above.
        for u in (-0.42, 0.42):
            baked.append(aa.sweep(f"w{i}_v{u}", to_wall([(u, WIN_SILL), (u, WIN_SPRING)], x_plane, cy), sec_bar, (1, 0, 0), mat=M["birch"]))
        for z in (WIN_SILL + 0.52, WIN_SILL + 1.04, WIN_SPRING):
            baked.append(aa.sweep(f"w{i}_h{z}", to_wall([(-r, z), (r, z)], x_plane, cy), sec_bar, (1, 0, 0), mat=M["birch"]))
        # Fan: inner ring and spokes.
        ring_r = 0.62
        ring = [(ring_r * math.cos(math.pi * k / 18), WIN_SPRING + ring_r * math.sin(math.pi * k / 18)) for k in range(19)]
        baked.append(aa.sweep(f"w{i}_ring", to_wall(ring, x_plane, cy), sec_bar, (1, 0, 0), mat=M["birch"]))
        for a in (30, 60, 90, 120, 150):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            spoke = [(ring_r * ca, WIN_SPRING + ring_r * sa), ((r - 0.05) * ca, WIN_SPRING + (r - 0.05) * sa)]
            baked.append(aa.sweep(f"w{i}_s{a}", to_wall(spoke, x_plane, cy), sec_bar, (1, 0, 0), mat=M["birch"]))
        pane = to_wall(arch_outline(WIN_W - 0.08, WIN_SILL, WIN_SPRING, 28), x_plane, cy)
        glass.append(aa.obj_from(f"w{i}_pane", pane, [tuple(range(len(pane)))], M["glass"], smooth=False))
        # Deep sill board with a bullnose.
        sill = aa.rbox(f"w{i}_sill", (0.46, WIN_W + 0.3, 0.07), 0.028, center=(X0 - 0.04, cy, WIN_SILL - 0.05), mat=M["birch"], corner=0.03)
        baked.append(sill)
    return baked, glass


def build_wainscot(M):
    parts = []
    z_top = 1.1
    # (a, b, inward normal) per wall; mint boards, a cap rail and a baseboard.
    walls = [
        ("far", (X0, Y1), (X1, Y1), (0, -1, 0)),
        ("right", (X1, Y1), (X1, Y0), (-1, 0, 0)),
        ("back", (X1, Y0), (X0, Y0), (0, 1, 0)),
        ("left", (X0, Y0), (X0, Y1), (1, 0, 0)),
    ]
    for name, a, b, n in walls:
        na = np.array(n[:2], float)
        a3 = (*(np.array(a) + na * 0.02), 0)
        b3 = (*(np.array(b) + na * 0.02), 0)
        parts.append(wainscot(f"wains_{name}", a3, b3, n, 0.0, z_top, M["wainscot"]))
        a2 = np.array(a) + na * 0.022
        b2 = np.array(b) + na * 0.022
        cap_sec = aa.rrect_pts(0.075, 0.065, 0.022, seg=3)
        cap = aa.sweep(f"cap_{name}", [(*a2, z_top), (*b2, z_top)], cap_sec, (0, 0, 1), mat=M["trim"])
        parts.append(cap)
        base_sec = aa.rrect_pts(0.05, 0.16, 0.012, seg=2)
        base = aa.sweep(f"base_{name}", [(*(np.array(a) + na * 0.022), 0.08), (*(np.array(b) + na * 0.022), 0.08)], base_sec, (0, 0, 1), mat=M["trim"])
        parts.append(base)
        crown_sec = aa.rrect_pts(0.09, 0.09, 0.03, seg=3)
        crown = aa.sweep(f"crown_{name}", [(*a2, H - 0.05), (*b2, H - 0.05)], crown_sec, (0, 0, 1), mat=M["trim"])
        parts.append(crown)
    return parts


def build_beams(M):
    parts = []
    ys = [Y1 - 0.4, Y1 - 3.4, Y1 - 6.4, Y1 - 9.4, Y1 - 12.4]
    for i, y in enumerate(ys):
        beam = aa.rbox(f"beam{i}", (X1 - X0 - 0.02, 0.26, 0.34), 0.035, center=(0, y, H - 0.32), mat=M["birch"], seg=3, corner=0.035)
        parts.append(beam)
        # Curved knee braces into the side walls.
        for sign, x in ((-1, X0 + 0.02), (1, X1 - 0.02)):
            if sign < 0 and i in (1, 2, 3):
                pass
            pts = []
            for k in range(9):
                a = (math.pi / 2) * k / 8
                pts.append((x - sign * 0.9 * (1 - math.cos(a)), y, H - 0.26 - 0.9 * math.sin(a)))
            sec = aa.rrect_pts(0.17, 0.2, 0.04, seg=2)
            parts.append(aa.sweep(f"brace{i}{sign}", pts, sec, (0, 1, 0), mat=M["birch"]))
    return parts


def board_outline(w, z0, spring, top, n=24, expo=2.5):
    """Basket-handle arch: superellipse upper half over straight sides."""
    a = w / 2
    b = top - spring
    pts = [(a, z0)]
    for i in range(n + 1):
        t = math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / expo), c)
        z = spring + b * abs(s) ** (2 / expo)
        pts.append((x, z))
    pts.append((-a, z0))
    return pts


def font_mesh(name, body, size, mat, extrude, bevel, align="CENTER", spacing=1.0, line=0.92, resolution=3):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.font = bpy.data.fonts.load(f"{aa.CACHE}/jakarta-800.ttf")
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    curve.offset = 0
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.space_character = spacing
    curve.space_line = line
    curve.resolution_u = resolution
    ob = aa.link(bpy.data.objects.new(name, curve))
    aa.activate(ob)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    ob.name = name
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(45):
            e.smooth = False
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def cap_mark(name, size, mat, extrude=0.012, bevel=0.007):
    """Flat graduation cap: board diamond, skull band and tassel, all in one curve."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = extrude
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2

    def poly(pts):
        s = curve.splines.new("POLY")
        s.points.add(len(pts) - 1)
        for p, (x, y) in zip(s.points, pts):
            p.co = (x * size, y * size, 0, 1)
        s.use_cyclic_u = True

    poly([(-1.0, 0.25), (0.0, 0.62), (1.0, 0.25), (0.0, -0.12)])
    poly([(-0.58, 0.02), (0.0, -0.21), (0.58, 0.02), (0.58, -0.32), (0.32, -0.53), (0.0, -0.61), (-0.32, -0.53), (-0.58, -0.32)])
    poly([(0.86, 0.13), (0.92, 0.1), (0.92, -0.38), (0.86, -0.38)])
    poly([(0.8, -0.38), (0.98, -0.38), (1.0, -0.68), (0.78, -0.68)])
    ob = aa.link(bpy.data.objects.new(name, curve))
    aa.activate(ob)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    ob.name = name
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(45):
            e.smooth = False
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def build_board(M):
    parts = []
    y_face = Y1
    cx = BOARD_CX

    def plane(points, y):
        return [(cx + u, y, v) for u, v in points]

    outline = board_outline(BOARD_W, BOARD_Z0, BOARD_SPRING, BOARD_TOP)
    # Arch moulding on the wall.
    mould = board_outline(BOARD_W + 0.62, BOARD_Z0 - 0.0, BOARD_SPRING + 0.02, BOARD_TOP + 0.28)
    sec_mould = aa.rrect_pts(0.17, 0.05, 0.02, seg=3)
    parts.append(aa.sweep("board_mould", plane(mould, y_face - 0.02), sec_mould, (0, -1, 0), mat=M["trim"]))
    # Board surface.
    face = plane(outline, y_face - 0.04)
    parts.append(aa.obj_from("board_face", face, [tuple(range(len(face)))], M["board"], smooth=False))
    # Timber frame.
    sec_frame = aa.rrect_pts(0.13, 0.08, 0.024, seg=3)
    parts.append(aa.sweep("board_frame", plane(outline, y_face - 0.05), sec_frame, (0, -1, 0), closed=True, mat=M["birch"]))
    # Chalk ledge with an eraser and chalk.
    ledge = aa.rbox("board_ledge", (BOARD_W + 0.1, 0.12, 0.045), 0.018, center=(cx, y_face - 0.1, BOARD_Z0 - 0.09), mat=M["birch"], corner=0.03)
    parts.append(ledge)
    parts.append(aa.rbox("eraser", (0.2, 0.07, 0.05), 0.012, center=(cx + 2.2, y_face - 0.11, BOARD_Z0 - 0.045), mat=M["cover_coral"]))
    # Wordmark and cap mark, extruded letters like the concept's raised lettering.
    text = font_mesh("wordmark", "Agent\nAcademy", 0.66, M["letters"], 0.016, 0.009)
    aa.transform(text, loc=(cx, y_face - 0.06, 2.22), rot=(math.pi / 2, 0, 0))
    parts.append(text)
    cap = cap_mark("cap_mark", 0.34, M["letters"])
    aa.transform(cap, loc=(cx, y_face - 0.06, 3.26), rot=(math.pi / 2, 0, 0))
    parts.append(cap)
    return parts


def build_rug(M):
    parts = []
    w, length = 2.5, 9.0
    cy = -(5.9 + -3.1) / 2  # three z from -3.1 to 5.9
    t = 0.016
    prof = aa.round_profile(t, 0.007, 0.0, 3)
    border = aa.rr_loft("rug_border", w, length, 0.05, prof, (0, cy), M["rug_border"], seg=4, sharp_deg=70.0)
    parts.append(border)
    inner_prof = aa.round_profile(0.005, 0.0035, t, 2)
    field = aa.rr_loft("rug_field", w - 0.3, length - 0.3, 0.04, inner_prof, (0, cy), M["rug_field"], seg=4, sharp_deg=70.0)
    aa.uv_planar(field, scale=1 / 0.36)
    parts.append(field)
    return parts


def build_desk(M):
    parts = []
    D = LAY["TEACHER_DESK"]
    w, d = D["w"], D["d"]
    cx, cy = D["x"], -D["z"]
    # Plinth.
    parts.append(aa.rr_loft("d_plinth", w, d, 0.2, [(0.05, 0.0), (0.0, 0.05), (0.0, 0.11), (0.03, 0.14)], (cx, cy), M["desk_ivory"], seg=8, sharp_deg=60))
    cap_w = 0.46
    # Rounded end pillars.
    for sx in (-1, 1):
        x = cx + sx * (w / 2 - cap_w / 2 - 0.035)
        parts.append(aa.rr_loft(f"d_pillar{sx}", cap_w, d - 0.08, 0.2, [(0.0, 0.11), (0.0, 0.9)], (x, cy), M["desk_ivory"], seg=10, cap0=False, cap1=False, sharp_deg=70))
    # Hidden core keeps the planks from looking hollow.
    parts.append(aa.rbox("d_core", (w - 0.3, d - 0.2, 0.86), 0.02, center=(cx, cy, 0.08), mat=M["desk_mint"]))
    # Mint planks, front and back, between the pillars.
    span = w / 2 - cap_w - 0.03
    y_front = cy - (d / 2 - 0.05)
    y_back = cy + (d / 2 - 0.05)
    parts.append(wainscot("d_front", (cx - span, y_front, 0), (cx + span, y_front, 0), (0, -1, 0), 0.13, 0.86, M["desk_mint"], plank=0.21, groove=0.012, depth=0.012))
    parts.append(wainscot("d_back", (cx + span, y_back, 0), (cx - span, y_back, 0), (0, 1, 0), 0.13, 0.86, M["desk_mint"], plank=0.21, groove=0.012, depth=0.012))
    # Rails above and below the planks.
    for y, z in ((y_front, 0.14), (y_front, 0.85), (y_back, 0.14), (y_back, 0.85)):
        sec = aa.rrect_pts(0.04, 0.05, 0.012, seg=2)
        parts.append(aa.sweep(f"d_rail{y}{z}", [(cx - span - 0.03, y, z), (cx + span + 0.03, y, z)], sec, (0, 0, 1), mat=M["desk_ivory"]))
    # Thick bullnose top, ivory.
    top_prof = [(0.05, 0.875), (0.018, 0.885), (0.0, 0.92)] + [(0.05 * (1 - math.cos(a)), 0.97 + 0.05 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 7)]
    parts.append(aa.rr_loft("d_top", w + 0.1, d + 0.1, 0.26, top_prof, (cx, cy), M["desk_ivory"], seg=10, sharp_deg=70))
    return parts


def book(name, w, d, t, cover, M, tilt=0.0, loc=(0, 0, 0)):
    """A closed book: cover shell (two boards and a rounded spine) around a paper block."""
    r = 0.004
    parts = [
        aa.rbox("c_top", (w, d, 0.006), r, center=(0, 0, t - 0.006), mat=cover, seg=2),
        aa.rbox("c_bot", (w, d, 0.006), r, center=(0, 0, 0), mat=cover, seg=2),
        aa.rbox("c_spine", (0.02, d, t), 0.008, center=(-w / 2 + 0.008, 0, 0), mat=cover, seg=2),
        aa.rbox("c_paper", (w - 0.03, d - 0.018, t - 0.012), 0.002, center=(0.008, 0, 0.006), mat=M["paper"], seg=1),
    ]
    ob = aa.join(parts, name)
    aa.transform(ob, loc=loc, rot=(0, 0, tilt))
    return ob


def build_props(M):
    baked, dyn = [], []
    D = LAY["TEACHER_DESK"]
    cx, cy = D["x"], -D["z"]
    z = DESK_H
    # Book stack, front-left of the desk, spines toward the student.
    bx, by = cx - 1.02, cy - 0.12
    baked.append(book("book_a", 0.34, 0.24, 0.05, M["cover_mint"], M, tilt=0.06, loc=(bx, by, z)))
    baked.append(book("book_b", 0.31, 0.22, 0.045, M["cover_lav"], M, tilt=-0.08, loc=(bx - 0.01, by + 0.01, z + 0.05)))
    baked.append(book("book_c", 0.28, 0.2, 0.04, M["cover_teal"], M, tilt=0.2, loc=(bx + 0.01, by, z + 0.095)))
    # Pencil cup.
    px, py = cx - 0.55, cy - 0.1
    prof = [(0, 0), (0.05, 0), (0.056, 0.008), (0.058, 0.13), (0.052, 0.135), (0.05, 0.13), (0.048, 0.01), (0, 0.01)]
    baked.append(aa.lathe("cup", prof, 28, center=(px, py, z), mat=M["ceramic"], sharp_deg=70))
    pencils = [("pencil_c", 0.015, 0.018, 0.1, -0.06), ("pencil_m", -0.018, 0.01, -0.09, 0.05), ("pencil_s", 0.005, -0.02, 0.04, 0.1), ("pencil_c", -0.02, -0.012, -0.12, -0.05)]
    for i, (mat, dx, dy, rx, ry) in enumerate(pencils):
        body = aa.lathe(f"pencil{i}b", [(0, 0), (0.0055, 0), (0.0055, 0.19), (0.0, 0.215)], 6, mat=M[mat], sharp_deg=70)
        aa.transform(body, loc=(px + dx, py + dy, z + 0.01), rot=(rx, ry, 0))
        baked.append(body)
    # Laptop: back of the lid to the student.
    lx, ly = cx - 0.05, cy + 0.03
    base = aa.rbox("lap_base", (0.36, 0.25, 0.016), 0.006, center=(0, 0, 0), mat=M["silver"], seg=2, corner=0.012)
    lid = aa.rbox("lap_lid", (0.36, 0.24, 0.01), 0.004, center=(0, 0, 0), mat=M["silver"], seg=2, corner=0.012)
    # Lid hinged at the back edge of the base, opening toward the student side (+y is away from the student).
    aa.transform(lid, loc=(0, -0.12, 0.012), rot=(math.radians(115), 0, 0))
    logo = cap_mark("lap_logo", 0.035, M["ceramic"], extrude=0.0012, bevel=0.0012)
    aa.transform(logo, loc=(0, -0.1, 0.11), rot=(math.radians(115) - math.pi, math.pi, 0))
    logo.data.transform(Matrix.Translation((0, 0, 0)))
    lap = aa.join([base, lid, logo], "laptop")
    aa.transform(lap, loc=(lx, ly, z), rot=(0, 0, math.pi))
    baked.append(lap)
    # Mushroom lamp.
    mx, my = cx + 0.55, cy + 0.08
    baked.append(aa.lathe("lamp_base", [(0, 0), (0.075, 0), (0.08, 0.012), (0.075, 0.02), (0.018, 0.03), (0.0, 0.03)], 32, center=(mx, my, z), mat=M["brass"], sharp_deg=70))
    baked.append(aa.lathe("lamp_stem", [(0.016, 0), (0.016, 0.19), (0.006, 0.2), (0, 0.2)], 16, center=(mx, my, z + 0.02), mat=M["ceramic"], sharp_deg=70))
    dome_prof = [(0.025, 0.205)] + [(0.14 * math.cos(a) + 0.01, 0.235 + 0.12 * math.sin(a)) for a in np.linspace(-0.25, math.pi / 2, 14)] + [(0, 0.355)]
    baked.append(aa.lathe("lamp_dome", dome_prof, 36, center=(mx, my, z), mat=M["lamp_dome"], sharp_deg=70))
    # Flowers in a ceramic vase: petals stay out of the lightmap, they are small and many.
    vx, vy = cx + 1.1, cy - 0.1
    baked.append(aa.lathe("vase", [(0, 0), (0.05, 0), (0.078, 0.05), (0.078, 0.1), (0.052, 0.16), (0.05, 0.175), (0.058, 0.18), (0.045, 0.17), (0, 0.15)], 32, center=(vx, vy, z), mat=M["ceramic"], sharp_deg=70))
    dyn += flowers(vx, vy, z + 0.17, M)
    return baked, dyn


def flowers(cx, cy, cz, M):
    """Hydrangea heads: small four-petal florets scattered over spheres, plus leaves."""
    rng = np.random.default_rng(7)
    heads = [((0.0, 0.0, 0.1), 0.115), ((-0.1, -0.02, 0.04), 0.09), ((0.095, 0.03, 0.05), 0.09), ((0.0, -0.08, 0.02), 0.085)]
    verts, faces = [], []

    def add(v, f):
        i = len(verts)
        verts.extend(v)
        faces.extend([tuple(a + i for a in q) for q in f])

    petal_outline = [(0.0, 0.0), (0.028, -0.018), (0.045, 0.0), (0.028, 0.018)]
    for (hx, hy, hz), rad in heads:
        hx += cx
        hy += cy
        hz += cz
        for _ in range(int(rad * 1500)):
            d = rng.normal(size=3)
            d = d / np.linalg.norm(d)
            d[2] = abs(d[2]) * 1.0 + 0.05
            d /= np.linalg.norm(d)
            r = rad * (0.86 + 0.14 * rng.random())
            p = np.array([hx, hy, hz]) + d * r
            nor = Vector(d)
            q = nor.to_track_quat("Z", "Y").to_matrix()
            spin = rng.random() * math.pi
            scale = (0.8 + 0.5 * rng.random()) * 0.55
            for k in range(4):
                a = spin + k * math.pi / 2
                ca, sa = math.cos(a), math.sin(a)
                ring = []
                for u, v in petal_outline:
                    x = (u * ca - v * sa) * scale
                    y = (u * sa + v * ca) * scale
                    pos = Vector((x, y, 0.012 * (u / 0.045) ** 2))
                    ring.append(tuple(np.array(q @ pos) + p))
                add(ring, [(0, 1, 2, 3)])
    ob_p = aa.obj_from("flowers", verts, faces, M["petal"], smooth=False)
    # Colour variation lives in a vertex colour layer that the runtime material reads.
    col = ob_p.data.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
    tone = np.empty(len(col.data) * 4, np.float32)
    cols = np.array([srgb("#f7c9d8")[:3], srgb("#efa9c2")[:3], srgb("#fbdde2")[:3]], np.float32)
    n_face_quads = len(ob_p.data.polygons)
    quad_tone = cols[rng.integers(0, 3, n_face_quads)]
    for i in range(n_face_quads):
        for li in ob_p.data.polygons[i].loop_indices:
            tone[li * 4 : li * 4 + 3] = quad_tone[i]
            tone[li * 4 + 3] = 1
    col.data.foreach_set("color", tone)

    # Leaves.
    verts2, faces2 = [], []

    def leaf(base, direction, length, width):
        d = Vector(direction).normalized()
        side = d.cross(Vector((0, 0, 1))).normalized()
        n = side.cross(d)
        steps = 8
        ring_l, ring_r, center = [], [], []
        for i in range(steps + 1):
            t = i / steps
            w = width * math.sin(math.pi * t) ** 0.8
            bend = -0.4 * length * t * t
            p = Vector(base) + d * (t * length) + n * bend
            ring_l.append(tuple(p + side * w))
            ring_r.append(tuple(p - side * w))
            center.append(tuple(p + n * 0.006))
        i0 = len(verts2)
        verts2.extend(ring_l + center + ring_r)
        for i in range(steps):
            a, b, c = i0 + i, i0 + steps + 1 + i, i0 + 2 * (steps + 1) + i
            faces2.append((a, a + 1, b + 1, b))
            faces2.append((b, b + 1, c + 1, c))

    for ang in np.linspace(0, 2 * math.pi, 7, endpoint=False):
        leaf((cx, cy, cz - 0.01), (math.cos(ang), math.sin(ang), 0.35 + 0.25 * rng.random()), 0.16, 0.05)
    ob_l = aa.obj_from("flower_leaves", verts2, faces2, M["leaf"], smooth=True)
    return [ob_p, ob_l]


def build_pendant(M):
    parts = []
    px, py = 3.05, 1.2
    drop = H - 0.95
    parts.append(aa.lathe("p_cord", [(0, drop + 0.3), (0.006, drop + 0.3), (0.006, H - 0.01), (0, H - 0.01)], 8, center=(px, py, 0), mat=M["cord"], sharp_deg=70))
    parts.append(aa.lathe("p_rose", [(0, 0), (0.09, 0), (0.08, -0.02), (0.03, -0.045), (0, -0.05)], 24, center=(px, py, H), mat=M["brass"], sharp_deg=70))
    z0 = drop
    shade = [(0.33, -0.002), (0.335, 0.008), (0.325, 0.03)]
    for a in np.linspace(0.06, math.pi / 2, 18):
        # Enamel dome: wide skirt, soft shoulder, narrow top.
        shade.append((0.325 * math.cos(a) ** 0.72 + 0.03, 0.03 + 0.33 * math.sin(a) ** 1.3))
    shade += [(0.0, 0.365)]
    parts.append(aa.lathe("p_shade", shade, 48, center=(px, py, z0), mat=M["shade_lav"], sharp_deg=70))
    inner = [(0.32, 0.004), (0.26, 0.15), (0.1, 0.3), (0, 0.31)]
    parts.append(aa.lathe("p_inner", inner, 32, center=(px, py, z0), mat=M["shade_inner"], sharp_deg=70))
    parts.append(aa.lathe("p_collar", [(0.055, 0.352), (0.066, 0.36), (0.066, 0.405), (0.055, 0.42), (0.0, 0.42)], 24, center=(px, py, z0), mat=M["brass"], sharp_deg=70))
    bulb = [(0, 0.04), (0.04, 0.05), (0.06, 0.09), (0.05, 0.14), (0.02, 0.18), (0, 0.19)]
    parts.append(aa.lathe("p_bulb", bulb, 16, center=(px, py, z0), mat=M["shade_inner"], sharp_deg=70))
    return parts


def setup_world_and_lights(bake=False):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(f"{aa.CACHE}/ph/meadow_2_2k.hdr")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(float(os.environ.get("AA_HDR_ROT", "200")))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Generated"], mapping.inputs[0])
    nt.links.new(mapping.outputs[0], env.inputs[0])
    bg = nt.nodes["Background"]
    nt.links.new(env.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 2.6

    d = Vector((0.82, -0.12, -0.56)).normalized()
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.4
    sun.color = (1.0, 0.98, 0.94)
    sun.angle = math.radians(2.5)
    sun_ob = aa.link(bpy.data.objects.new("sun", sun))
    sun_ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    # Broad, invisible ceiling fill: the concept is high key, with no dark corners.
    fill = bpy.data.lights.new("fill", "AREA")
    fill.shape = "RECTANGLE"
    fill.size = 9.0
    fill.size_y = 11.0
    fill.energy = 300.0
    fill.color = (0.97, 0.985, 1.0)
    fill_ob = aa.link(bpy.data.objects.new("fill", fill))
    fill_ob.location = (0.5, 0, H - 0.3)
    fill_ob.visible_camera = False
    fill_ob.visible_glossy = False

    # Pendant and desk lamp, small and warm.
    for name, loc, power, radius in (("pendant", (3.05, 1.2, H - 1.02), 25.0, 0.1), ("desk_lamp", (LAY["TEACHER_DESK"]["x"] + 0.55, -LAY["TEACHER_DESK"]["z"] + 0.08, DESK_H + 0.2), 4.0, 0.05)):
        l = bpy.data.lights.new(name, "POINT")
        l.energy = power
        l.color = (1.0, 0.9, 0.78)
        l.shadow_soft_size = radius
        ob = aa.link(bpy.data.objects.new(name, l))
        ob.location = loc


def build_scene():
    aa.clear_scene()
    bpy.ops.object.select_all(action="DESELECT")
    M = build_materials()
    baked = []
    baked += build_shell(M)
    windows, glass = build_windows(M)
    baked += windows
    baked += build_wainscot(M)
    baked += build_beams(M)
    baked += build_board(M)
    baked += build_rug(M)
    baked += build_desk(M)
    props, dyn = build_props(M)
    baked += props
    baked += build_pendant(M)
    for o in baked + dyn + glass:
        aa.ensure_uv(o)
    static = aa.join(baked, "ClassroomStatic")
    dynamic = aa.join(dyn, "ClassroomProps")
    glass_ob = aa.join(glass, "ClassroomGlass")
    return static, dynamic, glass_ob, M


def import_teacher_shadow():
    if not os.path.exists(SHADOW_BLEND):
        print("teacher.blend not found; baking without the teacher shadow")
        return None
    with bpy.data.libraries.load(SHADOW_BLEND, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith("TeacherBake")]
    objs = []
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
        o.select_set(False)
        objs.append(o)
    t = LAY["TEACHER"]
    for o in objs:
        if o.parent is None:
            o.location = (t["x"], -t["z"], 0)
    return objs


def lightmap_uv(ob):
    aa.activate(ob)
    ob.data.uv_layers.new(name="lm")
    ob.data.uv_layers.active = ob.data.uv_layers["lm"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=0.004, area_weight=0.7, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.data.uv_layers["lm"].active_render = False
    ob.data.uv_layers["UVMap"].active_render = True


def bake_lightmap(ob, size, samples):
    scene = bpy.context.scene
    img = bpy.data.images.new("lm_raw", size, size, alpha=False, float_buffer=True)
    for mat in ob.data.materials:
        n = mat.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "bake_target"
        n.select = True
        mat.node_tree.nodes.active = n
    ob.data.uv_layers.active = ob.data.uv_layers["lm"]
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 12
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_clear = True
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    aa.activate(ob)
    print("bake start")
    bpy.ops.object.bake(type="DIFFUSE")
    print("bake end")
    path = os.path.join(aa.WORK, "lm_raw.exr")
    img.filepath_raw = path
    img.file_format = "OPEN_EXR"
    img.save()
    for mat in ob.data.materials:
        mat.node_tree.nodes.remove(mat.node_tree.nodes["bake_target"])
    return path


def denoise_exr(src):
    """OIDN pass over the baked atlas through Blender's compositor."""
    scene = bpy.context.scene
    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    im = nt.nodes.new("CompositorNodeImage")
    im.image = bpy.data.images.load(src, check_existing=True)
    dn = nt.nodes.new("CompositorNodeDenoise")
    dn.prefilter = "ACCURATE"
    dn.use_hdr = True
    out = nt.nodes.new("CompositorNodeOutputFile")
    out.base_path = aa.WORK
    out.format.file_format = "OPEN_EXR"
    out.format.color_depth = "32"
    out.file_slots[0].path = "lm_denoised"
    comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(im.outputs[0], dn.inputs["Image"])
    nt.links.new(dn.outputs[0], out.inputs[0])
    nt.links.new(dn.outputs[0], comp.inputs[0])
    scene.frame_set(1)
    w, h = im.image.size
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = os.path.join(aa.WORK, "lm_dn_unused.png")
    bpy.ops.render.render(write_still=True)
    scene.use_nodes = False
    return os.path.join(aa.WORK, "lm_denoised0001.exr")


LM_RANGE = 1.6


def encode_webp(arr, name, quality=88):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.dstack([arr, np.ones((h, w), np.float32)]).astype(np.float32).ravel())
    scene = bpy.context.scene
    prev = scene.render.image_settings.file_format
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = quality
    out = os.path.join(aa.OUT, name)
    img.save_render(out, scene=scene)
    bpy.data.images.remove(img)
    print("wrote", out, os.path.getsize(out))
    scene.render.image_settings.file_format = prev


def write_lightmap(denoised):
    """sRGB-encoded lightmap with a soft shoulder so sun patches stay on the 8-bit range."""
    px = aa.image_to_numpy(denoised)[..., :3]
    px = np.clip(px, 0, None) * float(os.environ.get("AA_LM_EXPOSURE", "1.0"))
    gains = np.array([float(x) for x in os.environ.get("AA_LM_GAINS", "1.0,1.0,1.0").split(",")], np.float32)
    px = px * gains
    white = float(os.environ.get("AA_LM_WHITE", "2.6"))
    mapped = px * (1 + px / (white * white)) / (1 + px)
    # LM_RANGE is the fixed scale the runtime multiplies back (ClassroomWorld.tsx).
    encoded = np.clip(mapped / LM_RANGE, 0, 1) ** (1 / 2.2)
    print("lm max", float(mapped.max()), "mean", float(mapped.mean()))
    encode_webp(encoded, "lightmap.webp", quality=90)


def render_env_map():
    """Interior reflection probe from the middle of the room, as an equirect webp."""
    scene = bpy.context.scene
    cam = bpy.data.cameras.new("probe")
    cam.type = "PANO"
    cam.panorama_type = "EQUIRECTANGULAR"
    ob = aa.link(bpy.data.objects.new("probe", cam))
    ob.location = (0.5, 1.0, 1.7)
    ob.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    scene.camera = ob
    scene.render.resolution_x, scene.render.resolution_y = 512, 256
    scene.cycles.samples = int(os.environ.get("AA_ENV_SAMPLES", "80"))
    scene.cycles.use_denoising = True
    scene.render.filepath = os.path.join(aa.WORK, "env_room.png")
    bpy.ops.render.render(write_still=True)
    px = aa.image_to_numpy(scene.render.filepath)[..., :3]
    encode_webp(px, "env_room.webp", quality=88)


def write_backdrop():
    """The view outside the windows: the bake's Poly Haven HDRI, softened and brightened."""
    env = aa.image_to_numpy(f"{aa.CACHE}/ph/meadow_2_2k.hdr")[..., :3]
    h, w = env.shape[:2]
    # Downscale to 2048 x 1024 by block averaging when needed, then box blur.
    px = env
    for _ in range(2):
        for ax, n in ((0, 3), (1, 3)):
            px = (np.roll(px, 1, ax) + px + np.roll(px, -1, ax)) / 3
    px = np.clip(px, 0, None) * 1.25
    px = px * (1 + px / 9.0) / (1 + px)
    px = px ** (1 / 2.2)
    # A gentle lift and saturation so it reads as a bright painted view, not a photo.
    luma = px @ np.array([0.2126, 0.7152, 0.0722])
    px = np.clip(luma[..., None] + (px - luma[..., None]) * 1.25, 0, 1)
    px = np.clip(px * 0.9 + 0.1, 0, 1)
    encode_webp(px[::-1], "backdrop_meadow.webp", quality=85)
    with open(os.path.join(aa.WORK, "backdrop_rot.txt"), "w") as f:
        f.write(os.environ.get("AA_HDR_ROT", "200"))


def export_glb(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_cameras=False,
        export_lights=False,
    )
    print("exported", path, os.path.getsize(path))


if __name__ == "__main__":
    static, dynamic, glass_ob, M = build_scene()
    setup_world_and_lights()
    aa.setup_cycles(samples=48, res=(960, 540))
    aa.spawn_camera(float(os.environ.get("AA_FOV", "50")))
    bpy.context.view_layer.update()
    teacher = import_teacher_shadow()
    # Vertex colours on the flowers are carried through a Color Attribute node.
    petal = M["petal"]
    b = petal.node_tree.nodes["Principled BSDF"]
    vc = petal.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    petal.node_tree.links.new(vc.outputs[0], b.inputs["Base Color"])
    glass_ob.hide_render = True
    if STAGE == "preview":
        out = os.path.join(aa.WORK, "room_preview.png")
        bpy.context.scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        print("wrote", out)
    else:
        lightmap_uv(static)
        if not os.environ.get("AA_SKIP_BAKE"):
            size = int(os.environ.get("AA_LM_SIZE", "2048"))
            raw = bake_lightmap(static, size, int(os.environ.get("AA_BAKE_SAMPLES", "160")))
            write_lightmap(denoise_exr(raw))
            render_env_map()
            write_backdrop()
        elif os.path.exists(os.path.join(aa.WORK, "lm_denoised0001.exr")):
            write_lightmap(os.path.join(aa.WORK, "lm_denoised0001.exr"))
        static.data.uv_layers.active = static.data.uv_layers["UVMap"]
        # Hide bake-only objects from selection and drop the teacher shadow proxy.
        if teacher:
            for t in teacher:
                bpy.data.objects.remove(t, do_unlink=True)
        glass_ob.hide_render = False
        bpy.context.view_layer.update()
        export_glb(os.path.join(aa.WORK, "classroom_raw.glb"), [static, dynamic, glass_ob])
    print(STAGE, "done")
