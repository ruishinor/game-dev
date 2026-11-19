"""Occupational wardrobe geometry fitted to a humanoid body (no Blender).

Garments are generated from the body's own cross-sections rather than from
primitives: a torso panel is a loft of the body's *upper* radial envelope
plus an offset, so it follows the actual chest, waist and hips; limb pieces
loft along the bone axis; the sash is a ribbon swept along a path that is
projected onto the body surface. Blender then gives the pieces thickness,
bevels, materials and baked textures (blender/humanoid_build.py, op
"wardrobe").

Every piece is a dict: name, set (security/vendor), material class, skinning
rule ("rigid:<bone>" or "transfer") and a quad grid or triangle list in the
glTF frame (+Y up, +Z forward).
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree


def _ss(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def angular_envelope(theta, r, bins=72, upper=True, smooth=2):
    """Per-bin max (or min) radius over the full circle, gap-filled and smoothed."""
    edges = np.linspace(-np.pi, np.pi, bins + 1)
    b = np.clip(np.digitize(theta, edges) - 1, 0, bins - 1)
    env = np.full(bins, np.nan)
    for i in range(bins):
        m = b == i
        if m.any():
            env[i] = np.percentile(r[m], 97 if upper else 3)
    ok = ~np.isnan(env)
    if not ok.any():
        raise ValueError("empty section")
    idx = np.arange(bins)
    env = np.interp(idx, idx[ok], env[ok], period=bins)
    k = np.ones(2 * smooth + 1) / (2 * smooth + 1)
    env = np.convolve(np.r_[env[-smooth:], env, env[:smooth]], k, mode="valid")
    centres = 0.5 * (edges[:-1] + edges[1:])
    return centres, env


class Body:
    """Queries on the body surface (glTF frame)."""

    def __init__(self, V, N, regions, region_names, landmarks):
        """V/N/regions should be dense surface samples (a decimated mesh's
        vertices are too sparse for envelope queries at shoulder scale)."""
        self.V, self.N = np.asarray(V, float), np.asarray(N, float)
        self.reg = regions
        self.R = {n: regions == i for i, n in enumerate(region_names)}
        self.L = {k: np.asarray(v, float) for k, v in landmarks.items()}
        self.tree = cKDTree(self.V)
        self._cache = {}

    def torso_centre(self, y):
        p, n = self.L["pelvis"], self.L["neck_01"]
        t = (y - p[1]) / (n[1] - p[1])
        return np.array([0.0, y, p[2] + t * (n[2] - p[2])])

    def torso_radius(self, y, thetas, half=0.008, x_limit=None):
        key = (round(float(y), 4), x_limit)
        if key not in self._cache:
            sel = (self.R["torso"]) & (np.abs(self.V[:, 1] - y) < half)
            if x_limit is not None:
                sel &= np.abs(self.V[:, 0]) < x_limit
            c = self.torso_centre(y)
            d = self.V[sel] - c
            th, r = np.arctan2(d[:, 0], d[:, 2]), np.hypot(d[:, 0], d[:, 2])
            self._cache[key] = angular_envelope(th, r)
        cen, env = self._cache[key]
        return np.interp(thetas, cen, env, period=2 * np.pi)

    def surface(self, P):
        """Nearest body vertex position and normal for each query point."""
        _, i = self.tree.query(P)
        return self.V[i], self.N[i]


def grid_faces(nr, nc, closed=False):
    F = []
    cols = nc if closed else nc - 1
    for i in range(nr - 1):
        for j in range(cols):
            a, b = i * nc + j, i * nc + (j + 1) % nc
            c, d = a + nc, b + nc
            F += [[a, b, d], [a, d, c]]
    return np.array(F, int)


def torso_panel(body, y_levels, thetas, offset, closed=False, bulge=None):
    """Loft over the torso's upper radial envelope. offset(theta, y) or float."""
    rows = []
    for y in y_levels:
        r = body.torso_radius(y, thetas)
        off = offset(thetas, y) if callable(offset) else offset
        if bulge is not None:
            off = off + bulge(thetas, y)
        c = body.torso_centre(y)
        rr = r + off
        rows.append(np.stack([c[0] + rr * np.sin(thetas), np.full_like(thetas, y), c[2] + rr * np.cos(thetas)], 1))
    P = np.concatenate(rows)
    return P, grid_faces(len(y_levels), len(thetas), closed)


