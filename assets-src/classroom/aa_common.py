"""Shared helpers for the Agent Academy classroom Blender scripts.

Coordinates: scripts model in Blender space (x right, y into the room toward the
board, z up). three.js space is (x, y_up, z_toward_viewer), so blender (x, y, z)
maps to three (x, z, -y) through the glTF exporter's +Y-up conversion.
"""
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

CACHE = os.environ.get("AA_CACHE_DIR", "/tmp/aa-classroom-cache")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "public", "assets", "classroom")
WORK = os.path.join(CACHE, "work")
os.makedirs(WORK, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def layout():
    """Reads the meter values the room must match straight from layout.ts."""
    src = open(os.path.join(REPO, "src/shared/world/layout.ts")).read()

    def obj(name):
        m = re.search(r"export const %s(?:: \w+)? = \{([^}]*)\}" % name, src)
        return {k: float(v) for k, v in re.findall(r"(\w+): (-?[\d.]+)", m.group(1))}

    return {n: obj(n) for n in ["ROOM", "PLAYER", "SPAWN", "TEACHER_DESK", "TEACHER"]}


def srgb(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def make_mat(name, color="#ffffff", rough=0.7, metal=0.0, spec=0.5, coat=0.0, coat_rough=0.1, sheen=0.0, emission=None, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    if isinstance(color, str):
        color = srgb(color)
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Sheen Weight"].default_value = sheen
    if emission is not None:
        b.inputs["Emission Color"].default_value = srgb(emission) if isinstance(emission, str) else emission
        b.inputs["Emission Strength"].default_value = emit
    return m


def textured_mat(name, albedo=None, normal=None, roughness=None, rough=0.7, normal_strength=1.0, spec=0.5, uv="UVMap"):
    m = make_mat(name, rough=rough, spec=spec)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv
    if albedo:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(albedo)
        t.image.colorspace_settings.name = "sRGB"
        nt.links.new(uvn.outputs[0], t.inputs[0])
        nt.links.new(t.outputs[0], b.inputs["Base Color"])
    if roughness:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(roughness)
        t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uvn.outputs[0], t.inputs[0])
        s = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs[0], s.inputs[0])
        nt.links.new(s.outputs[1], b.inputs["Roughness"])
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(normal)
        t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uvn.outputs[0], t.inputs[0])
        n = nt.nodes.new("ShaderNodeNormalMap")
        n.uv_map = uv
        n.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs[0], n.inputs["Color"])
        nt.links.new(n.outputs[0], b.inputs["Normal"])
    return m


def obj_from(name, verts, faces, mat=None, smooth=True, sharp_deg=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth
    if sharp_deg is not None:
        limit = math.radians(sharp_deg)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > limit:
                e.smooth = False
    bm.to_mesh(me)
    bm.free()
    if mat is not None:
        me.materials.append(mat)
    return ob


def rrect_pts(w, d, r, seg=6):
    """Rounded rectangle outline, counter-clockwise, 4*(seg+1) points."""
    r = max(min(r, min(w, d) / 2 - 1e-5), 1e-4)
    cx = [(w / 2 - r, -d / 2 + r, -math.pi / 2), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, math.pi / 2), (-w / 2 + r, -d / 2 + r, math.pi)]
    out = []
    for x, y, a0 in cx:
        for i in range(seg + 1):
            a = a0 + (math.pi / 2) * i / seg
            out.append((x + r * math.cos(a), y + r * math.sin(a)))
    return np.array(out)


def loft(name, rings, mat=None, cap0=True, cap1=True, sharp_deg=40.0):
    n = len(rings[0])
    verts = []
    faces = []
    for ring in rings:
        verts.extend(tuple(p) for p in ring)
    for j in range(len(rings) - 1):
        for i in range(n):
            a = j * n + i
            b = j * n + (i + 1) % n
            c = (j + 1) * n + (i + 1) % n
            d = (j + 1) * n + i
            faces.append((a, b, c, d))
    if cap0:
        faces.append(tuple(reversed(range(n))))
    if cap1:
        faces.append(tuple((len(rings) - 1) * n + i for i in range(n)))
    return obj_from(name, verts, faces, mat, sharp_deg=sharp_deg)


def rr_loft(name, w, d, r, profile, center=(0, 0), mat=None, seg=6, cap0=True, cap1=True, sharp_deg=40.0):
    """Stack of inset rounded rectangles. profile is [(inset, z), ...] from bottom to top."""
    rings = []
    for inset, z in profile:
        pts = rrect_pts(w - 2 * inset, d - 2 * inset, max(r - inset, 0.004), seg)
        rings.append(np.column_stack([pts + np.array(center), np.full(len(pts), z)]))
    return loft(name, rings, mat, cap0, cap1, sharp_deg)


def round_profile(h, r, z0=0.0, seg=4, bottom=True):
    """(inset, z) pairs for a slab with quarter-round edges."""
    out = []
    if bottom:
        for i in range(seg + 1):
            a = (math.pi / 2) * i / seg
            out.append((r * (1 - math.sin(a)), z0 + r * (1 - math.cos(a))))
    else:
        out.append((0, z0))
    for i in range(seg + 1):
        a = (math.pi / 2) * i / seg
        out.append((r * (1 - math.cos(a)), z0 + h - r + r * math.sin(a)))
    return out


