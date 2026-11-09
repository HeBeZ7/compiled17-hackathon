"""Qwen family display character: a soft jelly star creature, authored by script.

Run: blender -b --python qwen_star.py [-- preview]
Writes build/qwen-star.raw.glb. Runtime materials are applied in the app by node name.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

preview = "preview" in sys.argv
lib.reset()
FRONT = Vector((0, -1, 0))


def add_ball(mb, co, radius, stiffness=2.0):
    el = mb.elements.new(type="BALL")
    el.co = co
    el.radius = radius
    el.stiffness = stiffness
    return el


def add_capsule(mb, a, b, radius, stiffness=2.0):
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    el = mb.elements.new(type="CAPSULE")
    el.co = mid
    el.radius = radius
    el.stiffness = stiffness
    el.size_x = max((b - a).length / 2, 0.001)
    el.rotation = (b - a).to_track_quat("X", "Z")
    return el


def build_body():
    mb = bpy.data.metaballs.new("body_mb")
    mb.resolution = 0.012
    mb.render_resolution = 0.012
    mb.threshold = 0.6
    # Chains of overlapping balls keep every limb junction soft.
    # Big round pear body.
    add_ball(mb, (0, 0, 1.08), 1.78, 2.0)
    add_ball(mb, (0, 0.02, 0.72), 1.62, 2.0)
    add_ball(mb, (-0.60, -0.03, 0.52), 1.02, 2.0)
    add_ball(mb, (0.60, -0.03, 0.52), 1.02, 2.0)
    # Ears: short fat lobes that curl outward.
    for co, r in (((-0.52, 0.0, 1.98), 0.62), ((-0.70, 0.02, 2.40), 0.56)):
        add_ball(mb, co, r, 2.0)
    for co, r in (((0.56, 0.0, 1.95), 0.60), ((0.92, 0.03, 2.30), 0.54)):
        add_ball(mb, co, r, 2.0)
    # Arms: tiny rounded stubs.
    for sign in (-1, 1):
        for co, r in (((sign * 1.2, -0.06, 0.96), 0.62), ((sign * 1.5, -0.10, 0.74), 0.48)):
            add_ball(mb, co, r, 2.0)
    # Feet: low lobes that keep it grounded.
    for sign in (-1, 1):
        add_ball(mb, (sign * 0.62, -0.42, 0.08), 0.72, 2.0)
    obj = bpy.data.objects.new("body_mb", mb)
    lib.ensure_coll().objects.link(obj)
    bpy.context.view_layer.update()
    lib.activate(obj)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.view_layer.objects.active
    mesh_obj.name = "body"
    # Even out the metaball surface and keep a soft look.
    rem = mesh_obj.modifiers.new("rem", "REMESH")
    rem.mode = "VOXEL"
    rem.voxel_size = 0.018
    rem.use_smooth_shade = True
    sm = mesh_obj.modifiers.new("smooth", "LAPLACIANSMOOTH")
    sm.iterations = 30
    sm.lambda_factor = 1.0
    sm.use_volume_preserve = True
    dec = mesh_obj.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.09
    mesh_obj = lib.apply_mods(mesh_obj)
    lib.smooth_mesh(mesh_obj)
    return mesh_obj


body = build_body()
print("body tris", len(body.data.polygons))

# Trace front surface to seat the face and belly star.
tree, tb = lib.bvh_for(body)


def surface(x, z, depth=0.2):
    origin = Vector((x, -3.0, z))
    hit, normal, _, _ = tree.ray_cast(origin, Vector((0, 1, 0)))
    if hit is None:
        raise RuntimeError(f"no surface at {x}, {z}")
    return hit, normal


def lens_shape(name, center, normal, rx, rz, depth, segments=48):
    """Slightly domed ellipse pressed onto the surface."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    t = Vector((1, 0, 0))
    bt = normal.cross(t).normalized()
    t = bt.cross(normal).normalized()
    rings = 8
    prev = None
    apex = bm.verts.new(center + normal * depth)
    for r in range(1, rings + 1):
        f = r / rings
        ang = f * math.pi * 0.5
        rad = math.sin(ang)
        ring = []
        for i in range(segments):
            a = i / segments * 2 * math.pi
            p = t * math.cos(a) * rx * rad + bt * math.sin(a) * rz * rad
            p = center + p + normal * (depth * math.cos(ang))
            ring.append(bm.verts.new(p))
        if prev is None:
            for i in range(segments):
                bm.faces.new((apex, ring[i], ring[(i + 1) % segments]))
        else:
            for i in range(segments):
                bm.faces.new((prev[i], ring[i], ring[(i + 1) % segments], prev[(i + 1) % segments]))
        prev = ring
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    lib.smooth_mesh(obj)
    return obj


