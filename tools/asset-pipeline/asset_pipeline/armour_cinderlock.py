"""Cinderlock Regalia: the Kinetic Vanguard armour set, authored as
hard-surface armour (owner visual aim, 2026-11-19; fidelity bar: the
Severance Gate).

The design stage only decides *where* things go, on smooth surfaces fitted to
the project bodies in bind pose:

* parameter maps over the torso (theta, u), along limb bones (t, phi), around
  the neck and over the shoulders, built from convex cross-sections of the
  body, its worn-under shells and (for hands and neck) the hands/head meshes;
* every plate is an angular polygon in a map's parameter space, sampled as a
  dense curved sheet with its own layer height, dome and keel;
* grooves (polylines, cut into the plate and filled with an emissive inlay
  whose UV encodes flow distance from the set's energy source), through-cut
  holes (vents, the reactor window), bolts and slats are given in the same
  parameter space and emitted in 3D.

The Blender builder (blender/armour_hardsurface.py) turns each sheet into a
solid with chamfered edges, carves the grooves and holes with booleans, lays
the inlays, and bakes gate-style material fields.
"""
from __future__ import annotations

import numpy as np

from . import armour_design as ad
from .armour_design import convex_envelope

deg = np.radians
SIDES = (("l", 1.0), ("r", -1.0))


# ---------------------------------------------------------------- maps


def facet_radius(rfun, phi, K, phase=0.0):
    """Radius of the K-sided polygon inscribed through rfun's samples at
    phi_k = phase + 2 pi k / K, along the ray at phi: flat planes between
    vertices, i.e. a faceted hard-surface section instead of a round one."""
    step = 2 * np.pi / K
    k = np.floor((phi - phase) / step)
    p0 = phase + k * step
    p1 = p0 + step
    r0, r1 = rfun(p0), rfun(p1)
    return r0 * r1 * np.sin(step) / np.maximum(r0 * np.sin(phi - p0) + r1 * np.sin(p1 - phi), 1e-9)


class TorsoMap:
    """(theta, u) -> surface point on the torso's convex envelope + offset."""

    def __init__(self, body, facets=0):
        self.b = body
        self.K = facets

    def point(self, a, u, off):
        if not self.K:
            p, _ = self.b.on_torso(float(a), float(u), float(off))
            return p
        b = self.b
        y = round(float(b.y(u)), 3)
        r = facet_radius(lambda ph: b.radius(y, np.array([ph]), x_limit=0.2)[0], float(a), self.K) + off
        c = b.centre(y)
        return np.array([c[0] + r * np.sin(a), y, c[2] + r * np.cos(a)])

    def normal(self, a, u, off):
        e = 2e-3
        pa = self.point(a + e, u, off) - self.point(a - e, u, off)
        pu = self.point(a, u + e, off) - self.point(a, u - e, off)
        n = np.cross(pu, pa)
        rad = np.array([np.sin(a), 0, np.cos(a)])
        n = n if n @ rad > 0 else -n
        return n / np.linalg.norm(n)


class LimbMap:
    """(t, phi) along the bone a->b: phi from `ref` toward u x ref; radius from
    convex cross-sections of `cloud` precomputed on a fine t grid."""

    def __init__(self, a, b, ref, cloud, t_range=(-0.4, 1.6), step=0.02, half=0.012, rmax=0.14, facets=0, tsmooth=0.0):
        self.K = facets
        self.a, self.b = np.asarray(a, float), np.asarray(b, float)
        self.u = (self.b - self.a) / np.linalg.norm(self.b - self.a)
        ref = np.asarray(ref, float)
        v = ref - self.u * (ref @ self.u)
        self.v = v / np.linalg.norm(v)
        self.w = np.cross(self.u, self.v)
        self.L = np.linalg.norm(self.b - self.a)
        d = np.asarray(cloud, float) - self.a
        s = d @ self.u
        radial = d - np.outer(s, self.u)
        rl = np.linalg.norm(radial, axis=1)
        self.ts = np.arange(t_range[0], t_range[1] + 1e-9, step)
        env = []
        for t in self.ts:
            m = (np.abs(s - t * self.L) < half) & (rl < rmax)
            if m.sum() < 6:
                m = (np.abs(s - t * self.L) < half * 3) & (rl < rmax)
            env.append(convex_envelope(radial[m] @ self.w, radial[m] @ self.v, bins=72, smooth=2) if m.sum() >= 6 else None)
        first = next(e for e in env if e is not None)
        for i in range(len(env)):  # extend the nearest valid section into gaps
            if env[i] is None:
                env[i] = env[i - 1] if i and env[i - 1] is not None else first
        if tsmooth and len({len(e[0]) for e in env}) == 1:
            # smooth the sections along the bone (sigma in t units): a clean
            # lofted surface instead of one that follows every toe and knuckle
            from scipy.ndimage import gaussian_filter1d

            R = gaussian_filter1d(np.array([e[1] for e in env]), tsmooth / step, axis=0, mode="nearest")
            env = [(e[0], R[i]) for i, e in enumerate(env)]
        self.env = env

    def radius(self, t, phi):
        if self.K:
            return facet_radius(lambda ph: self._radius(t, ph), phi, self.K)
        return self._radius(t, phi)

    def _radius(self, t, phi):
        x = np.clip((t - self.ts[0]) / (self.ts[1] - self.ts[0]), 0, len(self.ts) - 1.001)
        i = int(x)
        f = x - i
        r0 = np.interp(phi, *self.env[i], period=2 * np.pi)
        r1 = np.interp(phi, *self.env[min(i + 1, len(self.env) - 1)], period=2 * np.pi)
        return r0 * (1 - f) + r1 * f

    def point(self, t, phi, off):
        r = self.radius(t, phi) + off
        return self.a + self.u * t * self.L + r * (np.cos(phi) * self.v + np.sin(phi) * self.w)

    def normal(self, t, phi, off):
        e = 2e-3
        pt = self.point(t + e, phi, off) - self.point(t - e, phi, off)
        pp = self.point(t, phi + e, off) - self.point(t, phi - e, off)
        n = np.cross(pt, pp)
        rad = np.cos(phi) * self.v + np.sin(phi) * self.w
        n = n if n @ rad > 0 else -n
        return n / np.linalg.norm(n)


