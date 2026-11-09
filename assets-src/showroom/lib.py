"""Shared Blender helpers for the showroom assets. Authored procedurally, no external assets."""
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "build")
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_coll():
    return bpy.context.scene.collection


def new_obj(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    ensure_coll().objects.link(obj)
    return obj


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_mods(obj):
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


def smooth_mesh(obj):
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    obj.data.update()


def rounded_profile(points, radius=0.04, segments=6):
    """Turns a polyline [(r, z, corner_radius?)...] into a rounded profile."""
    pts = []
    for p in points:
        if len(p) == 2:
            pts.append((Vector((p[0], p[1])), radius))
        else:
            pts.append((Vector((p[0], p[1])), p[2]))
    out = [pts[0][0].copy()]
    for i in range(1, len(pts) - 1):
        p, r = pts[i]
        if r <= 0:
            out.append(p.copy())
            continue
        a = (pts[i - 1][0] - p)
        b = (pts[i + 1][0] - p)
        al, bl = a.length, b.length
        if al < 1e-6 or bl < 1e-6:
            continue
        a.normalize()
        b.normalize()
        cosang = max(-1.0, min(1.0, a.dot(b)))
        ang = math.acos(cosang)
        # Tangent distance limited by neighbour length.
        t = min(r / max(math.tan(ang * 0.5), 1e-3), al * 0.5, bl * 0.5)
        center_dir = (a + b).normalized()
        rad = t * math.tan(ang * 0.5)
        center = p + center_dir * (rad / max(math.sin(ang * 0.5), 1e-3))
        start = p + a * t
        end = p + b * t
        v0 = (start - center)
        v1 = (end - center)
        a0 = math.atan2(v0.y, v0.x)
        a1 = math.atan2(v1.y, v1.x)
        da = a1 - a0
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        for s in range(segments + 1):
            ang_s = a0 + da * (s / segments)
            out.append(center + Vector((math.cos(ang_s), math.sin(ang_s))) * rad)
    out.append(pts[-1][0].copy())
    return out


def lathe(name, profile, steps=96, cap_axis=True):
    """Revolve profile list of Vector2(r, z) around Z, closing on-axis points."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for p in profile:
        r, z = p.x, p.y
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, 0.0, z))])
            continue
        ring = []
        for i in range(steps):
            a = 2 * math.pi * i / steps
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(len(b)):
                bm.faces.new((a[0], b[i], b[(i + 1) % len(b)]))
        elif len(b) == 1:
            for i in range(len(a)):
                bm.faces.new((a[i], b[0], a[(i + 1) % len(a)]))
        else:
            for i in range(len(a)):
                bm.faces.new((a[i], b[i], b[(i + 1) % len(b)], a[(i + 1) % len(a)]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_obj(name, mesh)
    smooth_mesh(obj)
    return obj


def material(name, base=(1, 1, 1), rough=0.5, metal=0.0, transmission=0.0, emit=None, strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Transmission Weight"].default_value = transmission
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def bvh_for(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    tree = BVHTree.FromBMesh(bm)
    return tree, bm


def fibonacci_dirs(n):
    golden = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(n):
        z = 1 - (i + 0.5) * 2 / n
        r = math.sqrt(max(0, 1 - z * z))
        a = i * golden
        out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


def setup_cycles(samples=32, w=1024, h=1024):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 3
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"


def add_camera(loc, target, lens=50, name="Camera"):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    obj = bpy.data.objects.new(name, cam)
    ensure_coll().objects.link(obj)
    obj.location = loc
    direction = Vector(target) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def sky_world(top=(0.55, 0.78, 1.0), horizon=(1.0, 1.0, 1.0), strength=1.0):
    world = bpy.data.worlds.new("sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    bg = nodes["Background"]
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (*horizon, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*top, 1)
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = -1
    map_range.inputs["From Max"].default_value = 1
    links.new(tc.outputs["Generated"], sep.inputs[0])
    links.new(sep.outputs["Z"], map_range.inputs["Value"])
    links.new(map_range.outputs[0], ramp.inputs[0])
    links.new(ramp.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    return world


def export_glb(path, objects, export_colors=True):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color="ACTIVE" if export_colors else "NONE",
        export_animations=False,
        export_materials="EXPORT",
    )


def rng(seed):
    return random.Random(seed)
