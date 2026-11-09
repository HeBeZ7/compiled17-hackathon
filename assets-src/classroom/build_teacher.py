"""Builds the teacher: an original plush lavender rabbit, sculpted from signed distance fields.

Every organic surface is a smooth-min blend of distance primitives extracted with
surface nets, so limbs, cheeks and clothing flow into each other like a sculpt.
The character is modelled directly in her idle pose (book in one arm, the other
arm open toward the board) so the idle pose needs no skin deformation.

Stages by AA_STAGE: "preview" close-up Cycles still, "export" full bake and GLB.
AA_STEP sets the voxel size in meters (default 0.006, use 0.012 for quick looks).
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
STEP = float(os.environ.get("AA_STEP", "0.006"))
TEX_DIR = os.path.join(aa.WORK, "teacher")
os.makedirs(TEX_DIR, exist_ok=True)


# ---------------------------------------------------------------- distance fields
def L(v):
    return np.sqrt((v * v).sum(-1))


def V(*a):
    return np.array(a, float)


def sph(p, c, r):
    return L(p - c) - r


def ell(p, c, radii, R=None):
    q = p - c
    if R is not None:
        q = q @ R
    rad = np.array(radii, float)
    k0 = L(q / rad)
    k1 = L(q / (rad * rad))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def rcone(p, a, b, r1, r2):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2 = (ba * ba).sum()
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = (pa * ba).sum(-1)
    z = y - l2
    x2 = (((pa * l2) - (ba * y[..., None])) ** 2).sum(-1)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    return np.where(
        np.sign(z) * a2 * z2 > k,
        np.sqrt(x2 + z2) * il2 - r2,
        np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1),
    )


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


rng = np.random.default_rng(11)
_noise_grid = rng.random((64, 64, 64), np.float32)


def noise3(p, freq):
    """Trilinear value noise, periodic, in [-1, 1]."""
    q = p * freq
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    i = i % 64
    g = _noise_grid

    def at(a, b, c):
        return g[(i[..., 0] + a) % 64, (i[..., 1] + b) % 64, (i[..., 2] + c) % 64]

    x0 = at(0, 0, 0) * (1 - f[..., 0]) + at(1, 0, 0) * f[..., 0]
    x1 = at(0, 1, 0) * (1 - f[..., 0]) + at(1, 1, 0) * f[..., 0]
    x2 = at(0, 0, 1) * (1 - f[..., 0]) + at(1, 0, 1) * f[..., 0]
    x3 = at(0, 1, 1) * (1 - f[..., 0]) + at(1, 1, 1) * f[..., 0]
    y0 = x0 * (1 - f[..., 1]) + x1 * f[..., 1]
    y1 = x2 * (1 - f[..., 1]) + x3 * f[..., 1]
    return (y0 * (1 - f[..., 2]) + y1 * f[..., 2]) * 2 - 1


# ---------------------------------------------------------------- pose landmarks
SH_L = V(0.27, 0.0, 1.135)
EL_L = V(0.60, -0.1, 1.03)
WR_L = V(0.86, -0.24, 1.2)
HD_L = V(0.985, -0.31, 1.26)

SH_R = V(-0.27, 0.0, 1.135)
EL_R = V(-0.47, -0.06, 0.82)
WR_R = V(-0.2, -0.34, 0.8)
HD_R = V(-0.11, -0.42, 0.84)

BOOK_C = V(-0.14, -0.33, 0.99)
EYE_X, EYE_Z, EYE_RX, EYE_RZ = 0.2, 1.65, 0.098, 0.118


# ---------------------------------------------------------------- body
def torso(p):
    q = p * V(0.95, 1.14, 1.0)
    a = rcone(q, V(0, 0, 0.65), V(0, 0, 1.04), 0.272, 0.228)
    return a


def head_shape(p):
    # Sculpted a touch larger than the torso reads, for the concept's big-head proportion.
    center = V(0, -0.02, 1.6)
    p = center + (p - center) / 1.07
    d = _head_shape(p) * 1.07
    return d


def mouth_cavity(p):
    """D-shaped open smile: flat lower lobe under a top edge that lifts at the corners."""
    lobe = ell(p, V(0, -0.5, 1.428), (0.096, 0.12, 0.072))
    top_edge = p[..., 2] - (1.434 + 3.6 * p[..., 0] * p[..., 0])
    return smax(lobe, top_edge, 0.008)


def _head_shape(p):
    skull = ell(p, V(0, 0.0, 1.635), (0.435, 0.385, 0.365))
    brow = ell(p, V(0, -0.1, 1.74), (0.33, 0.26, 0.21))
    d = smin(skull, brow, 0.06)
    for s in (1, -1):
        cheek = ell(p, V(s * 0.25, -0.1, 1.43), (0.205, 0.23, 0.165))
        d = smin(d, cheek, 0.09)
        d = smin(d, ell(p, V(s * 0.385, -0.02, 1.48), (0.1, 0.13, 0.1)), 0.05)  # side fluff
    # Muzzle and chin.
    d = smin(d, ell(p, V(0, -0.33, 1.47), (0.155, 0.11, 0.098)), 0.06)
    d = smin(d, ell(p, V(0, -0.27, 1.34), (0.125, 0.12, 0.075)), 0.05)
    # Eye sockets: shallow dents the eye domes sit in.
    for s in (1, -1):
        d = smax(d, -ell(p, V(s * EYE_X, -0.47, EYE_Z), (EYE_RX * 1.05, 0.09, EYE_RZ * 1.05)), 0.018)
    # Open smile.
    d = smax(d, -mouth_cavity(p), 0.006)
    return d


def ear(p, s):
    """Tall flattened ear with a cupped front, in the ear's own tilted frame."""
    base = V(s * 0.22, 0.05, 1.86)
    q = (p - base) @ ear_rotation(s)
    q = q * V(1.0, 2.2, 1.0)
    pts = [V(0, 0, -0.1), V(0, 0, 0.24), V(0.01 * s, 0, 0.44), V(0.04 * s, 0.03, 0.6)]
    d = smin(smin(rcone(q, pts[0], pts[1], 0.11, 0.155), rcone(q, pts[1], pts[2], 0.155, 0.13), 0.03), rcone(q, pts[2], pts[3], 0.13, 0.085), 0.02)
    d = d / 1.8
    dish = ell(q / V(1, 2.2, 1), V(0.004 * s, -0.063, 0.3), (0.105, 0.065, 0.33))
    return smax(d, -dish, 0.015)


def ear_rotation(s):
    return rot_y(s * 0.2) @ rot_x(-0.17)


def hand(p, s):
    """Palm with thumb and fingers. s=1 is the open hand, s=-1 the book hand."""
    if s > 0:
        axis = (HD_L - WR_L) / L(HD_L - WR_L)
        palm = ell(p, HD_L, (0.115, 0.1, 0.065), R=rot_y(-0.5))
        d = palm
        for i in range(4):
            spread = (i - 1.5) * 0.3
            direction = rot_z(spread) @ axis
            a = HD_L + direction * 0.07
            b = HD_L + direction * (0.18 - abs(i - 1.5) * 0.015) + V(0, 0, 0.012)
            d = smin(d, rcone(p, a, b, 0.038, 0.03), 0.018)
        thumb_a = HD_L + V(0.0, -0.08, 0.02)
        thumb_b = HD_L + V(0.07, -0.16, 0.05)
        return smin(d, rcone(p, thumb_a, thumb_b, 0.04, 0.032), 0.02)
    axis = (HD_R - WR_R) / L(HD_R - WR_R)
    d = ell(p, HD_R, (0.1, 0.075, 0.075))
    for i in range(4):
        x = (i - 1.5) * 0.05
        a = HD_R + V(x, -0.02, 0.05)
        b = HD_R + V(x, -0.03, 0.125)
        d = smin(d, rcone(p, a, b, 0.032, 0.026), 0.015)
    return smin(d, rcone(p, HD_R + V(0.09, -0.015, 0.0), HD_R + V(0.14, -0.05, 0.05), 0.034, 0.03), 0.02)