def limb_frame(a, b):
    u = (b - a) / np.linalg.norm(b - a)
    fwd = np.array([0, 0, 1.0])
    v = fwd - u * np.dot(fwd, u)
    v /= np.linalg.norm(v)
    w = np.cross(u, v)
    return u, v, w


def limb_panel(body, region, a, b, t_levels, phis, offset, closed=True, lateral=None, max_r=0.14):
    """Loft along the a->b axis over the limb's upper radial envelope.

    region None uses every surface sample within max_r of the axis; with
    `lateral` (a world direction) phi=0 points that way.
    """
    u, v, w = limb_frame(a, b)
    if lateral is not None:
        v = lateral - u * np.dot(lateral, u)
        v /= np.linalg.norm(v)
        w = np.cross(u, v)
    L = np.linalg.norm(b - a)
    sel = body.R[region] if region else np.ones(len(body.V), bool)
    d = body.V[sel] - a
    s = d @ u
    radial = np.linalg.norm(d - np.outer(s, u), axis=1)
    rows = []
    for t in t_levels:
        m = (np.abs(s - t * L) < 0.015) & (radial < max_r)
        dv, dw = d[m] @ v, d[m] @ w
        cen, env = angular_envelope(np.arctan2(dw, dv), np.hypot(dv, dw), bins=48)
        r = np.interp(phis, cen, env, period=2 * np.pi) + (offset(phis, t) if callable(offset) else offset)
        c = a + u * t * L
        rows.append(c + np.outer(r * np.cos(phis), v) + np.outer(r * np.sin(phis), w))
    return np.concatenate(rows), grid_faces(len(t_levels), len(phis), closed)


def dome(centre, axis, up, radius_fn, n_az=28, n_el=9, el_range=(0.0, 1.25), az_range=(-np.pi, np.pi)):
    """Partial dome around `axis` (e.g. a pauldron over the shoulder pivot)."""
    axis = axis / np.linalg.norm(axis)
    x = up - axis * np.dot(up, axis)
    x /= np.linalg.norm(x)
    y = np.cross(axis, x)
    rows = []
    els = np.linspace(*el_range, n_el)
    azs = np.linspace(*az_range, n_az)
    for el in els:
        dirs = (np.outer(np.cos(azs), y) + np.outer(np.sin(azs), axis)) * np.cos(el) + x * np.sin(el)
        # dirs sweep from the arm axis sides up over the top (x)
        r = radius_fn(dirs)
        rows.append(centre + dirs * r[:, None])
    return np.concatenate(rows), grid_faces(n_el, n_az, False)


def envelope_radius(body, centre, dirs, offset, max_r=0.2, cone=0.25):
    """Distance from centre to the body surface along each direction (upper envelope)."""
    d = body.V - centre
    dist = np.linalg.norm(d, axis=1)
    near = dist < max_r
    dn = d[near] / dist[near, None]
    out = np.empty(len(dirs))
    for i, q in enumerate(dirs):
        cos = dn @ q
        m = cos > np.cos(cone)
        out[i] = (np.percentile(dist[near][m], 95) if m.sum() > 3 else max_r * 0.5) + offset
    return out