class LimbAdapter:
    """Plates are authored as (a, b); for limb maps a = phi (around), b = t (along)."""

    def __init__(self, lm):
        self.lm = lm

    def point(self, a, b, off):
        return self.lm.point(b, a, off)

    def normal(self, a, b, off):
        return self.lm.normal(b, a, off)


# ---------------------------------------------------------------- authoring


def _row_extent(poly, b):
    """[min a, max a] where the line at b crosses a convex polygon."""
    xs = []
    P = list(poly) + [poly[0]]
    for (a0, b0), (a1, b1) in zip(P[:-1], P[1:]):
        if b0 != b1 and (b0 - b) * (b1 - b) <= 0:
            xs.append(a0 + (a1 - a0) * (b - b0) / (b1 - b0))
    return (min(xs), max(xs)) if xs else None


class Plate:
    """One authored plate: a convex polygon in a map's parameter space."""

    def __init__(self, item, name, mat, m, poly, off, *, thickness=0.008, bevel=0.0026, segs=1, dome=0.0, keel=0.0,
                 res=0.013, weights=None, weight_mode=None, flow_origin=None, flow_scale=1.2, lip0=0.0, lip1=0.0):
        self.item, self.name, self.mat, self.m = item, name, mat, m
        self.poly = [(float(a), float(b)) for a, b in poly]
        self.off, self.thickness, self.bevel, self.segs = off, thickness, bevel, segs
        self.dome, self.keel, self.res = dome, keel, res
        self.lip0, self.lip1 = lip0, lip1  # raised rolled edge at the b-min / b-max end
        self.weights, self.weight_mode = weights, weight_mode
        self.flow_origin = None if flow_origin is None else np.asarray(flow_origin, float)
        self.flow_scale = flow_scale
        self.grooves, self.holes, self.bolts = [], [], []
        A = np.array(self.poly)
        self.amin, self.amax = A[:, 0].min(), A[:, 0].max()
        self.bmin, self.bmax = A[:, 1].min(), A[:, 1].max()

    def height(self, a, b):
        fa = (a - self.amin) / max(self.amax - self.amin, 1e-9)
        fb = (b - self.bmin) / max(self.bmax - self.bmin, 1e-9)
        fa, fb = np.clip(fa, 0, 1), np.clip(fb, 0, 1)
        # hard-surface profile: a flat plateau with chamfered margins (not a
        # pillow), a V ridge down the middle and ramped lips at the ends
        plateau = np.minimum(1, 4 * np.minimum(fa, 1 - fa)) * np.minimum(1, 4 * np.minimum(fb, 1 - fb))
        return (self.off + self.dome * plateau
                + self.keel * np.maximum(0, 1 - np.abs(fa - 0.5) / 0.22)
                + self.lip0 * np.clip(1 - fb / 0.1, 0, 1) + self.lip1 * np.clip(1 - (1 - fb) / 0.1, 0, 1))

    def surf(self, a, b, lift=0.0):
        h = self.height(a, b) + lift
        return self.m.point(a, b, h), self.m.normal(a, b, h)

    def sheet(self):
        mid_b = (self.bmin + self.bmax) / 2
        span_b = np.linalg.norm(self.m.point((self.amin + self.amax) / 2, self.bmax, self.off) - self.m.point((self.amin + self.amax) / 2, self.bmin, self.off))
        nb = max(4, int(np.ceil(span_b / self.res)) + 1)
        lo, hi = _row_extent(self.poly, mid_b)
        span_a = np.linalg.norm(self.m.point(hi, mid_b, self.off) - self.m.point(lo, mid_b, self.off))
        na = max(4, int(np.ceil(span_a / self.res)) + 1)
        V = []
        eps = 1e-6 * (self.bmax - self.bmin)
        for b in np.linspace(self.bmin + eps, self.bmax - eps, nb):
            lo, hi = _row_extent(self.poly, b)
            if hi - lo < 1e-6:
                hi = lo + 1e-6
            for a in np.linspace(lo, hi, na):
                V.append(self.m.point(a, b, self.height(a, b)))
        V = np.array(V)
        F = ad.grid_faces(nb, na, False)
        # outward winding (against the map normal at the plate centre)
        i0 = (nb // 2) * na + na // 2
        f = np.nonzero((F == i0).any(1))[0][0]
        c = F[f]
        fn = np.cross(V[c[1]] - V[c[0]], V[c[2]] - V[c[0]])
        if fn @ self.m.normal((self.amin + self.amax) / 2, mid_b, self.off) < 0:
            F = F[:, ::-1].copy()
        return V, F

    def groove(self, pts, width=0.0042, depth=0.0028, inlay=True, closed=False, n_per=6):
        self.grooves.append(dict(pts=pts, width=width, depth=depth, inlay=inlay, closed=closed, n_per=n_per))
        return self

    def hole(self, poly):
        self.holes.append(poly)
        return self

    def bolt(self, a, b, r=0.0032, h=0.0028):
        self.bolts.append((a, b, r, h))
        return self

    def flow(self, p):
        return 0.0 if self.flow_origin is None else float(min(0.999, np.linalg.norm(p - self.flow_origin) / self.flow_scale))

    def export(self):
        V, F = self.sheet()
        top = self.thickness
        gro = []
        for g in self.grooves:
            seq = list(g["pts"]) + ([g["pts"][0]] if g["closed"] else [])
            P, N = [], []
            for (a0, b0), (a1, b1) in zip(seq[:-1], seq[1:]):
                for k in range(g["n_per"]):
                    f = k / g["n_per"]
                    p, n = self.surf(a0 + (a1 - a0) * f, b0 + (b1 - b0) * f, top)
                    P.append(p)
                    N.append(n)
            p, n = self.surf(*seq[-1], top)
            P.append(p)
            N.append(n)
            gro.append(dict(pts=np.array(P).tolist(), nrm=np.array(N).tolist(), width=g["width"], depth=g["depth"], inlay=g["inlay"],
                            flow=[self.flow(np.array(q)) for q in P]))
        holes = []
        for poly in self.holes:
            P, N = [], []
            seq = list(poly) + [poly[0]]
            for (a0, b0), (a1, b1) in zip(seq[:-1], seq[1:]):
                for k in range(4):
                    f = k / 4
                    p, n = self.surf(a0 + (a1 - a0) * f, b0 + (b1 - b0) * f, top / 2)
                    P.append(p)
                    N.append(n)
            holes.append(dict(pts=np.array(P).tolist(), nrm=np.array(N).tolist()))
        bolts = []
        for a, b, r, h in self.bolts:
            p, n = self.surf(a, b, top)
            bolts.append(dict(p=p.tolist(), n=n.tolist(), r=r, h=h))
        out = {"name": f"{self.item}__{self.name}", "set": self.item, "mat": self.mat, "V": V, "F": F, "core": True,
               "hs": True, "thickness": self.thickness, "bevel": self.bevel, "bevel_segments": self.segs,
               "grooves": gro, "holes": holes, "bolts": bolts, "relax": False, "gap": 0.0, "even": False}
        if self.weights:
            out["weights"] = self.weights
        if self.weight_mode:
            out["weight_mode"] = self.weight_mode
        return out


def mirror_poly(poly, about=0.0):
    return [(2 * about - a, b) for a, b in poly][::-1]


def D(poly):
    """(degrees, b) -> (radians, b)."""
    return [(deg(a), b) for a, b in poly]


def sheet_piece(item, name, mat, V, F, thickness, weights=None, **kw):
    """A free-form sheet (glove liner, boot liner): solidified, no bevel."""
    out = {"name": f"{item}__{name}", "set": item, "mat": mat, "V": np.asarray(V), "F": np.asarray(F), "core": True, "hs": True,
           "thickness": thickness, "bevel": 0.0, "bevel_segments": 0, "grooves": [], "holes": [], "bolts": [], "relax": False,
           "gap": 0.0, "even": False}
    if weights:
        out["weights"] = weights
    out.update(kw)
    return out


def slats(item, name, mat, m, a0, a1, b0, b1, n, off, weights=None, weight_mode=None):
    """A row of small bevelled bars (vent slats) across a recess."""
    from .humanoid_wardrobe import box

    parts = []
    for k in range(n):
        b = b0 + (b1 - b0) * (k + 0.5) / n
        p0, p1 = m.point(a0, b, off), m.point(a1, b, off)
        nrm = m.normal((a0 + a1) / 2, b, off)
        L = np.linalg.norm(p1 - p0)
        parts.append(box((p0 + p1) / 2, (L, 0.0035, 0.0032), (p1 - p0) / L, nrm))
    out = {"name": f"{item}__{name}", "set": item, "mat": mat, "V": parts, "F": None, "multi": True, "core": True, "hs": True, "thickness": 0.0,
           "bevel": 0.0007, "bevel_segments": 1, "grooves": [], "holes": [], "bolts": [], "relax": False, "gap": 0.0, "even": False}
    if weights:
        out["weights"] = weights
    if weight_mode:
        out["weight_mode"] = weight_mode
    return out


def joint_weight(body, prefixes, side=None):
    cols = [i for i, n in enumerate(body.joints) if n.startswith(tuple(prefixes)) and (side is None or n.endswith("_" + side))]
    return body.Wd[:, cols].sum(1)


# ---------------------------------------------------------------- cuirass


def design_cuirass(body, base, m):
    it = "vanguard_field_set_chest"
    T = TorsoMap(body, facets=26)
    core = T.point(0.0, 0.7, base + 0.03)
    P = [ad.vest_body(body, it, m["under"], base - 0.002, hem_u=0.03, neck_front=0.92, neck_back=0.95, arm_u=0.76, top_u=0.98)]
    pls = []

    def plate(name, poly, layer, mat="plate", **kw):
        kw.setdefault("flow_origin", core)
        pl = Plate(it, name, m[mat], T, D(poly), base + layer, **kw)
        pls.append(pl)
        return pl

    for s, sg in SIDES:
        f = lambda a: sg * a
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        pl = plate(f"pec_{s}", side([(6, 0.62), (40, 0.6), (58, 0.68), (61, 0.82), (46, 0.94), (15, 0.96), (6, 0.89)]), 0.006, dome=0.003, thickness=0.009)
        pl.groove(D([(f(10), 0.9), (f(34), 0.75), (f(55), 0.73)]))
        pl.groove(D([(f(9), 0.645), (f(38), 0.63), (f(52), 0.68)]))
        for a, b in ((f(12), 0.925), (f(54), 0.79), (f(42), 0.615)):
            pl.bolt(deg(a), b)
        for r, (u0, u1) in enumerate(((0.45, 0.555), (0.325, 0.43), (0.2, 0.305))):
            pl = plate(f"ab_{s}{r}", side([(3.5, u0), (33, u0), (41, u0 + 0.035), (41, u1), (3.5, u1)]), 0.004 + 0.0015 * r, dome=0.004, thickness=0.008)
            mid = (u0 + u1) / 2
            pl.groove(D([(f(25), mid), (f(37), mid)]))
            pl.bolt(deg(f(7.5)), mid)
        vent = [(69, 0.41), (87, 0.41), (91, 0.5), (87, 0.59), (69, 0.59), (65, 0.5)]
        pl = plate(f"flank_{s}", side([(60, 0.3), (92, 0.3), (99, 0.4), (97, 0.62), (66, 0.66), (58, 0.5)]), 0.005, dome=0.004, thickness=0.008)
        pl.hole(D(side([(71, 0.425), (85, 0.425), (89, 0.5), (85, 0.575), (71, 0.575), (67, 0.5)])))
        pl.groove(D([(f(a), b) for a, b in [(69.2, 0.405), (86.8, 0.405), (91.5, 0.5), (86.8, 0.595), (69.2, 0.595), (64.5, 0.5)]]), closed=True, width=0.0034)
        pl.bolt(deg(f(63)), 0.34).bolt(deg(f(94)), 0.6)
        P.append(Plate(it, f"flank_vent_{s}", m["vent"], T, D(side(vent)), base + 0.0015, thickness=0.003, bevel=0.0008).export())
        P.append(slats(it, f"flank_slats_{s}", m["trim"], T, deg(f(70)), deg(f(86)), 0.44, 0.56, 5, base + 0.008))
        # back: scapular plates (the pec layout mirrored to the back), rows
        scap = [(180 - a, b) for a, b in [(6, 0.6), (40, 0.58), (57, 0.67), (60, 0.82), (46, 0.94), (12, 0.96), (6, 0.9)]][::-1]
        pl = plate(f"scapula_{s}", scap if sg > 0 else mirror_poly(scap, 180), 0.006, dome=0.003, thickness=0.009)
        pl.groove(D([(180 - f(12), 0.9), (180 - f(36), 0.74), (180 - f(54), 0.72)]))
        for r, (u0, u1) in enumerate(((0.43, 0.545), (0.3, 0.415), (0.17, 0.285))):
            row = [(180 - a, b) for a, b in [(4, u0), (36, u0), (42, u0 + 0.035), (42, u1), (4, u1)]][::-1]
            plate(f"back_{s}{r}", row if sg > 0 else mirror_poly(row, 180), 0.004 + 0.0015 * r, dome=0.003, thickness=0.008)
        pl = plate(f"fauld_{s}", side([(19, 0.07), (44, 0.09), (47, 0.19), (21, 0.185)]), 0.007, dome=0.003, thickness=0.007)
        pl.groove(D([(f(24), 0.13), (f(42), 0.14)]))
    # sternum frame around the reactor window
    pl = plate("sternum", [(-16, 0.555), (16, 0.555), (20.5, 0.7), (16, 0.845), (-16, 0.845), (-20.5, 0.7)], 0.014, dome=0.004, thickness=0.01, bevel=0.003)
    pl.hole(D([(-9.5, 0.615), (9.5, 0.615), (12.5, 0.7), (9.5, 0.785), (-9.5, 0.785), (-12.5, 0.7)]))
    pl.groove(D([(-13, 0.585), (13, 0.585), (16.8, 0.7), (13, 0.815), (-13, 0.815), (-16.8, 0.7)]), closed=True, width=0.0038)
    for a, b in ((-15, 0.572), (15, 0.572), (-15, 0.828), (15, 0.828)):
        pl.bolt(deg(a), b, r=0.0028)
    P.append(Plate(it, "reactor_back", m["vent"], T, D([(-13, 0.6), (13, 0.6), (16, 0.7), (13, 0.8), (-13, 0.8), (-16, 0.7)]), base + 0.006,
                   thickness=0.004, bevel=0.0008).export())
    P.append(slats(it, "reactor_slats", m["trim"], T, deg(-11), deg(11), 0.63, 0.775, 6, base + 0.013))
    pl = plate("fauld_c", [(-16, 0.06), (16, 0.06), (18, 0.185), (-18, 0.185)], 0.008, dome=0.003, thickness=0.008)
    pl.groove(D([(-10, 0.165), (0, 0.1), (10, 0.165)]))
    pl = plate("spine", [(174, 0.3), (186, 0.3), (187, 0.92), (173, 0.92)], 0.012, keel=0.004, thickness=0.009)
    pl.groove(D([(180, 0.34), (180, 0.88)]))
    # collar: two segmented rings around the neck, open at the throat
    nk = body.L["neck_01"]
    cloud = np.concatenate([body.meshes["body"]["V"], body.meshes["head"]["V"]])
    cloud = cloud[(np.abs(cloud[:, 0]) < 0.1) & (cloud[:, 1] > nk[1] - 0.12) & (cloud[:, 1] < nk[1] + 0.12)]
    NM = LimbAdapter(LimbMap(np.array([0, nk[1] - 0.055, nk[2]]), np.array([0, nk[1] + 0.065, nk[2]]), [0, 0, 1.0], cloud,
                             t_range=(-0.2, 1.3), half=0.01, rmax=0.12, facets=14))
    # raised containment collar (original concept): three stepped rings
    for k, (t0, t1, op, lay) in enumerate(((0.0, 0.42, 16, 0.04), (0.45, 0.84, 20, 0.026), (0.87, 1.18, 27, 0.017))):
        pc = Plate(it, f"collar_{k}", m["plate"], NM, D([(op, t0), (360 - op, t0), (360 - op, t1), (op, t1)]), lay, dome=0.003, thickness=0.008,
                   bevel=0.0025, weight_mode=["band", "y", 0.03], flow_origin=core)
        pc.groove(D([(op + 7, t0 + 0.1), (op + 7, t1 - 0.1)]))
        pc.groove(D([(353 - op, t0 + 0.1), (353 - op, t1 - 0.1)]))
        pls.append(pc)
    # pauldrons: domed caps wrapping the shoulder ball and deltoid (mapped
    # along the upper-arm bone, phi 0 = up), with a lame below
    for s, sg in SIDES:
        ua, la = body.L["upperarm_" + s], body.L["lowerarm_" + s]
        sel = ~body.head & (np.abs(body.P[:, 0]) > 0.1) & (np.sign(body.P[:, 0]) == sg)
        YM = LimbAdapter(LimbMap(ua, la, [0, 1.0, 0], body.P[sel], t_range=(-0.5, 0.8), half=0.012, rmax=0.13, facets=12))
        pc = Plate(it, f"pauldron_{s}", m["plate"], YM, D([(-115, -0.32), (115, -0.32), (124, 0.1), (108, 0.4), (-108, 0.4), (-124, 0.1)]),
                   base + 0.026, dome=0.008, thickness=0.01, bevel=0.003, weight_mode=["band", "x", 0.03], flow_origin=core)
        pc.groove(D([(-95, -0.22), (-104, 0.12), (-88, 0.33), (88, 0.33), (104, 0.12), (95, -0.22)]))
        pc.bolt(deg(-70), -0.2).bolt(deg(70), -0.2).bolt(0.0, 0.02, r=0.0042, h=0.0035)
        pls.append(pc)
        pc = Plate(it, f"pauldron_lame_{s}", m["plate"], YM, D([(-100, 0.36), (100, 0.36), (92, 0.6), (-92, 0.6)]), base + 0.03, dome=0.006,
                   thickness=0.008, bevel=0.0025, weight_mode=["band", "x", 0.03], flow_origin=core)
        pc.groove(D([(-70, 0.5), (70, 0.5)]))
        pls.append(pc)
    return P + [pl.export() for pl in pls]


# ---------------------------------------------------------------- gauntlets


def hand_dorsal_dir(body, side):
    L = body.L
    base, mid = L[f"middle_01_{side}"], L[f"middle_02_{side}"]
    tip = L.get(f"middle_04_leaf_{side}", L[f"middle_03_{side}"])
    ax = (tip - base) / np.linalg.norm(tip - base)
    curl = (mid - base) - ax * ((mid - base) @ ax)
    up = np.array([0, 1.0, 0])
    d = up - ax * (up @ ax)
    d /= np.linalg.norm(d)
    if np.linalg.norm(curl) > 0.004:
        d = -curl / np.linalg.norm(curl)
    return d


def design_gauntlets(body, base, m):
    it = "vanguard_field_set_gloves"
    P = []
    hm = body.meshes["hands"]
    jn = body.joints
    for s, sg in SIDES:
        side_v = np.sign(hm["V"][:, 0]) == sg
        Dn = hand_dorsal_dir(body, s)
        hand_axis = body.L[f"middle_01_{s}"] - body.L["hand_" + s]
        pol = lambda joints: {"joints": joints, "side": s, "surfaces": ["hands", "body", "shell_forearms"]}
        origin = body.L["lowerarm_" + s]
        # glove liner: the hand surface lifted 2.6 mm and relaxed
        Fh = hm["F"][side_v[hm["F"]].all(1)]
        used = np.unique(Fh)
        rm = -np.ones(len(hm["V"]), int)
        rm[used] = np.arange(len(used))
        F = rm[Fh]
        P.append(sheet_piece(it, f"glove_{s}", m["under"], ad.relax(hm["V"][used] + hm["N"][used] * 0.0026, F, 2, 0.3), F, 0.0018,
                             weights=pol(["lowerarm", "hand", "index", "middle", "ring", "pinky", "thumb"])))

        def cloud_for(names):
            c = [i for i, n in enumerate(jn) if n in names]
            w = (np.isin(hm["J"], c) * hm["W"]).sum(1)
            return hm["V"][side_v & (w > 0.5)]
        on_skin = np.isin(body.src, [body.surfaces.index(x) for x in ("body", "hands") if x in body.surfaces])
        fa = body.P[(joint_weight(body, ["lowerarm"], s) > 0.5) & on_skin]
        VM = LimbAdapter(LimbMap(body.L["lowerarm_" + s], body.L["hand_" + s], Dn, fa, t_range=(-0.1, 1.15), half=0.014, rmax=0.075, facets=14, tsmooth=0.04))
        ax = (body.L["hand_" + s] - body.L["lowerarm_" + s])
        ax = list(map(float, ax / np.linalg.norm(ax)))
        for k, (t0, t1) in enumerate(((0.16, 0.54), (0.58, 0.98))):
            pl = Plate(it, f"vambrace_{k}_{s}", m["plate"], VM, D([(-179, t0), (179, t0), (179, t1), (-179, t1)]), 0.0055 + 0.0015 * k, thickness=0.006, lip0=0.0035,
                       bevel=0.0024, weights=pol(["lowerarm", "hand"]), weight_mode=["band", ax, 0.05], flow_origin=origin, flow_scale=0.6)
            pl.groove(D([(-150, t0 + 0.05), (150, t0 + 0.05)]), width=0.0035)
            P.append(pl.export())
        pl = Plate(it, f"vambrace_plate_{s}", m["plate"], VM, D([(-50, 0.22), (50, 0.22), (58, 0.6), (44, 0.95), (-44, 0.95), (-58, 0.6)]), 0.0135,
                   dome=0.004, keel=0.003, thickness=0.008, bevel=0.0028, weights=pol(["lowerarm", "hand"]), weight_mode=["band", ax, 0.05],
                   flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-28, 0.28), (-34, 0.62), (-26, 0.9)])).groove(D([(28, 0.28), (34, 0.62), (26, 0.9)]))
        pl.hole(D([(-12, 0.4), (12, 0.4), (14, 0.5), (12, 0.6), (-12, 0.6), (-14, 0.5)]))
        for a, b in ((-44, 0.3), (44, 0.3), (-38, 0.88), (38, 0.88)):
            pl.bolt(deg(a), b, r=0.0026)
        P.append(pl.export())
        P.append(Plate(it, f"vambrace_core_{s}", m["vent"], VM, D([(-14, 0.38), (14, 0.38), (16, 0.5), (14, 0.62), (-14, 0.62), (-16, 0.5)]), 0.0095,
                       thickness=0.005, bevel=0.0008, weights=pol(["lowerarm"]), weight_mode=["rigid"]).export())
        HM = LimbAdapter(LimbMap(body.L["hand_" + s], body.L[f"middle_01_{s}"], Dn, cloud_for([f"hand_{s}"]), t_range=(-0.2, 1.25), half=0.01, rmax=0.08, facets=8))
        pl = Plate(it, f"hand_plate_{s}", m["plate"], HM, D([(-62, 0.12), (62, 0.12), (70, 0.6), (58, 0.92), (-58, 0.92), (-70, 0.6)]), 0.006, dome=0.004,
                   thickness=0.006, bevel=0.002, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(0, 0.2), (0, 0.84)]), width=0.0034).groove(D([(-36, 0.3), (-40, 0.78)]), width=0.003).groove(D([(36, 0.3), (40, 0.78)]), width=0.003)
        P.append(pl.export())
        for fng in ("index", "middle", "ring", "pinky"):
            for seg, nxt in (("01", "02"), ("02", "03"), ("03", "04_leaf")):
                a, b = body.L.get(f"{fng}_{seg}_{s}"), body.L.get(f"{fng}_{nxt}_{s}")
                cl = cloud_for([f"{fng}_{seg}_{s}"])
                if a is None or b is None or len(cl) < 20:
                    continue
                FM = LimbAdapter(LimbMap(a, b, Dn, cl, t_range=(-0.3, 1.3), step=0.05, half=0.006, rmax=0.03, facets=6))
                t1 = 0.8 if seg != "03" else 0.7
                pl = Plate(it, f"finger_{fng}{seg}_{s}", m["plate"], FM, D([(-70, 0.05), (70, 0.05), (70, t1), (-70, t1)]),
                           0.0032 if seg != "01" else 0.0045, dome=0.0015, thickness=0.0028, bevel=0.0009, res=0.005,
                           weights=pol([f"{fng}_{seg}"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
                if seg == "01":
                    pl.groove(D([(-30, 0.45), (30, 0.45)]), width=0.0022, depth=0.0016)
                P.append(pl.export())
        for seg, nxt in (("02", "03"), ("03", "04_leaf")):
            a, b = body.L.get(f"thumb_{seg}_{s}"), body.L.get(f"thumb_{nxt}_{s}")
            cl = cloud_for([f"thumb_{seg}_{s}"])
            if a is None or b is None or len(cl) < 20:
                continue
            ref = np.cross(b - a, hand_axis)
            ref = ref * np.sign(ref @ Dn) if np.linalg.norm(ref) > 1e-6 else Dn
            FM = LimbAdapter(LimbMap(a, b, ref, cl, t_range=(-0.3, 1.3), step=0.05, half=0.006, rmax=0.03, facets=6))
            P.append(Plate(it, f"thumb_{seg}_{s}", m["plate"], FM, D([(-75, 0.05), (75, 0.05), (75, 0.8), (-75, 0.8)]), 0.0035, dome=0.0015,
                           thickness=0.0028, bevel=0.0009, res=0.005, weights=pol([f"thumb_{seg}"]), weight_mode=["rigid"]).export())
    return P


# ---------------------------------------------------------------- greaves


def design_greaves(body, base, m):
    it = "vanguard_field_set_greaves"
    P = []
    fwd = [0, 0, 1.0]
    for s, sg in SIDES:
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        surf = ["body", "shell_thighs", "shell_shins", "shell_shorts"]
        ins = np.isin(body.src, [body.surfaces.index(x) for x in surf if x in body.surfaces])
        mt = body.P[(joint_weight(body, ["thigh"], s) > 0.45) & ins]
        mc = body.P[(joint_weight(body, ["calf"], s) > 0.45) & ins]
        TM = LimbAdapter(LimbMap(th, ca, fwd, mt, t_range=(-0.1, 1.15), facets=12, tsmooth=0.04))
        CM = LimbAdapter(LimbMap(ca, ft, fwd, mc, t_range=(-0.25, 1.1), facets=12, tsmooth=0.04))
        tax = list(map(float, (ca - th) / np.linalg.norm(ca - th)))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        pt = {"joints": ["thigh", "calf"], "side": s, "surfaces": surf}
        pc = {"joints": ["calf", "thigh", "foot"], "side": s, "surfaces": surf}
        o = -sg  # outer side: +phi points to -x on a downward bone with a forward ref
        sidep = lambda poly: poly if o > 0 else mirror_poly(poly)
        for nm, M, t0, t1, pol, ax in (("legging_thigh", TM, 0.06, 1.0, pt, tax), ("legging_calf", CM, -0.02, 0.95, pc, cax)):
            P.append(Plate(it, f"{nm}_{s}", m["under"], M, D([(-179.5, t0), (179.5, t0), (179.5, t1), (-179.5, t1)]), 0.004, thickness=0.003,
                           bevel=0.0, segs=0, res=0.012, weights=pol).export())
        for k, (t0, t1) in enumerate(((0.12, 0.5), (0.53, 0.86))):
            w = 1.0 - 0.12 * k  # the lower plate narrows toward the knee
            pl = Plate(it, f"thigh_{k}_{s}", m["plate"], TM, D([(-66 * w, t0), (66 * w, t0), (74 * w, (t0 + t1) / 2), (58 * w, t1 - 0.04), (0, t1 + 0.02),
                                                               (-58 * w, t1 - 0.04), (-74 * w, (t0 + t1) / 2)]),
                       0.014 + 0.002 * k, dome=0.0025, keel=0.009, lip1=0.004, thickness=0.009, bevel=0.003, weights=pt, weight_mode=["band", tax, 0.06],
                       flow_origin=th, flow_scale=1.0)
            pl.groove(D([(-30 * w, t0 + 0.05), (-36 * w, t1 - 0.08), (-14, t1 - 0.03)])).groove(D([(30 * w, t0 + 0.05), (36 * w, t1 - 0.08), (14, t1 - 0.03)]))
            pl.bolt(deg(-56 * w), t0 + 0.04).bolt(deg(56 * w), t0 + 0.04)
            P.append(pl.export())
        pl = Plate(it, f"thigh_side_{s}", m["plate"], TM, D(sidep([(92, 0.2), (150, 0.24), (150, 0.8), (92, 0.84)])), 0.012, dome=0.004, thickness=0.008,
                   bevel=0.0026, weights=pt, weight_mode=["band", tax, 0.06], flow_origin=th, flow_scale=1.0)
        pl.hole(D(sidep([(112, 0.42), (130, 0.42), (130, 0.62), (112, 0.62)])))
        P.append(pl.export())
        P.append(Plate(it, f"thigh_vent_{s}", m["vent"], TM, D(sidep([(109, 0.4), (133, 0.4), (133, 0.64), (109, 0.64)])), 0.007, thickness=0.004,
                       bevel=0.0008, weights=pt, weight_mode=["band", tax, 0.06]).export())
        KM = LimbAdapter(LimbMap(ca - (ft - ca) * 0.16, ca + (ft - ca) * 0.16, fwd, np.concatenate([mt, mc]), t_range=(-0.3, 1.3), half=0.012, facets=10))
        pl = Plate(it, f"knee_{s}", m["plate"], KM, D([(-55, 0.0), (55, 0.0), (72, 0.5), (55, 1.0), (-55, 1.0), (-72, 0.5)]), 0.022, dome=0.008,
                   thickness=0.01, bevel=0.003, weights={"joints": ["calf", "thigh"], "side": s, "surfaces": surf}, weight_mode=["rigid"],
                   flow_origin=th, flow_scale=1.0)
        pl.groove(D([(-38, 0.18), (38, 0.18), (50, 0.5), (38, 0.82), (-38, 0.82), (-50, 0.5)]), closed=True)
        pl.bolt(0.0, 0.5, r=0.0045, h=0.004)
        P.append(pl.export())
        for k, (t0, t1) in enumerate(((0.14, 0.52), (0.55, 0.9))):
            pl = Plate(it, f"shin_{k}_{s}", m["plate"], CM, D([(-80, t0), (80, t0), (88, (t0 + t1) / 2), (70, t1 - 0.04), (0, t1 + 0.02), (-70, t1 - 0.04), (-88, (t0 + t1) / 2)]),
                       0.013, dome=0.004, keel=0.011, lip1=0.004, thickness=0.009, bevel=0.003, weights=pc, weight_mode=["band", cax, 0.06],
                       flow_origin=th, flow_scale=1.0)
            pl.groove(D([(-62, t0 + 0.05), (-66, t1 - 0.05)])).groove(D([(62, t0 + 0.05), (66, t1 - 0.05)]))
            pl.bolt(deg(-74), (t0 + t1) / 2).bolt(deg(74), (t0 + t1) / 2)
            P.append(pl.export())
        P.append(Plate(it, f"calf_guard_{s}", m["plate"], CM, D(sidep([(120, 0.15), (235, 0.15), (235, 0.62), (120, 0.62)])), 0.011, dome=0.005,
                       thickness=0.008, bevel=0.0026, weights=pc, weight_mode=["band", cax, 0.06]).export())
    return P


# ---------------------------------------------------------------- boots


def design_boots(body, base, m):
    it = "vanguard_field_set_boots"
    P = []
    ms = body.meshes["shell_shoes"]
    y0 = ms["V"][:, 1].min()
    fwd = [0, 0, 1.0]
    from scipy.spatial import ConvexHull

    for s, sg in SIDES:
        side_v = np.sign(ms["V"][:, 0]) == sg
        Fs = ms["F"][side_v[ms["F"]].all(1)]
        used = np.unique(Fs)
        rm = -np.ones(len(ms["V"]), int)
        rm[used] = np.arange(len(used))
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        F = rm[Fs]
        P.append(sheet_piece(it, f"boot_{s}", m["under"], ad.relax(ms["V"][used] + ms["N"][used] * 0.0035, F, 2, 0.3), F, 0.0025, weights=pol))
        cloud = ms["V"][side_v]
        ft, ball = body.L["foot_" + s], body.L["ball_" + s]
        leaf = body.L.get(f"ball_leaf_{s}", ball + (ball - ft) * 0.5)
        origin = body.L["calf_" + s]
        # armoured upper: a faceted shell lofted heel -> toe around the foot
        # (phi 0 = up), open underneath where the anchor sole sits
        zc = cloud[:, 2]
        xc = float(np.median(cloud[:, 0]))
        heel = np.array([xc, y0 + 0.05, zc.min() + 0.012])
        toe = np.array([xc, y0 + 0.032, zc.max() - 0.008])
        BM = LimbAdapter(LimbMap(heel, toe, [0, 1.0, 0], cloud, t_range=(-0.15, 1.12), step=0.02, half=0.02, rmax=0.13, facets=12, tsmooth=0.06))
        bax = list(map(float, (toe - heel) / np.linalg.norm(toe - heel)))
        pb = {**pol, "joints": ["foot", "ball"]}
        pl = Plate(it, f"upper_{s}", m["plate"], BM, D([(-150, -0.02), (150, -0.02), (150, 0.86), (96, 1.05), (-96, 1.05), (-150, 0.86)]), 0.006,
                   thickness=0.007, bevel=0.0026, res=0.011, weights=pb, weight_mode=["band", bax, 0.05], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-112, 0.1), (-112, 0.78), (-76, 0.96)]), width=0.0036).groove(D([(112, 0.1), (112, 0.78), (76, 0.96)]), width=0.0036)
        P.append(pl.export())
        pl = Plate(it, f"instep_{s}", m["plate"], BM, D([(-52, 0.36), (52, 0.36), (60, 0.55), (48, 0.74), (-48, 0.74), (-60, 0.55)]), 0.0145, dome=0.003,
                   keel=0.004, thickness=0.008, bevel=0.0026, res=0.008, weights=pb, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-30, 0.42), (-34, 0.68)])).groove(D([(30, 0.42), (34, 0.68)]))
        pl.bolt(0.0, 0.4, r=0.0036)
        P.append(pl.export())
        pl = Plate(it, f"toe_cap_{s}", m["plate"], BM, D([(-100, 0.78), (100, 0.78), (96, 0.94), (60, 1.06), (-60, 1.06), (-96, 0.94)]), 0.0145, dome=0.002,
                   thickness=0.008, bevel=0.0028, res=0.008, weights={**pol, "joints": ["ball", "foot"]}, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-74, 0.84), (0, 0.99), (74, 0.84)]))
        P.append(pl.export())
        P.append(Plate(it, f"heel_{s}", m["plate"], BM, D([(-120, -0.04), (120, -0.04), (110, 0.2), (-110, 0.2)]), 0.0145, thickness=0.008, bevel=0.0026,
                       res=0.008, weights=pb, weight_mode=["rigid"]).export())
        ca = body.L["calf_" + s]
        ins = np.isin(body.src, [body.surfaces.index(x) for x in ("body", "shell_shins", "shell_shoes") if x in body.surfaces])
        mc = body.P[(joint_weight(body, ["calf", "foot"], s) > 0.45) & ins & (body.P[:, 1] > ft[1] - 0.025)]
        CM = LimbAdapter(LimbMap(ca, ft, fwd, mc, t_range=(0.5, 1.15), half=0.015, rmax=0.085, facets=12, tsmooth=0.05))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        pl = Plate(it, f"cuff_{s}", m["plate"], CM, D([(-179, 0.74), (179, 0.74), (179, 1.03), (-179, 1.03)]), 0.011, lip0=0.005, thickness=0.008, bevel=0.003,
                   weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-150, 0.8), (150, 0.8)]), width=0.0036)
        P.append(pl.export())
        for k, (p0, p1) in enumerate(((60, 120), (-120, -60))):
            pl = Plate(it, f"ankle_{k}_{s}", m["plate"], CM, D([(p0, 0.84), (p1, 0.84), (p1 - 6, 1.0), (p0 + 6, 1.0)]), 0.026, dome=0.006, thickness=0.008,
                       bevel=0.0026, weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
            pl.groove(D([((p0 + p1) / 2, 0.87), ((p0 + p1) / 2, 0.97)]))
            pl.bolt(deg((p0 + p1) / 2), 0.92, r=0.0035)
            P.append(pl.export())
        hp = cloud[cloud[:, 1] < y0 + 0.02][:, [0, 2]]
        hull = hp[ConvexHull(hp).vertices]
        c = hull.mean(0)
        hull = c + (hull - c) * 1.06
        P.append(sheet_piece(it, f"sole_{s}", m["sole"], np.zeros((0, 3)), np.zeros((0, 3), int), 0.0, weights=pol, weight_mode=["rigid"],
                             sole={"outline": hull.tolist(), "y0": float(y0 - 0.012), "y1": float(y0 + 0.026), "treads": 9}, bevel=0.003, bevel_segments=2))
    return P


DESIGNS = {"cinderlock_chest": design_cuirass, "cinderlock_gloves": design_gauntlets,
           "cinderlock_greaves": design_greaves, "cinderlock_boots": design_boots}
ad.DESIGNS.update(DESIGNS)