def parts_of(p):
    """Returns {bone_part: distance} for the body."""
    d = {}
    d["torso"] = smin(torso(p), ell(p, V(0, 0, 0.62), (0.3, 0.26, 0.2)), 0.05)
    d["neck"] = rcone(p, V(0, 0, 1.12), V(0, 0, 1.34), 0.14, 0.13)
    d["head"] = head_shape(p)
    d["ear_L"] = ear(p, 1)
    d["ear_R"] = ear(p, -1)
    d["upper_L"] = rcone(p, SH_L, EL_L, 0.115, 0.095)
    d["fore_L"] = rcone(p, EL_L, WR_L, 0.095, 0.08)
    d["hand_L"] = hand(p, 1)
    d["upper_R"] = rcone(p, SH_R, EL_R, 0.115, 0.095)
    d["fore_R"] = rcone(p, EL_R, WR_R, 0.095, 0.08)
    d["hand_R"] = hand(p, -1)
    for s, side in ((1, "L"), (-1, "R")):
        d[f"leg_{side}"] = rcone(p, V(s * 0.14, 0, 0.55), V(s * 0.15, -0.01, 0.17), 0.105, 0.08)
        foot = smin(ell(p, V(s * 0.15, -0.09, 0.085), (0.13, 0.22, 0.09)), ell(p, V(s * 0.15, -0.21, 0.07), (0.1, 0.1, 0.075)), 0.04)
        d[f"foot_{side}"] = smax(foot, -p[..., 2], 0.02)
    d["tail"] = ell(p, V(0, 0.3, 0.7), (0.13, 0.12, 0.13))
    return d


def body_sdf(p):
    d = parts_of(p)
    names = list(d)
    field = d[names[0]]
    k = {"head": 0.05, "ear_L": 0.05, "ear_R": 0.05, "tail": 0.05}
    for n in names[1:]:
        field = smin(field, d[n], k.get(n, 0.035))
    # Plush surface: broad soft clumps on the head and ears, finer everywhere.
    head_fluff = smooth01(np.clip((p[..., 2] - 1.28) / 0.1, 0, 1))
    return field + (0.003 + 0.003 * head_fluff) * noise3(p, 21.0) + 0.0016 * noise3(p, 73.0)


def sleeve_clip(p):
    """Positive beyond the cuffs. Arms end before the wrists."""
    clip = -1.0e3 * np.ones(p.shape[:-1])
    for wr, el in ((WR_L, EL_L), (WR_R, EL_R)):
        axis = (wr - el) / L(wr - el)
        plane = (p - (wr - axis * 0.06)) @ axis
        # Only apply the cut near this arm's wrist.
        near = L(p - wr) < 0.26
        clip = np.where(near, np.maximum(clip, plane), clip)
    return clip


def cardigan_sdf(p):
    t = torso(p) - 0.024
    # Hem and neck apply to the torso alone, the sleeves hang below the hem at the elbow.
    t = smax(t, 0.745 - p[..., 2], 0.012)
    t = smax(t, p[..., 2] - 1.27, 0.02)
    sleeve_l = smin(rcone(p, SH_L, EL_L, 0.135, 0.116), rcone(p, EL_L, WR_L, 0.116, 0.106), 0.02)
    sleeve_r = smin(rcone(p, SH_R, EL_R, 0.135, 0.116), rcone(p, EL_R, WR_R, 0.116, 0.106), 0.02)
    d = smin(t, smax(smin(sleeve_l, sleeve_r, 0.02), sleeve_clip(p), 0.01), 0.04)
    # V neck opening on the front.
    apex = 0.8
    width = np.clip((p[..., 2] - apex) * 0.34, 0.0, 0.3)
    wedge = np.abs(p[..., 0]) - width - 0.012
    front = p[..., 1] + 0.05
    cut = smax(wedge, front, 0.01)
    return smax(d, -cut, 0.012)


def shirt_sdf(p):
    t = torso(p) - 0.012
    d = smax(t, p[..., 1] + 0.1, 0.02)
    return smax(smax(d, 0.74 - p[..., 2], 0.01), p[..., 2] - 1.3, 0.02)


def collar_sdf(p):
    d = None
    for s in (1, -1):
        c = V(s * 0.1, -0.245, 1.205)
        flap = ell(p, c, (0.115, 0.02, 0.07), R=rot_z(s * 0.25) @ rot_y(s * 0.5))
        d = flap if d is None else smin(d, flap, 0.008)
    return d


def bow_sdf(p):
    knot = ell(p, V(0, -0.3, 1.185), (0.042, 0.038, 0.044))
    d = knot
    for s in (1, -1):
        c = V(s * 0.135, -0.285, 1.19)
        q = p - c
        wing = ell(p, c, (0.125, 0.04, 0.085), R=rot_y(s * 0.14))
        # Pleats radiate from the knot.
        ang = np.arctan2(p[..., 2] - 1.185, np.abs(p[..., 0]) + 0.02)
        wing = wing + np.sin(ang * 7.0) * 0.004 * smooth01(np.clip(1 - np.abs(q[..., 0]) / 0.13, 0, 1))
        pinch = smin(wing, ell(p, V(s * 0.055, -0.295, 1.185), (0.03, 0.03, 0.035)), 0.02)
        d = smin(d, pinch, 0.012)
    # Crease on each side of the knot.
    d = smax(d, 0.006 - np.abs(np.abs(p[..., 0]) - 0.055), 0.005)
    return smin(d, knot, 0.004)


# ---------------------------------------------------------------- surface nets
def eval_grid(fn, bounds, step, chunk_z=40):
    (x0, x1), (y0, y1), (z0, z1) = bounds
    xs = np.arange(x0, x1, step)
    ys = np.arange(y0, y1, step)
    zs = np.arange(z0, z1, step)
    out = np.empty((len(xs), len(ys), len(zs)), np.float32)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    for k0 in range(0, len(zs), chunk_z):
        z_part = zs[k0 : k0 + chunk_z]
        Z = np.tile(z_part[None, None, :], (*X.shape, 1))
        Xs = np.tile(X[..., None], (1, 1, len(z_part)))
        Ys = np.tile(Y[..., None], (1, 1, len(z_part)))
        P = np.stack([Xs, Ys, Z], -1)
        out[..., k0 : k0 + chunk_z] = fn(P)
    return out, np.array([x0, y0, z0]), step