def ribbon(body, path, width, offset, n=40, twist=None, normal_hint=None):
    """Strip swept along a polyline projected onto the body surface."""
    path = np.asarray(path, float)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    s = np.linspace(0, seg[-1], n)
    P = np.stack([np.interp(s, seg, path[:, i]) for i in range(3)], 1)
    S, Nn = body.surface(P)
    # smooth the surface normals along the strip
    for _ in range(3):
        Nn[1:-1] = (Nn[:-2] + 2 * Nn[1:-1] + Nn[2:]) / 4
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    C = S + Nn * offset
    for _ in range(4):
        C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    B = np.cross(T, Nn)
    B /= np.linalg.norm(B, axis=1, keepdims=True)
    if twist is not None:
        a = twist(np.linspace(0, 1, n))
        B = B * np.cos(a)[:, None] + Nn * np.sin(a)[:, None]
    W = width(np.linspace(0, 1, n)) if callable(width) else np.full(n, width)
    rows = [C - B * (W / 2)[:, None], C, C + B * (W / 2)[:, None]]
    P = np.stack(rows, 1).reshape(-1, 3)
    return P, grid_faces(n, 3, False)


def hanging_ribbon(top, length, width, sway, n=24, fold=0.006, phase=0.0):
    """Cloth tail hanging from `top`: slight outward sway and lengthwise folds."""
    t = np.linspace(0, 1, n)
    centre = top + np.outer(t * length, [0, -1, 0]) + np.outer(t ** 1.6, sway)
    W = width * (1 + 0.25 * t)
    rows = []
    for k, frac in enumerate((-0.5, -0.25, 0.0, 0.25, 0.5)):
        z = fold * np.sin(np.pi * 2 * frac + phase) * (0.4 + t)
        rows.append(centre + np.outer(W * frac, [1, 0, 0]) * 0.0 + np.outer(W * frac, [0.96, 0, 0.28]) + np.outer(z, [0, 0, 1]))
    P = np.stack(rows, 1).reshape(-1, 3)
    return P, grid_faces(n, 5, False)


def box(centre, size, up, fwd, bevel_hint=True):
    up = up / np.linalg.norm(up)
    fwd = fwd - up * np.dot(fwd, up)
    fwd /= np.linalg.norm(fwd)
    side = np.cross(up, fwd)
    hx, hy, hz = np.asarray(size) / 2
    corners = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                corners.append(centre + side * sx * hx + up * sy * hy + fwd * sz * hz)
    V = np.array(corners)
    F = np.array([[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1],
                  [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]])
    return V, F


def cylinder(a, b, radius, n=16, cap=True):
    u = (b - a) / np.linalg.norm(b - a)
    v = np.cross(u, [1, 0, 0] if abs(u[0]) < 0.9 else [0, 1, 0])
    v /= np.linalg.norm(v)
    w = np.cross(u, v)
    ph = np.linspace(0, 2 * np.pi, n, endpoint=False)
    ring = np.outer(np.cos(ph), v) + np.outer(np.sin(ph), w)
    r = np.atleast_1d(radius)
    V = np.concatenate([a + ring * r[0], b + ring * r[-1]])
    F = grid_faces(2, n, True).tolist()
    if cap:
        V = np.vstack([V, a, b])
        ca, cb = len(V) - 2, len(V) - 1
        for j in range(n):
            F.append([ca, (j + 1) % n, j])
            F.append([cb, n + j, n + (j + 1) % n])
    return V, np.array(F, int)


def torus(centre, normal, R, r, n=32, m=10, scale=(1, 1)):
    normal = normal / np.linalg.norm(normal)
    v = np.cross(normal, [0, 1, 0] if abs(normal[1]) < 0.9 else [1, 0, 0])
    v /= np.linalg.norm(v)
    w = np.cross(normal, v)
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    b = np.linspace(0, 2 * np.pi, m, endpoint=False)
    V = []
    for ai in a:
        cdir = v * np.cos(ai) * scale[0] + w * np.sin(ai) * scale[1]
        cpos = centre + cdir * R
        rad = cdir / np.linalg.norm(cdir)
        for bi in b:
            V.append(cpos + (rad * np.cos(bi) + normal * np.sin(bi)) * r)
    V = np.array(V)
    F = []
    for i in range(n):
        for j in range(m):
            a0, a1 = i * m + j, ((i + 1) % n) * m + j
            b0, b1 = i * m + (j + 1) % m, ((i + 1) % n) * m + (j + 1) % m
            F += [[a0, a1, b1], [a0, b1, b0]]
    return V, np.array(F, int)