def rbox(name, size, r, center=(0, 0, 0), mat=None, seg=4, corner=None):
    """Fully rounded box. size is (w, d, h), center is the bottom center."""
    w, d, h = size
    prof = round_profile(h, r, center[2], seg)
    return rr_loft(name, w, d, corner if corner is not None else r, prof, (center[0], center[1]), mat, seg=max(seg, 3), sharp_deg=55.0)


def lathe(name, profile, seg=32, center=(0, 0, 0), mat=None, sharp_deg=50.0):
    """Revolves [(r, z), ...] around z. The profile may start or end on the axis."""
    rings = []
    for r, z in profile:
        rings.append(
            np.column_stack(
                [
                    center[0] + max(r, 1e-4) * np.cos(np.linspace(0, 2 * math.pi, seg, endpoint=False)),
                    center[1] + max(r, 1e-4) * np.sin(np.linspace(0, 2 * math.pi, seg, endpoint=False)),
                    np.full(seg, center[2] + z),
                ]
            )
        )
    return loft(name, rings, mat, cap0=False, cap1=False, sharp_deg=sharp_deg)


def section_rrect(w, h, r, seg=2):
    return rrect_pts(w, h, r, seg)


def sweep(name, path, section, binormal, closed=False, mat=None, sharp_deg=55.0):
    """Sweeps a 2D section (n, b) along a 3D path. binormal is the fixed plane normal."""
    path = [np.array(p, float) for p in path]
    b = np.array(binormal, float)
    b /= np.linalg.norm(b)
    n_pts = len(path)
    rings = []
    for i in range(n_pts):
        p = path[i]
        p0 = path[(i - 1) % n_pts] if (closed or i > 0) else p
        p1 = path[(i + 1) % n_pts] if (closed or i < n_pts - 1) else p
        t0 = p - p0
        t1 = p1 - p
        if np.linalg.norm(t0) < 1e-9:
            t0 = t1
        if np.linalg.norm(t1) < 1e-9:
            t1 = t0
        t0 /= np.linalg.norm(t0)
        t1 /= np.linalg.norm(t1)
        t = t0 + t1
        t /= np.linalg.norm(t)
        n = np.cross(b, t)
        n /= np.linalg.norm(n)
        miter = 1.0 / max(np.dot(np.cross(b, t0) / np.linalg.norm(np.cross(b, t0)), n), 0.4)
        rings.append([p + n * s[0] * miter + b * s[1] for s in section])
    if closed:
        rings.append(rings[0])
    ob = loft(name, rings, mat, cap0=not closed, cap1=not closed, sharp_deg=sharp_deg)
    if closed:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.to_mesh(ob.data)
        bm.free()
    return ob


def transform(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X") @ Matrix.Diagonal((*scale, 1))
    ob.data.transform(m)
    ob.data.update()
    return ob


def join(objs, name):
    activate(objs[0])
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def apply_modifiers(ob):
    activate(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def uv_planar(ob, scale=1.0, axis="Z", uv_name="UVMap", offset=(0.0, 0.0), rotate=False):
    """World-space planar UVs, in tile repeats per meter given by scale."""
    me = ob.data
    if uv_name not in me.uv_layers:
        me.uv_layers.new(name=uv_name)
    uv = me.uv_layers[uv_name].data
    axes = {"Z": (0, 1), "X": (1, 2), "Y": (0, 2)}[axis]
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a, b = v[axes[0]], v[axes[1]]
            if rotate:
                a, b = b, a
            uv[li].uv = (a * scale + offset[0], b * scale + offset[1])


def uv_box(ob, scale=1.0, uv_name="UVMap"):
    """Per-face dominant-axis projection in meters * scale, for tileable painted surfaces."""
    me = ob.data
    if uv_name not in me.uv_layers:
        me.uv_layers.new(name=uv_name)
    uv = me.uv_layers[uv_name].data
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        pair = [(1, 2), (0, 2), (0, 1)][ax]
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (v[pair[0]] * scale, v[pair[1]] * scale)


def ensure_uv(ob, name="UVMap"):
    if name not in ob.data.uv_layers:
        ob.data.uv_layers.new(name=name)


def image_to_numpy(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    bpy.data.images.remove(img)
    return px


def numpy_to_png(arr, path, colorspace="sRGB"):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("tmp_write", w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = arr if arr.shape[2] == 4 else np.dstack([arr, np.ones((h, w), np.float32)])
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def setup_cycles(samples=64, res=(960, 540)):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.denoiser = "OPENIMAGEDENOISE"
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = "PNG"
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.cycles.max_bounces = 8
    s.cycles.diffuse_bounces = 6
    s.cycles.glossy_bounces = 3
    s.cycles.transmission_bounces = 2
    s.cycles.transparent_max_bounces = 4
    s.render.threads_mode = "FIXED"
    s.render.threads = 4


def spawn_camera(fov_deg=50.0):
    lay = layout()
    cam = bpy.data.cameras.new("Spawn")
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(fov_deg)
    ob = link(bpy.data.objects.new("Spawn", cam))
    ob.location = (lay["SPAWN"]["x"], -lay["SPAWN"]["z"], lay["PLAYER"]["eyeHeight"])
    ob.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.camera = ob
    return ob