def surface_nets(field, origin, step):
    """Naive surface nets: a quad per sign-changing grid edge, a vertex per crossing cell."""
    inside = field < 0
    nx, ny, nz = field.shape
    edges = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
    sums = {}
    quads = []
    cell_ids = []
    cell_pos = []

    def cell_key(i, j, k):
        return i * ny * nz + j * nz + k

    all_cells = []
    all_pos = []
    records = []
    for axis, (dx, dy, dz) in enumerate(edges):
        a = inside[: nx - dx, : ny - dy, : nz - dz]
        b = inside[dx:, dy:, dz:]
        cross = a != b
        idx = np.nonzero(cross)
        if len(idx[0]) == 0:
            continue
        i, j, k = idx
        va = field[i, j, k].astype(np.float64)
        vb = field[i + dx, j + dy, k + dz].astype(np.float64)
        t = va / (va - vb)
        pos = np.stack([i + t * dx, j + t * dy, k + t * dz], -1)
        # Cells sharing this edge.
        if axis == 0:
            offs = [(0, -1, -1), (0, 0, -1), (0, 0, 0), (0, -1, 0)]
        elif axis == 1:
            offs = [(-1, 0, -1), (0, 0, -1), (0, 0, 0), (-1, 0, 0)]
        else:
            offs = [(-1, -1, 0), (0, -1, 0), (0, 0, 0), (-1, 0, 0)]
        valid = np.ones(len(i), bool)
        cells = []
        for o in offs:
            ci, cj, ck = i + o[0], j + o[1], k + o[2]
            valid &= (ci >= 0) & (cj >= 0) & (ck >= 0) & (ci < nx - 1) & (cj < ny - 1) & (ck < nz - 1)
            cells.append(np.stack([ci, cj, ck], -1))
        cell_arr = np.stack(cells, 1)  # n, 4, 3
        records.append((axis, cell_arr[valid], pos[valid], a[i, j, k][valid]))
        all_cells.append(cell_arr[valid].reshape(-1, 3))
        all_pos.append(np.repeat(pos[valid], 4, axis=0))
    cells = np.concatenate(all_cells)
    poss = np.concatenate(all_pos)
    keys = cells[:, 0] * ny * nz + cells[:, 1] * nz + cells[:, 2]
    uniq, inv = np.unique(keys, return_inverse=True)
    sum_pos = np.zeros((len(uniq), 3))
    np.add.at(sum_pos, inv, poss)
    count = np.bincount(inv)
    verts = sum_pos / count[..., None]
    verts = verts * step + origin
    # Quads, oriented so normals point outward (from inside to outside).
    faces = []
    offset = 0
    start = 0
    all_q = []
    for axis, cell_arr, pos, a_inside in records:
        k = cell_arr[..., 0] * ny * nz + cell_arr[..., 1] * nz + cell_arr[..., 2]
        idx = np.searchsorted(uniq, k)
        flip = a_inside
        q = np.where(flip[..., None], idx, idx[:, ::-1])
        all_q.append(q)
    quads = np.concatenate(all_q)
    return verts, quads