# ---------------------------------------------------------------- designs


def param_panel(body, ns, nq, fn, closed=False, x_limit=None):
    """Torso panel from a parameterisation fn(s, q) -> (theta, y, offset); s along rows, q across."""
    P = []
    for s in np.linspace(0, 1, ns):
        for q in (np.linspace(0, 1, nq, endpoint=not closed)):
            th, y, off = fn(s, q)
            y = round(float(y), 3)
            r = body.torso_radius(y, np.array([th]), x_limit=x_limit)[0]
            c = body.torso_centre(y)
            P.append([c[0] + (r + off) * np.sin(th), y, c[2] + (r + off) * np.cos(th)])
    return np.array(P), grid_faces(ns, nq, closed)


def blob(centre, radii, n=14, m=10, seed=0, rough=0.12):
    rng = np.random.default_rng(seed)
    noise = 1 + rough * (rng.random((m, n)) - 0.5)
    V = []
    for i, a in enumerate(np.linspace(0.15, np.pi - 0.15, m)):
        for j, b in enumerate(np.linspace(0, 2 * np.pi, n, endpoint=False)):
            d = np.array([np.sin(a) * np.cos(b), np.cos(a), np.sin(a) * np.sin(b)])
            V.append(centre + d * radii * noise[i, j])
    V = np.array(V + [centre + [0, radii[1], 0], centre - [0, radii[1], 0]])
    F = grid_faces(m, n, True).tolist()
    top, bot = len(V) - 2, len(V) - 1
    for j in range(n):
        F.append([top, (j + 1) % n, j])
        F.append([bot, (m - 1) * n + j, (m - 1) * n + (j + 1) % n])
    return V, np.array(F, int)


