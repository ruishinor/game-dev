"""Body-fitted chest armour geometry (no Blender).

Each armour piece is authored against the project's own runtime bodies
(client/assets/humanoid_m.glb and humanoid_f.glb) in their bind (T) pose, so
the result can be skinned to the same 67-joint skeleton and worn by every
player and NPC built on those bodies. Shapes are lofted from the body's own
cross-sections plus an offset, never from primitives scaled to a guess:

* the vest body follows the torso's upper radial envelope at each height,
  with a neckline and armholes;
* shoulder yokes loft along the neck -> shoulder axis over the top half;
* chest/back plates, insets, straps, bindings and hardware sit on the vest
  surface at a larger offset, so layers never interpenetrate.

All heights are expressed in body units u = (y - pelvis) / (neck - pelvis),
so one design fits both bodies. The design vocabulary (palette, panel
layout, silhouette per item) comes from the existing vector inventory art in
client/src/catalogue-portraits.js; see docs/art/ARMOUR-3D.md.

Pieces use the same dict format as humanoid_wardrobe.export_pieces, so the
Blender "wardrobe" op gives them thickness, bevels, materials and bakes.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from .humanoid_analysis import _accessor, read_glb
from .humanoid_wardrobe import angular_envelope, box, cylinder, grid_faces, torus

TORSO_JOINTS = ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "clavicle_l", "clavicle_r")
ARM_PREFIX = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")


def _ss(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- body


def load_body(path):
    """Plain (dequantized) humanoid GLB -> body mesh with skin data and joints."""
    j, b = read_glb(path)
    skin = j["skins"][0]
    joints = [j["nodes"][i]["name"] for i in skin["joints"]]
    ibm = _accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    bind = {n: np.linalg.inv(m)[:3, 3] for n, m in zip(joints, ibm)}
    meshes = {}
    for n in j["nodes"]:
        if "mesh" not in n:
            continue
        m = j["meshes"][n["mesh"]]
        pr = m["primitives"][0]
        a = pr["attributes"]
        meshes[m["name"]] = {
            "V": _accessor(j, b, a["POSITION"]).astype(float),
            "N": _accessor(j, b, a["NORMAL"]).astype(float),
            "F": _accessor(j, b, pr["indices"]).astype(np.int64).reshape(-1, 3),
            "J": _accessor(j, b, a["JOINTS_0"]).astype(np.int64),
            "W": _accessor(j, b, a["WEIGHTS_0"]).astype(float),
        }
    return {"joints": joints, "ibm": ibm, "bind": bind, "meshes": meshes}


class FitBody:
    """Dense surface samples of the body (plus any worn-under shells), with
    interpolated skin weights and a torso/arm/head/leg labelling from them."""

    def __init__(self, body, n=120000, seed=3, under=("shell_chest", "shell_coat", "shell_belt", "shell_upperarms")):
        import trimesh

        self.joints = body["joints"]
        self.L = {k: np.asarray(v, float) for k, v in body["bind"].items()}
        mb = body["meshes"]["body"]
        tm = trimesh.Trimesh(mb["V"], mb["F"], process=False)
        P, fi = trimesh.sample.sample_surface(tm, n, seed=seed)
        bary = trimesh.triangles.points_to_barycentric(tm.triangles[fi], P)
        F = mb["F"][fi]
        nj = len(self.joints)
        Wd = np.zeros((len(P), nj))
        for c in range(3):
            for k in range(4):
                np.add.at(Wd, (np.arange(len(P)), mb["J"][F[:, c], k]), bary[:, c] * mb["W"][F[:, c], k])
        Nn = (mb["N"][F] * bary[..., None]).sum(1)
        Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
        self.P, self.N, self.Wd = P, Nn, Wd
        ji = {n: i for i, n in enumerate(self.joints)}
        torso = Wd[:, [ji[n] for n in TORSO_JOINTS]].sum(1)
        arm = Wd[:, [i for n, i in ji.items() if n.startswith(ARM_PREFIX)]].sum(1)
        head = Wd[:, [ji[n] for n in ("Head",) if n in ji]].sum(1)
        self.torso = (torso > 0.5) & (arm < 0.35)
        self.arm = arm >= 0.35
        self.head = head > 0.5
        self.tree = cKDTree(P)
        # the outer surface the armour must clear: body or worn-under shells
        U = [mb["V"]]
        Sh = []
        for k, s in enumerate(under):
            if s in body["meshes"]:
                U.append(body["meshes"][s]["V"])
                ms = body["meshes"][s]
                Sh.append(trimesh.sample.sample_surface(trimesh.Trimesh(ms["V"], ms["F"], process=False), n // 6, seed=seed + 1 + k)[0])
        self.outer = np.concatenate(U)
        self.outer_shells = np.concatenate(Sh) if Sh else np.zeros((0, 3))
        self.y_p, self.y_n = self.L["pelvis"][1], self.L["neck_01"][1]
        self._cache = {}

    def y(self, u):
        return self.y_p + np.asarray(u, float) * (self.y_n - self.y_p)

    def centre(self, y):
        p, n = self.L["pelvis"], self.L["neck_01"]
        t = (y - p[1]) / (n[1] - p[1])
        return np.array([0.0, y, p[2] + t * (n[2] - p[2])])

    def radius(self, y, thetas, half=0.01, x_limit=None):
        key = (round(float(y), 4), x_limit)
        if key not in self._cache:
            sel = self.torso & (np.abs(self.P[:, 1] - y) < half)
            if x_limit is not None:
                sel &= np.abs(self.P[:, 0]) < x_limit
            if sel.sum() < 12:
                sel = (~self.head) & (np.abs(self.P[:, 1] - y) < half * 2) & (np.abs(self.P[:, 0]) < (x_limit or 0.25))
            d = self.P[sel] - self.centre(y)
            self._cache[key] = angular_envelope(np.arctan2(d[:, 0], d[:, 2]), np.hypot(d[:, 0], d[:, 2]), bins=96, smooth=3)
        cen, env = self._cache[key]
        return np.interp(thetas, cen, env, period=2 * np.pi)

    def on_torso(self, theta, u, off, x_limit=None):
        y = float(self.y(u))
        r = self.radius(y, np.array([theta]), x_limit=x_limit)[0] + off
        c = self.centre(y)
        return np.array([c[0] + r * np.sin(theta), y, c[2] + r * np.cos(theta)]), np.array([np.sin(theta), 0.0, np.cos(theta)])


def torso_sheet(body, ns, nq, fn, closed=False, x_limit=0.2):
    """Sheet over the torso from fn(s, q) -> (theta, u, offset)."""
    P = []
    for s in np.linspace(0, 1, ns):
        for q in np.linspace(0, 1, nq, endpoint=not closed):
            th, u, off = fn(s, q)
            y = round(float(body.y(u)), 3)
            r = body.radius(y, np.array([th]), x_limit=x_limit)[0]
            c = body.centre(y)
            P.append([c[0] + (r + off) * np.sin(th), y, c[2] + (r + off) * np.cos(th)])
    return np.array(P), grid_faces(ns, nq, closed)


def yoke(body, side, t_levels, phis, offset, start_x=0.055, end_k=1.12):
    """Saddle over the top of the shoulder: lofted along the neck->shoulder
    axis over the upper half of the cross-section (phi 0 = up, +90 = front)."""
    sg = 1.0 if side == "l" else -1.0
    sh = body.L["upperarm_" + side]
    a = np.array([sg * start_x, sh[1] + 0.01, body.L["neck_01"][2]])
    b = a + (sh - a) * end_k
    u = (b - a) / np.linalg.norm(b - a)
    up = np.array([0, 1.0, 0]) - u * u[1]
    up /= np.linalg.norm(up)
    fwd = np.cross(u, up) * sg
    sel = ~body.head
    d = body.P[sel] - a
    s = d @ u
    radial = np.linalg.norm(d - np.outer(s, u), axis=1)
    Lx = np.linalg.norm(b - a)
    rows = []
    for t in t_levels:
        m = (np.abs(s - t * Lx) < 0.012) & (radial < 0.16)
        dv, dw = d[m] @ up, d[m] @ fwd
        cen, env = angular_envelope(np.arctan2(dw, dv), np.hypot(dv, dw), bins=64, smooth=3)
        r = np.interp(phis, cen, env, period=2 * np.pi) + (offset(phis, t) if callable(offset) else offset)
        c = a + u * t * Lx
        rows.append(c + np.outer(r * np.cos(phis), up) + np.outer(r * np.sin(phis), fwd))
    return np.concatenate(rows), grid_faces(len(t_levels), len(phis), False)


def ribbon_around(body, u, th0, th1, width_u, off, n=40):
    """Horizontal band on the torso between two angles (a strap or binding)."""
    return torso_sheet(body, 3, n, lambda s, q: (th0 + (th1 - th0) * q, u + (s - 0.5) * width_u, off))


def vertical_strip(body, th, u0, u1, half_w, off, n=24):
    """Narrow vertical strip on the torso (piping, seam lines)."""
    return torso_sheet(body, n, 3, lambda s, q: (th + (q - 0.5) * 2 * half_w, u0 + (u1 - u0) * s, off))


# ---------------------------------------------------------------- designs


def _piece(name, item, mat, V, F, **kw):
    d = {"name": f"{item}__{name}", "set": item, "mat": mat, "skin": kw.pop("skin", "transfer"), "V": V, "F": F, "core": True}
    d.update(kw)
    return d


def vest_body(body, item, mat, base, hem_u=0.36, neck_front=0.84, neck_back=0.9, arm_u=0.74, top_u=0.95):
    """The vest shell: closed below the armholes, neckline and armholes above."""
    deg = np.radians

    def fn(s, q):
        th = 2 * np.pi * q - np.pi
        side = np.abs(np.sin(th))  # 1 at the sides (armholes)
        front = np.cos(th) > 0
        neck = neck_front if front else neck_back
        # top edge: armhole low at the sides, shoulder line between, neckline at centre
        centre_w = np.exp(-((np.abs(th) if front else (np.pi - np.abs(th))) / deg(26)) ** 2)
        top = top_u - (top_u - arm_u) * _ss(0.55, 0.92, side) - (top_u - neck) * centre_w
        bot = hem_u - (0.03 if not front else 0.0) * (1 - side)
        u = bot + s * (top - bot)
        return th, u, base + 0.002 * s
    V, F = torso_sheet(body, 16, 72, fn, closed=True, x_limit=0.2)
    return _piece("vest", item, mat, V, F, thickness=0.006, bevel=0.0015)


def plate(body, item, name, mat, centre_th, half_w, u0, u1, off, keel=0.0, taper=0.25, ns=12, nq=20, **kw):
    """A convex plate over the torso: width tapers toward the top, optional keel."""
    def fn(s, q):
        u = u0 + (u1 - u0) * s
        w = half_w * (1 - taper * s)
        x = 2 * q - 1
        th = centre_th + x * w
        return th, u, off + keel * np.exp(-(x * 1.6) ** 2)
    V, F = torso_sheet(body, ns, nq, fn)
    return _piece(name, item, mat, V, F, **{"thickness": 0.005, "bevel": 0.002, **kw})


def design_field(body, base, m):
    """Field Composite Vest (Common): slate composite vest, sage shoulder
    yokes, olive chest panel with a dark inset, tan webbing straps."""
    it, deg = "field_chest", np.radians
    P = [vest_body(body, it, m["vest"], base)]
    for s in ("l", "r"):
        V, F = yoke(body, s, np.linspace(0.05, 1.0, 9), np.linspace(-deg(95), deg(95), 22), base + 0.012)
        P.append(_piece("yoke_" + s, it, m["yoke"], V, F, thickness=0.005, bevel=0.002))
    P.append(plate(body, it, "chest_panel", m["panel"], 0.0, deg(46), 0.45, 0.8, base + 0.009, keel=0.004))
    P.append(plate(body, it, "chest_inset", m["inset"], 0.0, deg(20), 0.52, 0.7, base + 0.016, taper=0.1, ns=8, nq=10))
    P.append(plate(body, it, "back_panel", m["panel"], np.pi, deg(50), 0.42, 0.82, base + 0.009))
    for k, uu in enumerate((0.52, 0.66)):
        for s, sg in (("l", 1), ("r", -1)):
            V, F = ribbon_around(body, uu, sg * deg(52), sg * deg(128), 0.035, base + 0.008, n=20)
            P.append(_piece(f"strap_{s}{k}", it, m["strap"], V, F, thickness=0.003))
            p, n = body.on_torso(sg * deg(90), uu, base + 0.014)
            V, F = box(p, (0.022, 0.026, 0.006), np.array([0, 1.0, 0]), n)
            P.append(_piece(f"buckle_{s}{k}", it, m["hardware"], V, F, bevel=0.0015))
    V, F = ribbon_around(body, 0.37, -np.pi, np.pi, 0.022, base + 0.007, n=72)
    P.append(_piece("hem_binding", it, m["strap"], V, F, thickness=0.003))
    return P


def design_reinforced(body, base, m):
    """Reinforced Relay Vest (Rare): blue-slate vest under layered steel
    plates, large asymmetric pale pauldron-yokes, a teal inset, amber piping
    and a relay housing on the left chest."""
    it, deg = "reinforced_chest", np.radians
    P = [vest_body(body, it, m["vest"], base, hem_u=0.33)]
    for s, big in (("l", 1.0), ("r", 0.82)):
        V, F = yoke(body, s, np.linspace(0.0, 1.0 + 0.12 * big, 10), np.linspace(-deg(105), deg(105), 24),
                    lambda ph, t, big=big: base + 0.014 + 0.012 * big * _ss(0.6, 1.1, t))
        P.append(_piece("pauldron_" + s, it, m["yoke"], V, F, thickness=0.006, bevel=0.0025))
    P.append(plate(body, it, "chest_plate", m["plate"], 0.0, deg(52), 0.6, 0.86, base + 0.011, keel=0.006))
    P.append(plate(body, it, "ab_plate_upper", m["plate"], 0.0, deg(44), 0.47, 0.6, base + 0.012, taper=0.05, ns=6))
    P.append(plate(body, it, "ab_plate_lower", m["plate"], 0.0, deg(40), 0.35, 0.47, base + 0.013, taper=0.05, ns=6))
    P.append(plate(body, it, "chest_inset", m["inset"], 0.0, deg(24), 0.63, 0.8, base + 0.019, taper=0.15, ns=8, nq=10))
    P.append(plate(body, it, "back_plate", m["plate"], np.pi, deg(54), 0.45, 0.86, base + 0.011))
    for k, th in enumerate((-deg(30), deg(30))):
        V, F = vertical_strip(body, th, 0.6, 0.86, deg(1.6), base + 0.0175)
        P.append(_piece(f"piping_{k}", it, m["trim"], V, F, thickness=0.002))
    V, F = ribbon_around(body, 0.6, -deg(44), deg(44), 0.012, base + 0.018, n=24)
    P.append(_piece("piping_waist", it, m["trim"], V, F, thickness=0.002))
    p, n = body.on_torso(deg(32), 0.72, base + 0.032)
    V, F = box(p, (0.05, 0.06, 0.022), np.array([0, 1.0, 0]), n)
    hw = [(V, F)]
    for dy in (-0.018, 0.0, 0.018):
        q = p + np.array([0, dy, 0]) + n * 0.012
        hw.append(cylinder(q - n * 0.002, q + n * 0.008, 0.0045, n=10))
    P.append({**_piece("relay_housing", it, m["hardware"], None, None, bevel=0.002), "V": hw, "F": None})
    rv = []
    for th in (-deg(40), -deg(14), deg(14), deg(40)):
        for uu in (0.5, 0.82):
            p, n = body.on_torso(th, uu, base + 0.018)
            rv.append(cylinder(p, p + n * 0.006, 0.004, n=8))
    P.append({**_piece("rivets", it, m["trim"], None, None), "V": rv, "F": None})
    return P


def design_resonant(body, base, m):
    """Resonance-Lined Vest (Very rare): violet-slate vest, lavender shoulder
    yokes, a dark teal plastron with a resonant diamond core, and mint
    resonance lines (emissive) along the plastron and ribs."""
    it, deg = "resonant_chest", np.radians
    P = [vest_body(body, it, m["vest"], base, hem_u=0.34, neck_front=0.8)]
    for s in ("l", "r"):
        V, F = yoke(body, s, np.linspace(0.05, 1.04, 9), np.linspace(-deg(100), deg(100), 22),
                    lambda ph, t: base + 0.013 + 0.006 * np.cos(ph))
        P.append(_piece("yoke_" + s, it, m["yoke"], V, F, thickness=0.005, bevel=0.002))

    def plastron(s, q):
        u = 0.4 + 0.42 * s
        w = deg(40) * (1 - 0.55 * _ss(0.55, 1.0, s)) * (0.75 + 0.25 * _ss(0.0, 0.3, s))
        x = 2 * q - 1
        return x * w, u, base + 0.01 + 0.006 * np.exp(-(x * 1.4) ** 2)
    V, F = torso_sheet(body, 14, 20, plastron)
    P.append(_piece("plastron", it, m["plate"], V, F, thickness=0.005, bevel=0.002))
    P.append(plate(body, it, "back_plate", m["plate"], np.pi, deg(46), 0.44, 0.84, base + 0.01))

    def core(s, q):
        # diamond: half width shrinks to 0 at both ends
        u = 0.54 + 0.2 * s
        w = deg(13) * (1 - abs(2 * s - 1))
        return (2 * q - 1) * max(w, deg(0.6)), u, base + 0.02
    V, F = torso_sheet(body, 9, 7, core)
    P.append(_piece("core", it, m["core"], V, F, thickness=0.004, bevel=0.0015))
    lines = []
    for th in (-deg(18), deg(18)):
        lines.append(vertical_strip(body, th, 0.42, 0.8, deg(1.1), base + 0.0175))
    for k, uu in enumerate((0.48, 0.58)):
        for sg in (1, -1):
            lines.append(ribbon_around(body, uu, sg * deg(24), sg * deg(70), 0.012, base + 0.004, n=18))
    lines.append(vertical_strip(body, 0.0, 0.48, 0.8, deg(0.9), base + 0.0215))
    P.append({**_piece("resonance_lines", it, m["lines"], None, None, thickness=0.0015), "V": lines, "F": None})
    return P


DESIGNS = {"field_chest": design_field, "reinforced_chest": design_reinforced, "resonant_chest": design_resonant}


def shell_layer(body, P):
    """Thickness of the worn-under layer (shells) above the body near P."""
    if not hasattr(body, "_layer"):
        t = cKDTree(body.P)
        layer = np.zeros(len(body.P))
        d, i = t.query(body.outer_shells) if len(body.outer_shells) else (np.zeros(0), np.zeros(0, int))
        np.maximum.at(layer, i, d)
        _, nb = t.query(body.P, k=24)
        body._layer = layer[nb].max(1)
    _, i = body.tree.query(P)
    return body._layer[i]


def push_clear(body, V, gap):
    """Move points out along the body normal until each clears the body by its
    worn-under layer plus `gap` (radial lofts sit closer on sloped surfaces)."""
    V = np.asarray(V, float).copy()
    for _ in range(3):
        _, i = body.tree.query(V)
        sd = np.sum((V - body.P[i]) * body.N[i], 1)
        need = shell_layer(body, V) + gap - sd
        mv = need > 0
        V[mv] += body.N[i[mv]] * need[mv, None]
    return V


def clearance(body, V):
    """Signed distance of points from the outer surface the armour clears
    (body or worn-under shell), using the nearest body sample normal."""
    t = cKDTree(body.outer)
    d, _ = t.query(V)
    _, i = body.tree.query(V)
    side = np.sign(np.sum((V - body.P[i]) * body.N[i], 1))
    return d * side