def extract(fn, bounds, step, name, mat, target_faces, smooth_iters=2):
    field, origin, st = eval_grid(fn, bounds, step)
    verts, quads = surface_nets(field, origin, st)
    print(name, "raw verts", len(verts), "quads", len(quads))
    ob = aa.obj_from(name, verts, quads, mat, smooth=True)
    if smooth_iters:
        s = ob.modifiers.new("smooth", "SMOOTH")
        s.factor = 0.6
        s.iterations = smooth_iters
    ratio = min(1.0, target_faces / max(len(quads) * 2, 1))
    d = ob.modifiers.new("dec", "DECIMATE")
    d.ratio = ratio
    aa.apply_modifiers(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    print(name, "final tris", len(ob.data.polygons))
    return ob


def snap(points, fn, it=40):
    """Moves points onto the iso-surface by gradient descent on the distance."""
    p = np.array(points, float)
    e = 0.003
    for _ in range(it):
        d = fn(p)
        grad = np.stack(
            [
                (fn(p + V(e, 0, 0)) - fn(p - V(e, 0, 0))) / (2 * e),
                (fn(p + V(0, e, 0)) - fn(p - V(0, e, 0))) / (2 * e),
                (fn(p + V(0, 0, e)) - fn(p - V(0, 0, e))) / (2 * e),
            ],
            -1,
        )
        grad /= np.maximum(L(grad)[..., None], 1e-6)
        p = p - grad * d[..., None] * 0.8
    return p, grad


# ---------------------------------------------------------------- attribute painting
def soft(d, width):
    return np.clip(0.5 - d / (2 * width), 0, 1) ** 1.0


def smooth01(x):
    return x * x * (3 - 2 * x)


def body_colors(p):
    """Per-vertex albedo for the fur, painted from distance masks."""
    lav = np.array(srgb("#d2c3ee")[:3])
    lav_deep = np.array(srgb("#c3b1e8")[:3])
    white = np.array(srgb("#fbf8f6")[:3])
    pink = np.array(srgb("#f2a6b4")[:3])
    pink_in = np.array(srgb("#f5b0a8")[:3])
    mouth_col = np.array(srgb("#a83a4d")[:3])
    col = np.tile(lav, (*p.shape[:-1], 1))
    # Darker top of the head, lighter below: a soft face gradient.
    grad = smooth01(np.clip((p[..., 2] - 1.7) / 0.25, 0, 1))
    col = col * (1 - grad)[..., None] + lav_deep * grad[..., None]
    # White muzzle, cheeks and chin: the mask follows the lower half of the face.
    muz = ell(p, V(0, -0.27, 1.42), (0.22, 0.25, 0.135))
    ch = np.minimum(ell(p, V(0.2, -0.22, 1.41), (0.17, 0.22, 0.13)), ell(p, V(-0.2, -0.22, 1.41), (0.17, 0.22, 0.13)))
    face_white = soft(np.minimum(muz, ch), 0.02)
    col = col * (1 - face_white)[..., None] + white * face_white[..., None]
    # Blush.
    for s in (1, -1):
        blush = smooth01(np.clip(1 - L((p - V(s * 0.31, -0.3, 1.52)) * V(1, 1, 1.5)) / 0.11, 0, 1))
        col = col * (1 - 0.65 * blush)[..., None] + pink[None if False else ...] * (0.65 * blush)[..., None] if False else col * (1 - 0.65 * blush)[..., None] + pink * (0.65 * blush)[..., None]
    # Inner ears.
    for s in (1, -1):
        q = (p - V(s * 0.22, 0.05, 1.86)) @ ear_rotation(s)
        inside = ell(q / V(1, 2.2, 1), V(0.004 * s, -0.05, 0.3), (0.105, 0.055, 0.335))
        m = soft(inside, 0.012)
        m = m * (q[..., 1] < 0.02)
        # Warmer toward the base.
        tone = np.clip((q[..., 2] + 0.1) / 0.6, 0, 1)[..., None]
        ear_col = pink_in * (1 - tone) + pink * tone
        col = col * (1 - m)[..., None] + ear_col * m[..., None]
    # Feet and tail are white, hands are paler lavender.
    for name, c, r, w in (("foot", V(0.15, -0.09, 0.09), (0.16, 0.28, 0.12), 1.0), ("foot2", V(-0.15, -0.09, 0.09), (0.16, 0.28, 0.12), 1.0), ("tail", V(0, 0.3, 0.7), (0.14, 0.13, 0.14), 1.0)):
        m = soft(ell(p, c, r), 0.03) * w
        col = col * (1 - m)[..., None] + white * m[..., None]
    # Mouth interior.
    m = soft(mouth_cavity(p) + 0.003, 0.0025)
    col = col * (1 - m)[..., None] + mouth_col * m[..., None]
    return col


# ---------------------------------------------------------------- face and accessories
def make_eye_texture():
    size = 512
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size * 2 - 1
    v = (yy + 0.5) / size * 2 - 1  # v grows downward in image space
    r = np.sqrt(u * u + v * v)
    white = np.array([0.93, 0.91, 0.9])
    deep = np.array([0.06, 0.035, 0.03])
    amber = np.array([0.48, 0.25, 0.1])
    pupil = np.array([0.012, 0.01, 0.018])
    iris_r = 0.93
    t = np.clip(r / iris_r, 0, 1)[..., None]
    col = deep[None, None, :] * (1 - t) + (deep * 0.88 + amber * 0.12)[None, None, :] * t
    # Warm crescent in the lower half of the iris.
    crescent = np.clip((v - 0.05) / 0.8, 0, 1) * np.clip((r - 0.5) / 0.25, 0, 1) * np.clip((iris_r - r) / 0.1, 0, 1)
    col = col * (1 - crescent[..., None]) + (amber * 1.1)[None, None, :] * crescent[..., None]
    p = np.clip((0.66 - r) / 0.03, 0, 1)[..., None]
    col = col * (1 - p) + pupil[None, None, :] * p
    # Thin sclera outside the iris.
    edge = np.clip((r - iris_r) / 0.025, 0, 1)[..., None]
    col = col * (1 - edge) + white[None, None, :] * edge
    # Painted catch lights so the eyes read as glossy from any angle.
    for (cx, cy, rad, strength) in ((-0.3, -0.36, 0.23, 1.0), (0.26, 0.3, 0.1, 0.95), (0.36, -0.14, 0.055, 0.8), (-0.42, 0.18, 0.06, 0.55)):
        d = np.sqrt((u - cx) ** 2 + (v - cy) ** 2)
        m = np.clip((rad - d) / 0.015, 0, 1)[..., None] * strength
        col = col * (1 - m) + np.array([1.0, 0.99, 0.98])[None, None, :] * m
    gamma = np.clip(col, 0, 1) ** (1 / 2.2)
    aa.numpy_to_png(np.dstack([gamma[::-1], np.ones((size, size), np.float32)]), os.path.join(TEX_DIR, "eye.png"))


def eye_frame(sign):
    """Eye center and axes: rotated a little outward so the domes follow the face curve."""
    c = V(sign * EYE_X, -0.463, EYE_Z)
    yaw = -sign * 0.32
    pitch = 0.08
    R = rot_z(yaw) @ rot_x(pitch)
    return c, R  # R columns: local x, local forward(-y)=R @ (0,-1,0), local z


def build_eyes(M):
    verts, faces, uvs = [], [], []
    n_lon, n_lat = 40, 28
    for sign in (1, -1):
        c, R = eye_frame(sign)
        i0 = len(verts)
        for i in range(n_lat + 1):
            polar = (math.pi * 0.72) * i / n_lat
            for j in range(n_lon):
                az = 2 * math.pi * j / n_lon
                d = V(math.sin(polar) * math.cos(az), -math.cos(polar), math.sin(polar) * math.sin(az))
                p = c + R @ (d * V(EYE_RX * 1.0, 0.052, EYE_RZ * 1.0))
                verts.append(p)
                uvs.append((0.5 + 0.5 * math.sin(polar) * math.cos(az) * (1 / math.sin(math.pi * 0.5)), 0.5 + 0.5 * math.sin(polar) * math.sin(az)))
        for i in range(n_lat):
            for j in range(n_lon):
                a = i0 + i * n_lon + j
                b = i0 + i * n_lon + (j + 1) % n_lon
                c1 = i0 + (i + 1) * n_lon + (j + 1) % n_lon
                d1 = i0 + (i + 1) * n_lon + j
                faces.append((a, b, c1, d1))
    ob = aa.obj_from("TeacherEyes", verts, faces, M["eye"], smooth=True)
    ob.data.uv_layers.new(name="UVMap")
    uv = ob.data.uv_layers["UVMap"].data
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            uv[li].uv = uvs[ob.data.loops[li].vertex_index]
    return ob


def lid_point(sign, u, angle, shell):
    """Point on the eye shell. u is -1..1 across the eye, angle sweeps from top to bottom."""
    c, R = eye_frame(sign)
    rx, ry, rz = EYE_RX * shell, 0.052 * shell, EYE_RZ * shell
    sr = math.sqrt(max(1 - u * u, 0.0))
    d = V(u, -sr * math.sin(angle), sr * math.cos(angle))
    return c + R @ (d * V(rx, ry, rz))


def build_lids_and_lashes(M):
    verts, faces, closed = [], [], []
    lash_verts, lash_faces, lash_closed = [], [], []
    nu, nv = 18, 10
    open_edge, closed_edge = math.radians(46), math.radians(150)
    back = math.radians(-35)
    for sign in (1, -1):
        i0 = len(verts)
        # Lid grid in angle space, the blink shape key rotates the free edge downward.
        for j in range(nv + 1):
            t = j / nv
            for i in range(nu + 1):
                u = math.sin((i / nu - 0.5) * math.pi) * 1.0 * sign
                for edge, store in ((open_edge, verts), (closed_edge, closed)):
                    a = back + (edge - back) * t
                    store.append(lid_point(sign, u, a, 1.07))
        for j in range(nv):
            for i in range(nu):
                a = i0 + j * (nu + 1) + i
                faces.append((a, a + 1, a + nu + 2, a + nu + 1))
        # Lash ribbon along the free edge, flared at the outer corner.
        j0 = len(lash_verts)
        for i in range(nu + 1):
            u = math.sin((i / nu - 0.5) * math.pi) * sign
            outer = max(0.0, u * sign) ** 3
            for edge, store in ((open_edge, lash_verts), (closed_edge, lash_closed)):
                p = lid_point(sign, u, edge, 1.09)
                lift = (0.0015 + 0.011 * outer)
                c, R = eye_frame(sign)
                n = (p - c)
                n = n / np.linalg.norm(n)
                q = lid_point(sign, u, edge - 0.035 - 0.14 * outer, 1.1) + n * lift + (R @ V(sign * 0.012 * outer, 0, 0))
                r = lid_point(sign, u, edge + 0.018, 1.082)
                store.extend([r, p, q])
        for i in range(nu):
            for k in range(2):
                a = j0 + i * 3 + k
                lash_faces.append((a, a + 3, a + 4, a + 1))
    lid = aa.obj_from("TeacherLids", verts, faces, M["lid"], smooth=True)
    lash = aa.obj_from("TeacherLashes", lash_verts, lash_faces, M["lash"], smooth=True)
    for ob, cl in ((lid, closed), (lash, lash_closed)):
        ob.shape_key_add(name="Basis", from_mix=False)
        sk = ob.shape_key_add(name="blink", from_mix=False)
        sk.data.foreach_set("co", np.array(cl, np.float32).ravel())
    return lid, lash


def brow_and_nose(M):
    objs = []
    for sign in (1, -1):
        c = []
        for t in np.linspace(-1, 1, 12):
            c.append(V(sign * (0.21 + t * 0.085), -0.5, 1.875 - t * t * 0.026 + 0.006 * t * sign))
        pts, grad = snap(np.array(c), head_shape)
        pts = pts + grad * 0.004
        sec = aa.rrect_pts(0.017, 0.009, 0.004, seg=2)
        rings = []
        for i, p in enumerate(pts):
            t = i / (len(pts) - 1)
            taper = 0.45 + 0.75 * math.sin(t * math.pi)
            tan = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            tan /= np.linalg.norm(tan)
            nrm = grad[i]
            bi = np.cross(tan, nrm)
            bi /= np.linalg.norm(bi)
            rings.append([p + bi * s[0] * taper + nrm * s[1] * taper for s in sec])
        objs.append(aa.loft(f"brow{sign}", rings, M["brow"], sharp_deg=None))
    nose = aa.lathe(
        "nose",
        [(0, -0.042)] + [(math.sin(a) * 0.04, -math.cos(a) * 0.03) for a in np.linspace(0.2, 2.8, 12)] + [(0, 0.03)],
        24,
        mat=M["nose"],
        sharp_deg=None,
    )
    # Nose: wider than tall, slightly heart-like and pressed onto the muzzle.
    for v in nose.data.vertices:
        v.co.x *= 1.15 * (1.0 if v.co.z > 0 else 0.9)
        v.co.y *= 0.7
    nose.data.update()
    aa.transform(nose, loc=(0, -0.462, 1.53))
    objs.append(nose)
    # Philtrum and smile lines: dark rose tubes snapped to the muzzle.
    edge = lambda sign: [V(sign * x, -0.47, 1.439 + 3.6 * x * x) for x in np.linspace(0, 0.095, 8)]
    lines = [
        [V(0, -0.47, 1.5), V(0, -0.47, 1.444)],
        edge(1),
        edge(-1),
    ]
    for i, line in enumerate(lines):
        pts, _ = snap(np.array(line), head_shape)
        sec = [(math.cos(a) * 0.0045, math.sin(a) * 0.0045) for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
        objs.append(aa.sweep(f"line{i}", [tuple(p) for p in pts], sec, (0, -1, 0), mat=M["mouth_line"], sharp_deg=None))
    # Tongue and a slim row of upper teeth inside the smile.
    objs.append(ell_mesh("tongue", (0, -0.45, 1.388), (0.05, 0.034, 0.024), M["tongue"], 16, 10))
    objs.append(aa.rbox("teeth", (0.07, 0.008, 0.016), 0.004, center=(0, -0.474, 1.412), mat=M["tooth"], seg=2, corner=0.006))
    return objs


def ell_mesh(name, c, r, mat, nu=24, nv=16):
    verts, faces = [], []
    for j in range(nv + 1):
        polar = math.pi * j / nv
        for i in range(nu):
            az = 2 * math.pi * i / nu
            verts.append((c[0] + r[0] * math.sin(polar) * math.cos(az), c[1] + r[1] * math.sin(polar) * math.sin(az), c[2] + r[2] * math.cos(polar)))
    for j in range(nv):
        for i in range(nu):
            a = j * nu + i
            b = j * nu + (i + 1) % nu
            c2 = (j + 1) * nu + (i + 1) % nu
            d = (j + 1) * nu + i
            faces.append((a, b, c2, d))
    return aa.obj_from(name, verts, faces, mat, smooth=True)


def build_skirt(M):
    n_pleats = 26
    seg = n_pleats * 4
    rows = 16
    z_top, z_bot = 0.74, 0.3
    verts = []
    for j in range(rows + 1):
        t = j / rows
        z = z_top + (z_bot - z_top) * t
        r0 = 0.3 + 0.165 * t ** 0.85
        amp = 0.005 + 0.024 * t
        for i in range(seg):
            f = i / seg * n_pleats
            k = (i % 4)
            saw = [1.0, 0.25, -1.0, -0.25][k]
            a = 2 * math.pi * i / seg
            r = r0 + saw * amp
            # Slight squash front to back.
            verts.append((math.cos(a) * r * 1.02, math.sin(a) * r * 0.9, z - 0.006 * saw * t))
    faces = []
    for j in range(rows):
        for i in range(seg):
            a = j * seg + i
            b = j * seg + (i + 1) % seg
            c = (j + 1) * seg + (i + 1) % seg
            d = (j + 1) * seg + i
            faces.append((a, d, c, b))
    ob = aa.obj_from("TeacherSkirt", verts, faces, M["skirt"], smooth=True, sharp_deg=None)
    s = ob.modifiers.new("solid", "SOLIDIFY")
    s.thickness = 0.008
    s.offset = -1
    aa.apply_modifiers(ob)
    # Waistband: a soft rounded ring in the deeper lavender.
    prof = [(0.285, 0.72), (0.305, 0.725), (0.308, 0.76), (0.295, 0.775), (0.27, 0.77)]
    band = aa.lathe("TeacherWaist", prof, 48, mat=M["skirt_band"], sharp_deg=None)
    for v in band.data.vertices:
        v.co.x *= 1.02
        v.co.y *= 0.9
    band.data.update()
    return [ob, band]


def build_book(M):
    w, h, t = 0.31, 0.42, 0.075
    c = BOOK_C
    parts = [
        aa.rbox("bk_f", (w, 0.012, h), 0.006, center=(0, -t / 2 + 0.006, 0), mat=M["book_cover"], seg=2, corner=0.012),
        aa.rbox("bk_b", (w, 0.012, h), 0.006, center=(0, t / 2 - 0.006, 0), mat=M["book_cover"], seg=2, corner=0.012),
        aa.rbox("bk_s", (0.02, t, h), 0.008, center=(-w / 2 + 0.008, 0, 0), mat=M["book_cover"], seg=2),
        aa.rbox("bk_p", (w - 0.03, t - 0.018, h - 0.02), 0.003, center=(0.008, 0, 0.01), mat=M["paper"], seg=1),
    ]
    plate = aa.rbox("bk_plate", (0.17, 0.004, 0.11), 0.002, center=(0.0, -t / 2 - 0.0005, h * 0.52), mat=M["book_plate"], seg=1, corner=0.012)
    parts.append(plate)
    ob = aa.join(parts, "TeacherBook")
    aa.transform(ob, loc=(c[0], c[1], c[2] - h * 0.5), rot=(0.12, -0.08, 0.05))
    return ob


def build_buttons(M, fn):
    objs = []
    for i, z in enumerate((0.84, 0.95, 1.06)):
        p, g = snap(np.array([[0.015 + (z - 0.8) * 0.34 + 0.035, -0.3, z]]), fn)
        c = p[0] + g[0] * 0.012
        objs.append(ell_mesh(f"btn{i}", tuple(c), (0.024, 0.024, 0.024), M["button"], 12, 8))
    return objs


def materials():
    make_eye_texture()
    m = {}
    m["fur"] = aa.make_mat("teacher_fur", "#c6b4e8", rough=0.95, spec=0.25, sheen=1.0)
    m["cardigan"] = aa.make_mat("teacher_cardigan", "#f6eedd", rough=0.92, spec=0.2, sheen=0.6)
    m["shirt"] = aa.make_mat("teacher_shirt", "#fcfbf7", rough=0.75, spec=0.3)
    m["collar"] = aa.make_mat("teacher_collar", "#fdfcf9", rough=0.7, spec=0.3)
    m["bow"] = aa.make_mat("teacher_bow", "#ef8d82", rough=0.6, spec=0.4, sheen=0.4)
    m["skirt"] = aa.make_mat("teacher_skirt", "#c8baf0", rough=0.72, spec=0.3, sheen=0.3)
    m["skirt_band"] = aa.make_mat("teacher_skirt_band", "#b3a2e6", rough=0.7, spec=0.3)
    m["eye"] = aa.textured_mat("teacher_eye", albedo=os.path.join(TEX_DIR, "eye.png"), rough=0.12, spec=0.8)
    m["lid"] = aa.make_mat("teacher_lid", "#d2c3ee", rough=0.9, spec=0.25)
    m["lash"] = aa.make_mat("teacher_lash", "#3b2740", rough=0.5)
    m["brow"] = aa.make_mat("teacher_brow", "#7a5ca8", rough=0.75, spec=0.3)
    m["nose"] = aa.make_mat("teacher_nose", "#ee8ea2", rough=0.28, spec=0.6, coat=0.5)
    m["mouth_line"] = aa.make_mat("teacher_mouth_line", "#b4586f", rough=0.5)
    m["tongue"] = aa.make_mat("teacher_tongue", "#f07f8d", rough=0.45, spec=0.5)
    m["tooth"] = aa.make_mat("teacher_tooth", "#fffdf8", rough=0.25, spec=0.6)
    m["book_cover"] = aa.make_mat("teacher_book", "#76bfae", rough=0.5, spec=0.35)
    m["paper"] = aa.make_mat("teacher_paper", "#f6f0e2", rough=0.9, spec=0.2)
    m["book_plate"] = aa.make_mat("teacher_book_plate", "#d7efe7", rough=0.5)
    m["button"] = aa.make_mat("teacher_button", "#d7b98a", rough=0.32, spec=0.5, coat=0.5)
    return m


BODY_BOUNDS = ((-0.75, 1.25), (-0.58, 0.46), (-0.03, 2.56))
TORSO_BOUNDS = ((-0.75, 1.1), (-0.56, 0.42), (0.68, 1.33))


# ---------------------------------------------------------------- rigging
BONES = {
    # name: (head, tail, parent)
    "hips": (V(0, 0, 0.62), V(0, 0, 0.84), None),
    "spine": (V(0, 0, 0.84), V(0, 0, 1.04), "hips"),
    "chest": (V(0, 0, 1.04), V(0, 0, 1.22), "spine"),
    "neck": (V(0, 0, 1.22), V(0, 0, 1.36), "chest"),
    "head": (V(0, 0, 1.36), V(0, 0, 2.0), "neck"),
    "ear1_L": (V(0.22, 0.05, 1.86), V(0.26, 0.09, 2.08), "head"),
    "ear2_L": (V(0.26, 0.09, 2.08), V(0.32, 0.12, 2.28), "ear1_L"),
    "ear3_L": (V(0.32, 0.12, 2.28), V(0.39, 0.18, 2.48), "ear2_L"),
    "ear1_R": (V(-0.22, 0.05, 1.86), V(-0.26, 0.09, 2.08), "head"),
    "ear2_R": (V(-0.26, 0.09, 2.08), V(-0.32, 0.12, 2.28), "ear1_R"),
    "ear3_R": (V(-0.32, 0.12, 2.28), V(-0.39, 0.18, 2.48), "ear2_R"),
    "upper_L": (SH_L, EL_L, "chest"),
    "fore_L": (EL_L, WR_L, "upper_L"),
    "hand_L": (WR_L, HD_L + V(0.09, -0.06, 0.05), "fore_L"),
    "upper_R": (SH_R, EL_R, "chest"),
    "fore_R": (EL_R, WR_R, "upper_R"),
    "hand_R": (WR_R, HD_R + V(0.03, -0.04, 0.12), "fore_R"),
    "leg_L": (V(0.14, 0, 0.55), V(0.15, -0.01, 0.17), "hips"),
    "foot_L": (V(0.15, -0.01, 0.17), V(0.15, -0.25, 0.06), "leg_L"),
    "leg_R": (V(-0.14, 0, 0.55), V(-0.15, -0.01, 0.17), "hips"),
    "foot_R": (V(-0.15, -0.01, 0.17), V(-0.15, -0.25, 0.06), "leg_R"),
}


def make_armature():
    arm = bpy.data.armatures.new("TeacherRig")
    ob = aa.link(bpy.data.objects.new("TeacherRig", arm))
    aa.activate(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (h, t, parent) in BONES.items():
        b = arm.edit_bones.new(name)
        b.head = tuple(h)
        b.tail = tuple(t)
        b.roll = 0
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


PART_TO_BONE = {
    "neck": "neck",
    "head": "head",
    "upper_L": "upper_L",
    "fore_L": "fore_L",
    "hand_L": "hand_L",
    "upper_R": "upper_R",
    "fore_R": "fore_R",
    "hand_R": "hand_R",
    "leg_L": "leg_L",
    "leg_R": "leg_R",
    "foot_L": "foot_L",
    "foot_R": "foot_R",
}


def skin_from_parts(ob, arm_ob, parts_fn, tau=0.03):
    P = np.array([list(v.co) for v in ob.data.vertices])
    d = parts_fn(P)
    names = list(d)
    mat = np.stack([d[n] for n in names], -1)
    w = np.exp(-mat / tau)
    w = w / w.sum(-1, keepdims=True)
    weights = {}
    z = P[..., 2]
    spine_t = smooth01(np.clip((z - 0.8) / 0.25, 0, 1))
    chest_t = smooth01(np.clip((z - 1.0) / 0.2, 0, 1))
    for i, n in enumerate(names):
        wi = w[..., i]
        if n == "torso":
            weights["hips"] = weights.get("hips", 0) + wi * (1 - spine_t)
            weights["spine"] = weights.get("spine", 0) + wi * spine_t * (1 - chest_t)
            weights["chest"] = weights.get("chest", 0) + wi * spine_t * chest_t
        elif n.startswith("ear"):
            side = n[-1]
            s = 1 if side == "L" else -1
            q = (P - V(s * 0.22, 0.05, 1.86)) @ ear_rotation(s)
            t = np.clip(q[..., 2] / 0.55, 0, 1)
            a = smooth01(np.clip(1 - np.abs(t - 0.1) / 0.3, 0, 1))
            b = smooth01(np.clip(1 - np.abs(t - 0.45) / 0.3, 0, 1))
            c = smooth01(np.clip(1 - np.abs(t - 0.95) / 0.45, 0, 1))
            sm = a + b + c + 1e-6
            weights[f"ear1_{side}"] = weights.get(f"ear1_{side}", 0) + wi * a / sm
            weights[f"ear2_{side}"] = weights.get(f"ear2_{side}", 0) + wi * b / sm
            weights[f"ear3_{side}"] = weights.get(f"ear3_{side}", 0) + wi * c / sm
        elif n == "tail":
            weights["hips"] = weights.get("hips", 0) + wi
        else:
            bone = PART_TO_BONE[n]
            weights[bone] = weights.get(bone, 0) + wi
    ob.vertex_groups.clear()
    groups = {b: ob.vertex_groups.new(name=b) for b in weights}
    for b, arr in weights.items():
        g = groups[b]
        arr = np.broadcast_to(arr, (len(P),))
        for i, val in enumerate(arr):
            if val > 0.01:
                g.add([i], float(val), "REPLACE")


def rigid_skin(ob, bone):
    ob.vertex_groups.clear()
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")


def bind(ob, arm):
    ob.parent = arm
    m = ob.modifiers.new("Armature", "ARMATURE")
    m.object = arm


# ---------------------------------------------------------------- baking
def attr_fur_nodes(mat, base_attr="col", bump_scale=(200.0, 200.0, 70.0), bump_dist=0.0035, coord_scale_col=120.0, dark=0.09):
    """Adds a vertex-attribute base colour with procedural fur streaks and bump."""
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = base_attr
    coord = nt.nodes.new("ShaderNodeTexCoord")
    map1 = nt.nodes.new("ShaderNodeMapping")
    map1.inputs["Scale"].default_value = bump_scale
    nt.links.new(coord.outputs["Object"], map1.inputs[0])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.65
    nt.links.new(map1.outputs[0], noise.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.9
    bump.inputs["Distance"].default_value = bump_dist
    nt.links.new(noise.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], b.inputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = dark
    nt.links.new(attr.outputs[0], mix.inputs[1])
    nt.links.new(noise.outputs[1], mix.inputs[2])
    nt.links.new(mix.outputs[0], b.inputs["Base Color"])


def knit_nodes(mat, base_color):
    """Knit texture as a diagonal cross-rib bump in object space, so no UV or limb seams."""
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs[0])

    def wave(ax, az):
        m1 = nt.nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY"
        m1.inputs[1].default_value = ax
        nt.links.new(sep.outputs["X"], m1.inputs[0])
        m2 = nt.nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY"
        m2.inputs[1].default_value = az
        nt.links.new(sep.outputs["Z"], m2.inputs[0])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(m1.outputs[0], add.inputs[0])
        nt.links.new(m2.outputs[0], add.inputs[1])
        sin = nt.nodes.new("ShaderNodeMath")
        sin.operation = "SINE"
        nt.links.new(add.outputs[0], sin.inputs[0])
        return sin

    ribs = wave(380.0, 0.0)
    diag_a = wave(240.0, 300.0)
    diag_b = wave(240.0, -300.0)
    weak = nt.nodes.new("ShaderNodeMath")
    weak.operation = "ADD"
    nt.links.new(diag_a.outputs[0], weak.inputs[0])
    nt.links.new(diag_b.outputs[0], weak.inputs[1])
    scale = nt.nodes.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = 0.3
    nt.links.new(weak.outputs[0], scale.inputs[0])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    nt.links.new(ribs.outputs[0], add.inputs[0])
    nt.links.new(scale.outputs[0], add.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(add.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], b.inputs["Normal"])
    b.inputs["Base Color"].default_value = srgb(base_color)


def bake_image(ob, kind, name, size):
    """Bakes into a new image on the material's active image node, returns the image."""
    scene = bpy.context.scene
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    if kind == "NORMAL":
        img.colorspace_settings.name = "Non-Color"
    mat = ob.data.materials[0]
    nodes = mat.node_tree.nodes
    n = nodes.new("ShaderNodeTexImage")
    n.image = img
    n.select = True
    nodes.active = n
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 10
    scene.render.bake.use_clear = True
    aa.activate(ob)
    if kind == "DIFFUSE":
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE")
    else:
        scene.render.bake.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
    path = os.path.join(TEX_DIR, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    nodes.remove(n)
    return img, path


def uv_unwrap(ob, margin=0.008, angle=55):
    aa.activate(ob)
    for lay in list(ob.data.uv_layers):
        ob.data.uv_layers.remove(lay)
    ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.6)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize_material(ob, albedo_path, normal_path, name, rough, spec=0.25, sheen=0.0):
    new = aa.textured_mat(name, albedo=albedo_path, normal=normal_path, rough=rough, spec=spec)
    b = new.node_tree.nodes["Principled BSDF"]
    b.inputs["Sheen Weight"].default_value = sheen
    ob.data.materials.clear()
    ob.data.materials.append(new)
    return new


# ---------------------------------------------------------------- animation
def key(ob, action_name, frames, set_pose):
    """set_pose(frame_fraction) writes pose bone rotations; keyframes all bones it touches."""
    action = bpy.data.actions.new(action_name)
    ob.animation_data_create()
    ob.animation_data.action = action
    for fi, frame in enumerate(frames):
        for pb in ob.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        touched = set_pose(ob, frame, frames[-1])
        for b in touched:
            pb = ob.pose.bones[b]
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=b)
            pb.keyframe_insert("scale", frame=frame, group=b)
    action.use_fake_user = True
    track = ob.animation_data.nla_tracks.new()
    track.name = action_name
    strip = track.strips.new(action_name, int(frames[0]), action)
    ob.animation_data.action = None
    return action


def rot(pb, axis, angle):
    q = Matrix.Rotation(angle, 4, axis).to_quaternion()
    pb.rotation_quaternion = q @ pb.rotation_quaternion


def make_clips(arm):
    fps = 30
    # idle: slow breathing, loops every 4 s. The first and last key match.
    def idle(ob, f, last):
        t = (f - 1) / (last - 1) * 2 * math.pi
        breath = math.sin(t)
        p = ob.pose.bones
        grow = 1 + 0.0065 * (breath + 1)
        p["chest"].scale = (grow, grow, grow)
        p["neck"].scale = (1 / grow, 1 / grow, 1 / grow)
        p["upper_L"].scale = (1 / grow, 1 / grow, 1 / grow)
        p["upper_R"].scale = (1 / grow, 1 / grow, 1 / grow)
        rot(p["chest"], "X", math.radians(0.8 * breath))
        rot(p["head"], "X", math.radians(-0.9 * math.sin(t + 0.8)))
        rot(p["head"], "Z", math.radians(0.8 * math.sin(t * 0.5 + 0.3)))
        rot(p["ear1_L"], "X", math.radians(1.5 * math.sin(t + 1.0)))
        rot(p["ear1_R"], "X", math.radians(1.5 * math.sin(t + 1.4)))
        rot(p["upper_L"], "Z", math.radians(1.0 * math.sin(t)))
        rot(p["fore_L"], "Z", math.radians(1.2 * math.sin(t + 0.6)))
        return ["chest", "neck", "upper_R", "head", "ear1_L", "ear1_R", "upper_L", "fore_L"]

    key(arm, "idle", [1 + round(i * 12 / 4) for i in range(17)][:1] + [1 + i * 15 for i in range(1, 8)] + [1 + 120], idle)

    # ears: a quick flick of one ear then the other, 1.2 s.
    def ears(ob, f, last):
        t = (f - 1) / (last - 1)
        p = ob.pose.bones
        env_l = math.sin(min(t / 0.5, 1) * math.pi)
        env_r = math.sin(max((t - 0.4) / 0.6, 0) * math.pi) if t > 0.4 else 0
        rot(p["ear1_L"], "X", math.radians(-12 * env_l))
        rot(p["ear2_L"], "X", math.radians(-9 * env_l))
        rot(p["ear3_L"], "X", math.radians(-14 * env_l))
        rot(p["ear1_R"], "X", math.radians(-12 * env_r))
        rot(p["ear2_R"], "X", math.radians(-9 * env_r))
        rot(p["ear3_R"], "X", math.radians(-14 * env_r))
        return ["ear1_L", "ear2_L", "ear3_L", "ear1_R", "ear2_R", "ear3_R"]

    key(arm, "ears", list(range(1, 38, 3)) + [37], ears)

    # greet: open arm lifts and waves, head tilts toward the student, 2.4 s, loops back to rest.
    def greet(ob, f, last):
        t = (f - 1) / (last - 1)
        env = math.sin(min(t / 0.25, 1) * math.pi / 2) * math.sin(min((1 - t) / 0.25, 1) * math.pi / 2)
        wave = math.sin(t * math.pi * 5)
        p = ob.pose.bones
        rot(p["upper_L"], "Y", math.radians(-14 * env))
        rot(p["upper_L"], "Z", math.radians(10 * env))
        rot(p["fore_L"], "Z", math.radians(-10 * env + 14 * env * wave))
        rot(p["hand_L"], "Z", math.radians(10 * env * wave))
        rot(p["head"], "Y", math.radians(5 * env))
        rot(p["head"], "X", math.radians(4 * env))
        rot(p["ear1_L"], "X", math.radians(-6 * env))
        rot(p["ear1_R"], "X", math.radians(-6 * env))
        return ["upper_L", "fore_L", "hand_L", "head", "ear1_L", "ear1_R"]

    key(arm, "greet", list(range(1, 74, 3)) + [73], greet)


def make_blink(objs):
    """blink is a shape key action shared by the lids and lashes."""
    for ob in objs:
        ob.data.shape_keys.use_relative = True
    action = bpy.data.actions.new("blink")
    for ob in objs:
        ad = ob.data.shape_keys.animation_data_create()
        ad.action = action
        kb = ob.data.shape_keys.key_blocks["blink"]
        for f, v in ((1, 0.0), (3, 0.0), (5, 1.0), (7, 1.0), (10, 0.0)):
            kb.value = v
            kb.keyframe_insert("value", frame=f, group="blink")
        kb.value = 0.0
    action.use_fake_user = True
    return action


# ---------------------------------------------------------------- main
def build(M):
    body = extract(body_sdf, BODY_BOUNDS, STEP, "TeacherBody", M["fur"], 46000)
    cardigan = extract(cardigan_sdf, TORSO_BOUNDS, STEP, "TeacherCardigan", M["cardigan"], 14000)
    shirt = extract(shirt_sdf, TORSO_BOUNDS, STEP, "TeacherShirt", M["shirt"], 3000)
    collar = extract(collar_sdf, ((-0.3, 0.3), (-0.34, -0.1), (1.08, 1.32)), max(STEP * 0.7, 0.004), "TeacherCollar", M["collar"], 2000)
    bow = extract(bow_sdf, ((-0.3, 0.3), (-0.38, -0.2), (1.04, 1.32)), max(STEP * 0.6, 0.004), "TeacherBow", M["bow"], 5000, smooth_iters=1)
    eyes = build_eyes(M)
    lid, lash = build_lids_and_lashes(M)
    bits = brow_and_nose(M)
    skirt, band = build_skirt(M)
    book = build_book(M)
    buttons = build_buttons(M, cardigan_sdf)
    bits_ob = aa.join(bits, "TeacherFace")
    btn_ob = aa.join(buttons, "TeacherButtons")
    return dict(body=body, cardigan=cardigan, shirt=shirt, collar=collar, bow=bow, eyes=eyes, lid=lid, lash=lash, face=bits_ob, skirt=skirt, band=band, book=book, buttons=btn_ob)


def paint_vertex_colors(ob, fn):
    P = np.array([list(v.co) for v in ob.data.vertices])
    col = fn(P)
    ca = ob.data.color_attributes.new("col", "FLOAT_COLOR", "POINT")
    rgba = np.column_stack([col, np.ones(len(col))]).astype(np.float32)
    ca.data.foreach_set("color", rgba.ravel())
    ob.data.color_attributes.active_color = ca


def duplicate_static(objs, name):
    """Non-deforming copy of the character for the room's contact shadow bake."""
    copies = []
    for src in objs:
        data = src.data.copy()
        ob = aa.link(bpy.data.objects.new(name + "_" + src.name, data))
        copies.append(ob)
    joined = aa.join(copies, name)
    # Drop shape keys so the join stays a plain mesh for the room scene.
    if joined.data.shape_keys:
        aa.activate(joined)
        bpy.ops.object.shape_key_remove(all=True)
    return joined


def export_teacher(P, M):
    aa.setup_cycles(samples=4, res=(64, 64))
    # Shape keys must exist before the armature modifier so binding keeps them.
    arm = make_armature()
    skin_targets = dict(P)
    skin_from_parts(P["body"], arm, parts_of)
    skin_from_parts(P["cardigan"], arm, parts_of)
    skin_from_parts(P["shirt"], arm, parts_of)
    for key_name, bone in (("collar", "chest"), ("bow", "chest"), ("face", "head"), ("eyes", "head"), ("lid", "head"), ("lash", "head"), ("skirt", "hips"), ("band", "hips"), ("book", "hand_R"), ("buttons", "chest")):
        rigid_skin(P[key_name], bone)
    for ob in P.values():
        bind(ob, arm)
    uv_unwrap(P["body"], margin=0.006, angle=50)
    uv_unwrap(P["cardigan"], margin=0.008, angle=55)
    print("baking body textures")
    albedo, albedo_p = bake_image(P["body"], "DIFFUSE", "fur_albedo", int(os.environ.get("AA_FUR_TEX", "2048")))
    normal, normal_p = bake_image(P["body"], "NORMAL", "fur_normal", int(os.environ.get("AA_FUR_TEX", "2048")))
    print("baking cardigan textures")
    card_a, card_ap = bake_image(P["cardigan"], "DIFFUSE", "card_albedo", 1024)
    card_n, card_np = bake_image(P["cardigan"], "NORMAL", "card_normal", 1024)
    finalize_material(P["body"], albedo_p, normal_p, "teacher_fur_final", rough=0.92)
    finalize_material(P["cardigan"], card_ap, card_np, "teacher_cardigan_final", rough=0.88)
    make_clips(arm)
    make_blink([P["lid"], P["lash"]])
    # Pose-free reference for the bake shadow in the room scene.
    proxy_sources = [P[k] for k in ("body", "cardigan", "skirt", "book", "band")]
    proxy = duplicate_static(proxy_sources, "TeacherBake")
    proxy.data.materials.clear()
    proxy.data.materials.append(aa.make_mat("bake_grey", "#ccc4e0", rough=0.9))
    proxy.rotation_euler = (0, 0, float(os.environ.get("AA_TEACHER_YAW", "0.195")))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(aa.WORK, "teacher.blend"))
    # Export skinned character only.
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for ob in P.values():
        ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(aa.WORK, "teacher_raw.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_all_influences=False,
        export_def_bones=False,
        export_optimize_animation_size=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_lights=False,
        export_cameras=False,
    )
    print("exported", out, os.path.getsize(out))


def setup_preview_world():
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    sun = bpy.data.lights.new("s", "SUN")
    sun.energy = 2.0
    sun.angle = math.radians(25)
    o = aa.link(bpy.data.objects.new("s", sun))
    o.rotation_euler = (math.radians(55), 0, math.radians(-25))
    ground = aa.obj_from("ground", [(-5, -5, 0), (5, -5, 0), (5, 5, 0), (-5, 5, 0)], [(0, 1, 2, 3)], aa.make_mat("g", "#efeae0", rough=0.8), smooth=False)
    return ground


def render_closeup(objs, name, loc, target, fov=26):
    cam = bpy.data.cameras.new("c")
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(fov)
    ob = aa.link(bpy.data.objects.new("c", cam))
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.camera = ob
    scene.render.filepath = os.path.join(aa.WORK, name)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    aa.clear_scene()
    M = materials()
    P = build(M)
    paint_vertex_colors(P["body"], body_colors)
    attr_fur_nodes(M["fur"])
    knit_nodes(M["cardigan"], "#f6eedd")
    if STAGE == "export":
        export_teacher(P, M)
    if STAGE == "preview":
        aa.setup_cycles(samples=int(os.environ.get("AA_SPP", "32")), res=(960, 960))
        setup_preview_world()
        render_closeup(P, "teacher_full.png", (-0.3, -7.5, 1.4), (0.1, 0, 1.25), fov=22)
        render_closeup(P, "teacher_face.png", (0.15, -3.0, 1.75), (0, -0.2, 1.6), fov=18)
        print("preview done")