def shoulder_cap(body, side, alpha_max, offset, n_a=8, n_b=30, lift=0.02):
    sg = 1 if side == "l" else -1
    piv = body.L["upperarm_" + side] + np.array([0, lift, 0])
    pole = np.array([0.75 * sg, 0.66, -0.05])
    pole /= np.linalg.norm(pole)
    e1 = np.cross(pole, [0, 0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(pole, e1)
    dirs = []
    for a in np.linspace(0, alpha_max, n_a):
        for b in np.linspace(0, 2 * np.pi, n_b, endpoint=False):
            dirs.append(pole * np.cos(a) + (e1 * np.cos(b) + e2 * np.sin(b)) * np.sin(a))
    dirs = np.array(dirs)
    r = envelope_radius(body, piv, dirs, offset, max_r=0.18, cone=0.16)
    # smooth radii around each ring
    r = r.reshape(n_a, n_b)
    r = (np.roll(r, 1, 1) + 2 * r + np.roll(r, -1, 1)) / 4
    r[0] = r[0].mean()
    V = piv + dirs * r.reshape(-1, 1)
    return V, grid_faces(n_a, n_b, True)


def pauldron(body, side, t0, t1, half_angle, offset, n_t=9, n_phi=22):
    """Lateral half-shell over the shoulder, lofted along the upper-arm axis
    from above the pivot (t<0) down the arm, flaring slightly at the hem."""
    sg = 1 if side == "l" else -1
    a, b = body.L["upperarm_" + side], body.L["lowerarm_" + side]
    phis = np.linspace(-half_angle, half_angle, n_phi)
    return limb_panel(body, None, a, b, np.linspace(t0, t1, n_t), phis,
                      lambda ph, t: offset + 0.012 * max(0.0, (t - t0) / (t1 - t0)) ** 2, closed=False,
                      lateral=np.array([sg * 0.85, 0.5, 0.0]), max_r=0.13)


def design_security(body):
    L = body.L
    deg = np.radians
    pieces = []

    def cuirass(front=True):
        c = 0.0 if front else np.pi

        def fn(s, q):
            # q across: -1..1 maps to the panel width; s from hem (0) to neckline (1)
            u = 2 * q - 1
            y_bot = 1.215 + 0.045 * u * u if front else 1.225
            y_top_mid = 1.43 if front else 1.46
            y_top = y_top_mid + (0.045 * u * u if front else 0.02 * u * u)
            y = y_bot + s * (y_top - y_bot)
            width = deg(98) - deg(42) * _ss(1.27, 1.36, y)
            th = c + u * width
            keel = 0.009 * np.exp(-(u * width / 0.22) ** 2) * (1 if front else 0.5)
            pec = (0.006 * np.exp(-((abs(u * width) - 0.55) / 0.3) ** 2) * _ss(1.3, 1.38, y) * (1 - _ss(1.40, 1.44, y))) if front else 0
            return th, y, 0.014 + keel + pec
        return param_panel(body, 14, 34, fn, x_limit=0.19)
    for name, front in (("cuirass_front", True), ("cuirass_back", False)):
        V, F = cuirass(front)
        pieces.append({"name": name, "set": "security", "core": True, "mat": "bronze_plate", "skin": "rigid:spine_03",
                       "V": V, "F": F, "thickness": 0.006, "bevel": 0.002})
    # chest insignia: ring motif on the left chest
    th, y = deg(28), 1.385
    r = body.torso_radius(y, np.array([th]))[0] + 0.024
    c = body.torso_centre(y)
    p = np.array([c[0] + r * np.sin(th), y, c[2] + r * np.cos(th)])
    V, F = torus(p, np.array([np.sin(th), 0, np.cos(th)]), 0.017, 0.0035, n=24, m=8, scale=(0.75, 1.0))
    pieces.append({"name": "insignia", "set": "security", "core": True, "mat": "ochre_trim", "skin": "rigid:spine_03", "V": V, "F": F})
    for s in ("l", "r"):
        for k, (t0, t1, half, off) in enumerate(((-0.42, 0.42, 1.75, 0.016), (-0.42, 0.12, 1.45, 0.03))):
            V, F = pauldron(body, s, t0, t1, half, off)
            pieces.append({"name": f"pauldron_{s}{k}", "set": "security", "core": True, "mat": "graphite_plate" if k == 0 else "bronze_plate",
                           "skin": "rigid:upperarm_" + s, "V": V, "F": F, "thickness": 0.005, "bevel": 0.002})
        a, b = L["lowerarm_" + s], L["hand_" + s]
        V, F = limb_panel(body, "arm_" + s, a, b, np.linspace(0.18, 0.86, 9), np.linspace(-np.pi, np.pi, 28, endpoint=False), 0.009)
        pieces.append({"name": "vambrace_" + s, "set": "security", "core": True, "mat": "graphite_plate", "skin": "rigid:lowerarm_" + s,
                       "V": V, "F": F, "thickness": 0.004, "bevel": 0.0015})
    V, F = param_panel(body, 4, 64, lambda s, q: (2 * np.pi * q - np.pi, 1.045 + 0.045 * s, 0.013), closed=True)
    pieces.append({"name": "duty_belt", "set": "security", "core": True, "mat": "leather", "skin": "rigid:pelvis", "V": V, "F": F, "thickness": 0.006})
    for name, t0, t1, side in (("tasset_l", 24, 58, "l"), ("tasset_r", -58, -24, "r")):
        V, F = param_panel(body, 7, 10, lambda s, q, t0=t0, t1=t1: (deg(t0 + (t1 - t0) * q), 1.04 - 0.145 * s, 0.024 + 0.022 * s * s))
        pieces.append({"name": name, "set": "security", "core": True, "mat": "bronze_plate", "skin": "rigid:pelvis", "V": V, "F": F,
                       "thickness": 0.005, "bevel": 0.002})

    def on_belt(th_deg, y, out=0.03):
        th = deg(th_deg)
        r = body.torso_radius(y, np.array([th]))[0] + out
        c = body.torso_centre(y)
        return np.array([c[0] + r * np.sin(th), y, c[2] + r * np.cos(th)]), np.array([np.sin(th), 0, np.cos(th)])
    p, n = on_belt(0, 1.067, 0.022)
    V, F = box(p, (0.062, 0.046, 0.012), np.array([0, 1.0, 0]), n)
    pieces.append({"name": "buckle", "set": "security", "core": True, "mat": "brass", "skin": "rigid:pelvis", "V": V, "F": F, "bevel": 0.003})
    eq = []
    for i, th in enumerate((-32, -58)):
        p, n = on_belt(th, 1.04, 0.035)
        eq.append(box(p, (0.052, 0.066, 0.03), np.array([0, 1.0, 0]), n))
    pieces.append({"name": "equip_pouches", "set": "security", "core": False, "mat": "leather", "skin": "rigid:pelvis",
                   "V": eq, "F": None, "bevel": 0.006})
    p, n = on_belt(-145, 1.03, 0.04)
    rv, rf = box(p, (0.07, 0.095, 0.038), np.array([0, 1.0, 0]), n)
    av, af = cylinder(p + [0, 0.045, 0], p + [0, 0.17, 0], 0.004, n=8)
    pieces.append({"name": "equip_radio", "set": "security", "core": False, "mat": "graphite_plate", "skin": "rigid:pelvis",
                   "V": [(rv, rf), (av, af)], "F": None, "bevel": 0.004})
    p, n = on_belt(100, 1.05, 0.045)
    bv, bf = cylinder(p + [0, 0.02, 0], p + [0.0, -0.27, 0.03], [0.019, 0.016], n=14)
    pieces.append({"name": "equip_baton", "set": "security", "core": False, "mat": "graphite_plate", "skin": "rigid:pelvis",
                   "V": [(bv, bf)], "F": None, "bevel": 0.003})
    # warden stave, gripped by the right hand and grounded beside the right foot
    hand = L["hand_r"] + 0.5 * (L["hand_tip_r"] - L["hand_r"])
    base = np.array([hand[0] - 0.02, 0.0, hand[2] + 0.03])
    top = np.array([hand[0] - 0.02, 1.98, hand[2] + 0.03])
    parts = [cylinder(base, top, 0.014, n=12)]
    for yb in (0.06, hand[1] + 0.09, hand[1] - 0.09, 1.78):
        parts.append(cylinder(base + [0, yb - 0.02, 0], base + [0, yb + 0.02, 0], 0.019, n=12))
    parts.append(torus(top + [0, 0.07, 0], np.array([0, 0, 1.0]), 0.065, 0.011, n=28, m=8, scale=(0.72, 1.0)))
    pieces.append({"name": "stave", "set": "security", "core": False, "mat": "stave", "skin": "rigid:hand_r", "V": parts, "F": None})
    return pieces


def design_vendor(body):
    L = body.L
    deg = np.radians
    pieces = []
    # waist wrap: folded band around the waist
    V, F = param_panel(body, 6, 72, lambda s, q: (2 * np.pi * q - np.pi, 1.035 + 0.085 * s + 0.008 * np.sin(6 * np.pi * q),
                                                   0.016 + 0.006 * np.sin(14 * np.pi * q + 3 * s) * np.sin(np.pi * s)), closed=True)
    pieces.append({"name": "sash_wrap", "set": "vendor", "core": True, "mat": "navy_cloth", "skin": "transfer", "V": V, "F": F, "thickness": 0.004, "subdivide": True})
    # shoulder sash: back right hip -> over the left shoulder -> down the front to the wrap
    c = lambda y: body.torso_centre(y)
    path = [c(1.10) + [-0.10, 0, -0.16], c(1.28) + [-0.02, 0, -0.16], c(1.44) + [0.08, 0, -0.10], c(1.50) + [0.115, 0.0, -0.02],
            c(1.45) + [0.10, 0, 0.11], c(1.33) + [0.065, 0, 0.15], c(1.20) + [0.06, 0, 0.12], c(1.10) + [0.11, 0, 0.14]]
    V, F = ribbon(body, path, lambda t: 0.105 - 0.03 * np.exp(-((t - 0.45) / 0.12) ** 2), 0.017, n=48)
    pieces.append({"name": "sash_shoulder", "set": "vendor", "core": True, "mat": "navy_cloth", "skin": "transfer", "V": V, "F": F, "thickness": 0.004, "subdivide": True})
    th = deg(68)
    r = body.torso_radius(1.075, np.array([th]))[0] + 0.035
    k = c(1.075) + [r * np.sin(th), 0, r * np.cos(th)]
    V, F = blob(k, np.array([0.042, 0.038, 0.034]), seed=4)
    pieces.append({"name": "sash_knot", "set": "vendor", "core": True, "mat": "navy_cloth", "skin": "rigid:pelvis", "V": V, "F": F})
    for i, (length, width, sway, ph) in enumerate(((0.44, 0.085, [0.03, 0, 0.02], 0.0), (0.35, 0.07, [0.045, 0, -0.025], 1.3))):
        V, F = hanging_ribbon(k + [0.012 * i, -0.025, 0.01 - 0.02 * i], length, width, np.array(sway), phase=ph)
        pieces.append({"name": f"sash_tail{i}", "set": "vendor", "core": True, "mat": "navy_cloth", "skin": "transfer", "V": V, "F": F, "thickness": 0.003, "subdivide": True})
    # olive shoulder plate on the right shoulder, two lames
    for kk, (t0, t1, half, off) in enumerate(((-0.45, 0.38, 1.8, 0.02), (-0.45, 0.05, 1.5, 0.034))):
        V, F = pauldron(body, "r", t0, t1, half, off)
        pieces.append({"name": f"shoulder_plate{kk}", "set": "vendor", "core": True, "mat": "olive_plate", "skin": "rigid:upperarm_r",
                       "V": V, "F": F, "thickness": 0.005, "bevel": 0.002})
    # brass buckle holding the sash at the left shoulder front
    i = 4
    S, N = ribbon(body, path, 0.1, 0.02, n=48)[0].reshape(48, 3, 3)[int(0.62 * 47), 1], None
    n = body.surface(S[None])[1][0]
    V, F = box(S + n * 0.006, (0.036, 0.03, 0.008), np.array([0, 1.0, 0]), n)
    pieces.append({"name": "sash_buckle", "set": "vendor", "core": True, "mat": "brass", "skin": "rigid:spine_03", "V": V, "F": F, "bevel": 0.002})
    return pieces


def export_pieces(pieces, npz_path, json_path):
    """Flatten piece geometry (multi-part pieces merged) for the Blender job."""
    import json

    arrays, meta = {}, []
    for pc in pieces:
        parts = pc["V"] if pc["F"] is None else [(pc["V"], pc["F"])]
        Vs, Fs, off = [], [], 0
        for v, f in parts:
            Vs.append(np.asarray(v, float))
            Fs.append(np.asarray(f, int) + off)
            off += len(v)
        arrays[pc["name"] + "_V"] = np.concatenate(Vs)
        arrays[pc["name"] + "_F"] = np.concatenate(Fs)
        meta.append({k: v for k, v in pc.items() if k not in ("V", "F")})
    np.savez(npz_path, **arrays)
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=1)
    return meta