# Eyes: tall glossy ovals with catch lights.
eye_z = 1.5
ex = 0.46
pL, nL = surface(-ex, eye_z)
pR, nR = surface(ex, eye_z)
eye_L = lens_shape("eye_L", pL + nL * 0.005, nL, 0.11, 0.155, 0.045)
eye_R = lens_shape("eye_R", pR + nR * 0.005, nR, 0.11, 0.155, 0.045)
hl_L = lens_shape("eye_hl_L", pL + nL * 0.05 + Vector((-0.032, 0, 0.055)), nL, 0.032, 0.04, 0.012, 16)
hl_R = lens_shape("eye_hl_R", pR + nR * 0.05 + Vector((-0.032, 0, 0.055)), nR, 0.032, 0.04, 0.012, 16)

# Mouth: open happy smile with a small tongue.
mp, mn = surface(0, 1.24)
mouth_shape_pts = []
mouth = lens_shape("mouth", mp + mn * 0.004, mn, 0.12, 0.085, 0.018, 40)
# Flatten mouth top so it reads as a smile (half-moon) instead of a circle.
for v in mouth.data.vertices:
    co = v.co
    if co.z > mp.z + 0.018:
        co.z = mp.z + 0.018 + (co.z - (mp.z + 0.018)) * 0.2
mouth.data.update()
tongue = lens_shape("tongue", mp + mn * 0.018 + Vector((0, 0, -0.035)), mn, 0.058, 0.034, 0.008, 24)
# Cheeks
ck_L, cn_L = surface(-0.9, 1.27)
ck_R, cn_R = surface(0.9, 1.27)
cheek_L = lens_shape("cheek_L", ck_L + cn_L * 0.004, cn_L, 0.11, 0.075, 0.006, 24)
cheek_R = lens_shape("cheek_R", ck_R + cn_R * 0.004, cn_R, 0.11, 0.075, 0.006, 24)


def star4(name, radius, thin, z_depth, points=4, bevel=0.012):
    """Rounded 4-point sparkle star as a closed shell."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = 120
    outline = []
    for i in range(n):
        t = i / n * 2 * math.pi
        # Astroid: a true four point sparkle, fattened toward the middle.
        c, s = math.cos(t), math.sin(t)
        sx = c * abs(c) ** 1.4
        sy = s * abs(s) ** 1.4
        k = 1 + thin * 0.9 * (1 - min((sx * sx + sy * sy) ** 0.5 * 1.3, 1.0))
        outline.append((radius * sx * k, radius * sy * k))
    layers = 6
    rings = []
    for l in range(layers + 1):
        t = l / layers
        sc = (1 - (2 * abs(t - 0.5)) ** 3) ** 0.5
        z = z_depth * (t - 0.5) * 2
        ring = [bm.verts.new((x * max(sc, 0.05), z, y * max(sc, 0.05))) for x, y in outline]
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj(name, mesh)
    lib.smooth_mesh(obj)
    return obj


core_star = star4("core_star", 0.36, 0.2, 0.05)
core_star.location = (0, -0.5, 0.72)
mini_star_a = star4("mini_star_a", 0.16, 0.2, 0.03)
mini_star_a.location = (-0.78, -0.48, 0.74)
mini_star_b = star4("mini_star_b", 0.10, 0.2, 0.024)
mini_star_b.location = (0.74, -0.5, 1.02)


def orbit_ring():
    mesh = bpy.data.meshes.new("orbit_ring")
    bm = bmesh.new()
    n = 220
    m = 16
    major = 2.05
    tube = 0.05
    rings = []
    for i in range(n):
        a = i / n * 2 * math.pi
        # Ring sits slightly off round so it feels hand drawn.
        rr = major * (1 + 0.035 * math.sin(a * 3 + 0.7))
        center = Vector((math.cos(a) * rr, math.sin(a) * rr * 0.95, 0.06 * math.sin(a * 2)))
        tangent = Vector((-math.sin(a), math.cos(a), 0)).normalized()
        up = Vector((0, 0, 1))
        rad = up.cross(tangent).normalized()
        ring = []
        for j in range(m):
            b = j / m * 2 * math.pi
            # Ribbon cross-section: wider than tall.
            offset = rad * math.cos(b) * tube * 1.8 + up * math.sin(b) * tube * 0.8
            ring.append(bm.verts.new(center + offset))
        rings.append(ring)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(m):
            bm.faces.new((a[j], b[j], b[(j + 1) % m], a[(j + 1) % m]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_obj("orbit_ring", mesh)
    lib.smooth_mesh(obj)
    return obj


ring = orbit_ring()
ring_star = star4("ring_star", 0.14, 0.22, 0.03)
ring_star.location = (2.05, -0.1, 0)


# Per-vertex attributes used by the jelly shader:
# R = ambient occlusion, G = thickness, B = proximity to the core star.
def bake_attributes(obj, star_center, n_rays=28):
    mesh = obj.data
    dirs = lib.fibonacci_dirs(n_rays)
    colors = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    data = [0.0] * (len(mesh.vertices) * 4)
    max_len = 2.4
    for i, v in enumerate(mesh.vertices):
        n = obj.matrix_world.to_3x3() @ v.normal
        p = obj.matrix_world @ v.co + n * 0.002
        open_rays = 0
        total = 0
        thickness = 0.0
        thickness_n = 0
        for d in dirs:
            if d.dot(n) > 0.05:
                total += 1
                hit, _, _, dist = tree.ray_cast(p, d, max_len)
                if hit is None or dist > 0.9:
                    open_rays += 1
            elif d.dot(n) < -0.2:
                hit, _, _, dist = tree.ray_cast(p - n * 0.01, d, max_len)
                thickness += min(dist, max_len) if hit else max_len
                thickness_n += 1
        ao = open_rays / max(total, 1)
        th = (thickness / max(thickness_n, 1)) / max_len
        glow = 1.0 - min((p - star_center).length / 1.6, 1.0)
        data[i * 4 + 0] = ao
        data[i * 4 + 1] = th
        data[i * 4 + 2] = glow
        data[i * 4 + 3] = 1.0
    colors.data.foreach_set("color", data)
    mesh.color_attributes.active_color_index = 0
    mesh.attributes.active_color_index = 0 if hasattr(mesh.attributes, "active_color_index") else 0
    mesh.update()


print("baking vertex attributes")
bake_attributes(body, Vector((0, -0.5, 0.72)))
print("attributes done")

# Materials for preview and glTF naming; the runtime replaces these by material name.
m_jelly = lib.material("jelly_body", (0.62, 0.42, 1.0), rough=0.08, transmission=0.9)
m_eye = lib.material("eye", (0.04, 0.02, 0.09), rough=0.08)
m_hl = lib.material("eye_highlight", (1, 1, 1), rough=0.3, emit=(1, 1, 1), strength=1.5)
m_mouth = lib.material("mouth", (0.42, 0.08, 0.2), rough=0.35)
m_tongue = lib.material("tongue", (0.95, 0.4, 0.5), rough=0.45)
m_cheek = lib.material("cheek", (0.98, 0.56, 0.8), rough=0.5)
m_star = lib.material("core_star", (1.0, 0.93, 0.68), rough=0.3, emit=(1.0, 0.93, 0.68), strength=4.0)
m_ring = lib.material("orbit_ring", (0.7, 0.55, 1.0), rough=0.1, transmission=0.8)

lib.assign(body, m_jelly)
for o in (eye_L, eye_R):
    lib.assign(o, m_eye)
for o in (hl_L, hl_R):
    lib.assign(o, m_hl)
lib.assign(mouth, m_mouth)
lib.assign(tongue, m_tongue)
for o in (cheek_L, cheek_R):
    lib.assign(o, m_cheek)
for o in (core_star, mini_star_a, mini_star_b, ring_star):
    lib.assign(o, m_star)
lib.assign(ring, m_ring)

tb.free()

objects = [body, eye_L, eye_R, hl_L, hl_R, mouth, tongue, cheek_L, cheek_R,
           core_star, mini_star_a, mini_star_b, ring, ring_star]

if preview:
    lib.setup_cycles(samples=24, w=720, h=720)
    lib.sky_world(strength=1.1)
    # Tilt the ring like the idle pose so the preview shows the final silhouette.
    ring.rotation_euler = (math.radians(16), math.radians(-12), 0)
    ring_star.rotation_euler = (math.radians(16), math.radians(-12), 0)
    lib.add_camera((0, -9.5, 2.2), (0, 0, 1.3), lens=70)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3
    sun_o = bpy.data.objects.new("sun", sun)
    lib.ensure_coll().objects.link(sun_o)
    sun_o.rotation_euler = (math.radians(55), 0, math.radians(30))
    # Plain floor to read the silhouette.
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.14))
    lib.assign(bpy.context.active_object, lib.material("floor", (0.85, 0.95, 0.88), rough=0.6))
    bpy.context.scene.render.filepath = os.path.join(lib.OUT, "preview_qwen.png")
    bpy.ops.render.render(write_still=True)
else:
    ring.rotation_euler = (math.radians(16), math.radians(-12), 0)
    ring_star.rotation_euler = (math.radians(16), math.radians(-12), 0)
    lib.export_glb(os.path.join(lib.OUT, "qwen-star.raw.glb"), objects)
print("done tris", sum(len(o.data.polygons) for o in objects))
