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

    def metric(self):
        """Metres per parameter unit along a and b at the plate centre."""
        ac, bc = (self.amin + self.amax) / 2, (self.bmin + self.bmax) / 2
        e = 1e-3
        sa = np.linalg.norm(self.m.point(ac + e, bc, self.off) - self.m.point(ac - e, bc, self.off)) / (2 * e)
        sb = np.linalg.norm(self.m.point(ac, bc + e, self.off) - self.m.point(ac, bc - e, self.off)) / (2 * e)
        return sa, sb

    def inset(self, d, poly=None):
        """The plate outline (or `poly`) moved inward by about d metres."""
        sa, sb = self.metric()
        return inset_poly(self.poly if poly is None else poly, sa, sb, d)

    def trace(self, d=0.0075, chain=None, **kw):
        """An emissive channel tracing the plate perimeter d metres inside its
        edge (the reference's outlined plates). `chain=(i, j)` keeps only the
        run of corners i..j (forward, wrapping): an open trace along some edges."""
        P = self.inset(d)
        if chain is None:
            return self.groove(P, closed=True, **kw)
        i, j = chain
        n = len(P)
        run = [P[(i + k) % n] for k in range(((j - i) % n) + 1)]
        return self.groove(run, **kw)

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


def inset_poly(poly, sa, sb, d):
    """Offset a convex polygon (parameter space, metric scales sa, sb) inward
    by d metres: each edge line moves inward, corners are the intersections
    of neighbouring lines (clamped where an edge is very short)."""
    P = np.asarray(poly, float) * [sa, sb]
    n = len(P)
    area = 0.5 * sum(P[i, 0] * P[(i + 1) % n, 1] - P[(i + 1) % n, 0] * P[i, 1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0  # inward is to the left of a CCW edge
    lines = []
    for i in range(n):
        p, q = P[i], P[(i + 1) % n]
        t = (q - p) / max(np.linalg.norm(q - p), 1e-12)
        lines.append((p + sgn * np.array([-t[1], t[0]]) * d, t))
    out = []
    for i in range(n):
        (p1, t1), (p2, t2) = lines[i - 1], lines[i]
        A = np.array([t1, -t2]).T
        if abs(np.linalg.det(A)) < 1e-6:
            c = (p1 + p2) / 2
        else:
            s_ = np.linalg.solve(A, p2 - p1)[0]
            c = p1 + s_ * t1
            if np.linalg.norm(c - P[i]) > 4 * d:  # a sharp spike: fall back to the bisector point
                c = P[i] + (((p1 - P[i]) + (p2 - P[i])) / 2)
        out.append(c / [sa, sb])
    return [tuple(map(float, c)) for c in out]


def bar(item, name, mat, segs, weights=None, weight_mode=None, bevel=0.0009):
    """Small solid bars (straps, buckles, fins): [(p0, p1, nrm, width, height)],
    each a bevelled box from p0 to p1 standing `height` off the surface."""
    from .humanoid_wardrobe import box

    parts = []
    for p0, p1, nrm, w, h in segs:
        p0, p1, nrm = (np.asarray(x, float) for x in (p0, p1, nrm))
        L = np.linalg.norm(p1 - p0)
        d = (p1 - p0) / L
        nrm = nrm - d * (nrm @ d)
        nrm /= np.linalg.norm(nrm)
        parts.append(box((p0 + p1) / 2 + nrm * h / 2, (w, h, L), nrm, d))
    out = {"name": f"{item}__{name}", "set": item, "mat": mat, "V": parts, "F": None, "multi": True, "core": True, "hs": True, "thickness": 0.0,
           "bevel": bevel, "bevel_segments": 1, "grooves": [], "holes": [], "bolts": [], "relax": False, "gap": 0.0, "even": False}
    if weights:
        out["weights"] = weights
    if weight_mode:
        out["weight_mode"] = weight_mode
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


# ---------------------------------------------------------------- shared


def side_chain(chain, n, sg):
    """A corner run authored on the left-side polygon, for the mirrored side
    (mirror_poly reverses the corner order)."""
    if chain is None or sg > 0:
        return chain
    i, j = chain
    return (n - 1 - j, n - 1 - i)


def surfaces_mask(body, names):
    return np.isin(body.src, [body.surfaces.index(x) for x in names if x in body.surfaces])


# ---------------------------------------------------------------- A. reactor cuirass
#
# Heavy segmented chest rig ending at the natural waist (the belt of the
# trousers covers the hem). Front: a recessed hexagonal reactor vent flanked by
# angled trapezoidal pectoral plates, three tiers of abdominal plates and
# lateral rib-cage vents. Back: a four-segment vertebral column between two
# vertical heat-sink housings. High stand-up collar with a throat notch and a
# raised nape guard. Emissive channels trace the reactor, the pectorals and
# the collar trim.


def design_cuirass(body, base, m):
    it = "vanguard_field_set_chest"
    T = TorsoMap(body, facets=26)
    core = T.point(0.0, 0.7, base + 0.03)
    P = [ad.vest_body(body, it, m["under"], base - 0.002, hem_u=0.06, neck_front=0.92, neck_back=0.95, arm_u=0.76, top_u=0.98)]
    pls = []
    band = ["band", "y", 0.05]

    def plate(name, poly, layer, mat="plate", **kw):
        kw.setdefault("flow_origin", core)
        kw.setdefault("weight_mode", band)
        pl = Plate(it, name, m[mat], T, D(poly), base + layer, **kw)
        pls.append(pl)
        return pl

    def bars(name, a0, a1, us, off, mat="trim", w=0.0042, h=0.0042, vertical=False):
        segs = []
        for u in us:
            p0, p1 = T.point(deg(a0), u, off), T.point(deg(a1), u, off)
            segs.append((p0, p1, T.normal(deg((a0 + a1) / 2), u, off), w, h))
        P.append(bar(it, name, m[mat], segs, weight_mode=band))

    for s, sg in SIDES:
        f = lambda a: sg * a
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        # pectoral: angled trapezoid, traced on its whole perimeter
        pec = [(6, 0.62), (40, 0.6), (58, 0.68), (61, 0.82), (46, 0.94), (15, 0.96), (6, 0.89)]
        pl = plate(f"pec_{s}", side(pec), 0.006, dome=0.003, thickness=0.009)
        pl.trace(0.0085, width=0.0046, n_per=8)
        pl.groove(D([(f(18), 0.7), (f(44), 0.66)]), width=0.0034)
        for a, b in ((f(12), 0.93), (f(54), 0.79), (f(38), 0.625)):
            pl.bolt(deg(a), b)
        # three tiered abdominal plates per side, short horizontal channels
        for r, (u0, u1) in enumerate(((0.43, 0.535), (0.305, 0.41), (0.18, 0.285))):
            pl = plate(f"ab_{s}{r}", side([(3.5, u0), (33, u0), (41, u0 + 0.035), (41, u1), (3.5, u1)]), 0.004 + 0.0015 * r, dome=0.004,
                       thickness=0.008, weight_mode=["rigid"])
            mid = (u0 + u1) / 2
            pl.groove(D([(f(22), mid), (f(36), mid)]))
            pl.bolt(deg(f(7.5)), mid)
        # lateral rib-cage vent: a framed window with fins behind it
        pl = plate(f"flank_{s}", side([(60, 0.3), (92, 0.3), (99, 0.4), (97, 0.62), (66, 0.66), (58, 0.5)]), 0.005, dome=0.004, thickness=0.008)
        pl.hole(D(side([(71, 0.425), (85, 0.425), (89, 0.5), (85, 0.575), (71, 0.575), (67, 0.5)])))
        pl.groove(D([(f(a), b) for a, b in [(69.2, 0.405), (86.8, 0.405), (91.5, 0.5), (86.8, 0.595), (69.2, 0.595), (64.5, 0.5)]]), closed=True, width=0.0034)
        pl.bolt(deg(f(63)), 0.34).bolt(deg(f(94)), 0.6)
        P.append(Plate(it, f"flank_vent_{s}", m["vent"], T, D(side([(69, 0.41), (87, 0.41), (91, 0.5), (87, 0.59), (69, 0.59), (65, 0.5)])), base + 0.0015,
                       thickness=0.003, bevel=0.0008, weight_mode=band).export())
        bars(f"flank_fins_{s}", f(70), f(86), np.linspace(0.445, 0.555, 5), base + 0.006, w=0.0036, h=0.0036)
        # back: scapular plates and three rows, clear of the spine housings
        back = lambda poly: [(180 - a, b) for a, b in poly][::-1] if sg > 0 else mirror_poly([(180 - a, b) for a, b in poly][::-1], 180)
        pl = plate(f"scapula_{s}", back([(30, 0.6), (48, 0.58), (58, 0.67), (60, 0.82), (48, 0.94), (30, 0.95)]), 0.006, dome=0.003, thickness=0.009)
        pl.trace(0.008, width=0.0038, n_per=8)
        for r, (u0, u1) in enumerate(((0.43, 0.545), (0.3, 0.415), (0.17, 0.285))):
            pl = plate(f"back_{s}{r}", back([(30, u0), (52, u0), (57, u0 + 0.035), (57, u1), (30, u1)]), 0.004 + 0.0015 * r, dome=0.003, thickness=0.008,
                       weight_mode=["rigid"])
            pl.groove(D([(180 - f(36), (u0 + u1) / 2), (180 - f(50), (u0 + u1) / 2)]), width=0.0034)
        # vertical heat-sink housing beside the spine
        hs = back([(11, 0.36), (25, 0.36), (27, 0.42), (27, 0.84), (25, 0.88), (11, 0.88)])
        pl = plate(f"sink_{s}", hs, 0.012, dome=0.003, thickness=0.012, bevel=0.003)
        pl.hole(D(back([(14, 0.45), (22, 0.45), (22, 0.8), (14, 0.8)])))
        pl.trace(0.0055, width=0.0034, n_per=8)
        pl.bolt(deg(180 - f(18)), 0.395).bolt(deg(180 - f(18)), 0.845)
        P.append(Plate(it, f"sink_vent_{s}", m["vent"], T, D(back([(13, 0.44), (23, 0.44), (23, 0.81), (13, 0.81)])), base + 0.006, thickness=0.004,
                       bevel=0.0008, weight_mode=band).export())
        bars(f"sink_fins_{s}", 180 - f(14.5), 180 - f(21.5), np.linspace(0.47, 0.78, 9), base + 0.011, w=0.0032, h=0.006)
    # sternum frame around the hexagonal reactor window
    pl = plate("sternum", [(-16, 0.555), (16, 0.555), (20.5, 0.7), (16, 0.845), (-16, 0.845), (-20.5, 0.7)], 0.014, dome=0.004, thickness=0.01, bevel=0.003,
               weight_mode=["rigid"])
    pl.hole(D([(-9.5, 0.615), (9.5, 0.615), (12.5, 0.7), (9.5, 0.785), (-9.5, 0.785), (-12.5, 0.7)]))
    pl.groove(D([(-13, 0.585), (13, 0.585), (16.8, 0.7), (13, 0.815), (-13, 0.815), (-16.8, 0.7)]), closed=True, width=0.0052, depth=0.003)
    pl.trace(0.0045, width=0.0028, n_per=6)
    for a, b in ((-15, 0.572), (15, 0.572), (-15, 0.828), (15, 0.828)):
        pl.bolt(deg(a), b, r=0.0028)
    P.append(Plate(it, "reactor_back", m["vent"], T, D([(-13, 0.6), (13, 0.6), (16, 0.7), (13, 0.8), (-13, 0.8), (-16, 0.7)]), base + 0.006,
                   thickness=0.004, bevel=0.0008, weight_mode=["rigid"]).export())
    bars("reactor_fins", -11.5, 11.5, np.linspace(0.635, 0.765, 6), base + 0.011, w=0.004, h=0.006)
    # central abdominal spine strip between the tiers
    pl = plate("linea", [(-3, 0.18), (3, 0.18), (3, 0.54), (-3, 0.54)], 0.009, keel=0.002, thickness=0.006, mat="trim")
    # back: four interlocking vertebral segments
    for k, (u0, u1) in enumerate(((0.3, 0.44), (0.455, 0.595), (0.61, 0.75), (0.765, 0.905))):
        pl = plate(f"spine_{k}", [(173, u0 + 0.025), (180, u0), (187, u0 + 0.025), (187, u1 - 0.01), (180, u1 + 0.012), (173, u1 - 0.01)],
                   0.013, keel=0.004, dome=0.002, thickness=0.009, weight_mode=["rigid"])
        pl.groove(D([(180, u0 + 0.035), (180, u1 - 0.02)]), width=0.0036)
    # collar: two segmented rings open at the throat, trimmed with channels
    nk = body.L["neck_01"]
    cloud = np.concatenate([body.meshes["body"]["V"], body.meshes["head"]["V"]])
    cloud = cloud[(np.abs(cloud[:, 0]) < 0.1) & (cloud[:, 1] > nk[1] - 0.12) & (cloud[:, 1] < nk[1] + 0.12)]
    NM = LimbAdapter(LimbMap(np.array([0, nk[1] - 0.055, nk[2]]), np.array([0, nk[1] + 0.065, nk[2]]), [0, 0, 1.0], cloud,
                             t_range=(-0.2, 1.3), half=0.01, rmax=0.12, facets=14))
    # a stand-up collar that stays below the jaw: two short rings close to the neck
    for k, (t0, t1, op, lay) in enumerate(((0.0, 0.4, 18, 0.028), (0.43, 0.7, 24, 0.017))):
        pc = Plate(it, f"collar_{k}", m["plate"], NM, D([(op, t0), (360 - op, t0), (360 - op, t1), (op, t1)]), lay, dome=0.003, thickness=0.008,
                   bevel=0.0025, weight_mode=["band", "y", 0.03], flow_origin=core)
        pc.groove(D([(op + 7, t0 + 0.1), (op + 7, t1 - 0.1)]))
        pc.groove(D([(353 - op, t0 + 0.1), (353 - op, t1 - 0.1)]))
        if k == 1:
            pc.trace(0.006, chain=(2, 3), width=0.0034, n_per=40)
        pls.append(pc)
    pc = Plate(it, "nape", m["plate"], NM, D([(148, 0.06), (212, 0.06), (218, 0.5), (206, 0.84), (154, 0.84), (142, 0.5)]), 0.036, dome=0.004,
               thickness=0.008, bevel=0.0025, weight_mode=["rigid"], flow_origin=core)
    pc.trace(0.006, chain=(2, 5), width=0.0034, n_per=8)
    pls.append(pc)
    return P + [pl.export() for pl in pls]


# ---------------------------------------------------------------- B. deltoid caps and bicep guards
#
# Low, close-fitting deltoid caps over a dark ribbed undersuit sleeve, with a
# wrap-around outer bicep guard held by two tension straps. The inner armpit
# and the elbow crease stay plate-free. Each cap is one rigid island blended
# between clavicle and upper arm (a "floating" cap: the shared runtime
# skeleton has no extra socket bones); bicep guards are rigid on the upper arm.


def design_arms(body, base, m):
    it = "cinderlock_arms"
    T = TorsoMap(body)
    core = T.point(0.0, 0.7, base + 0.03)
    P = []
    skin = surfaces_mask(body, ["body"])
    for s, sg in SIDES:
        ua, la = body.L["upperarm_" + s], body.L["lowerarm_" + s]
        f = lambda a: sg * a  # +phi = front on the left arm, back on the right
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        cl = body.P[(joint_weight(body, ["upperarm"], s) > 0.4) & skin]
        AM = LimbAdapter(LimbMap(ua, la, [0, 1.0, 0], cl, t_range=(-0.35, 1.3), half=0.012, rmax=0.11, tsmooth=0.05))
        ax = list(map(float, (la - ua) / np.linalg.norm(la - ua)))
        sleeve_pol = {"joints": ["upperarm", "clavicle", "lowerarm"], "side": s, "surfaces": ["body"]}
        sl = Plate(it, f"sleeve_{s}", m["under"], AM, D([(-179.5, -0.02), (179.5, -0.02), (179.5, 1.12), (-179.5, 1.12)]), 0.0045, thickness=0.0025,
                   bevel=0.0, segs=0, res=0.01, weights=sleeve_pol)
        for k in range(8):  # ribbed weave toward the elbow (baked into the low mesh's normal map)
            sl.groove(D([(-178, 0.6 + k * 0.065), (178, 0.6 + k * 0.065)]), inlay=False, width=0.0026, depth=0.0011, n_per=64)
        P.append(sl.export())
        # deltoid cap over the shoulder ball, crimson piping along its lower edge
        sel = ~body.head & (np.abs(body.P[:, 0]) > 0.1) & (np.sign(body.P[:, 0]) == sg)
        YM = LimbAdapter(LimbMap(ua, la, [0, 1.0, 0], body.P[sel], t_range=(-0.5, 0.8), half=0.012, rmax=0.13, facets=12))
        cap = Plate(it, f"deltoid_{s}", m["plate"], YM, D([(-104, -0.28), (104, -0.28), (114, 0.06), (100, 0.31), (-100, 0.31), (-114, 0.06)]),
                    base + 0.014, dome=0.007, thickness=0.009, bevel=0.003, weights={"joints": ["clavicle", "upperarm"], "side": s, "surfaces": ["body"]},
                    weight_mode=["rigid"], flow_origin=core)
        cap.trace(0.0065, chain=(2, 5), width=0.0046, n_per=24)
        cap.groove(D([(-70, -0.16), (70, -0.16)]), width=0.0028, n_per=16)
        cap.bolt(deg(-82), -0.18).bolt(deg(82), -0.18).bolt(0.0, -0.05, r=0.0042, h=0.0035)
        P.append(cap.export())
        # outer bicep guard: U-shaped trace, two tension straps around the back of the arm
        bic = [(-56, 0.3), (82, 0.3), (90, 0.55), (78, 0.8), (-46, 0.8), (-54, 0.55)]
        pl = Plate(it, f"bicep_{s}", m["plate"], AM, D(side(bic)), 0.0115, dome=0.004, keel=0.002, thickness=0.008, bevel=0.0028,
                   weights={"joints": ["upperarm"], "side": s, "surfaces": ["body"]}, weight_mode=["rigid"], flow_origin=core)
        pl.trace(0.0065, chain=side_chain((1, 0), len(bic), sg), width=0.0042, n_per=10)
        pl.bolt(deg(f(-40)), 0.36).bolt(deg(f(66)), 0.36)
        P.append(pl.export())
        for k, t in enumerate((0.42, 0.68)):
            st = Plate(it, f"strap_{k}_{s}", m["trim"], AM, D(side([(88, t - 0.032), (304, t - 0.032), (304, t + 0.032), (88, t + 0.032)])), 0.0062,
                       thickness=0.0032, bevel=0.001, res=0.008, weights={"joints": ["upperarm"], "side": s, "surfaces": ["body"]}, weight_mode=["band", ax, 0.05])
            P.append(st.export())
            segs = []
            for a in (f(86), f(-52)):  # strap tabs riding over the guard's edges
                p0, p1 = AM.point(deg(a) - deg(f(5)), t, 0.021), AM.point(deg(a) + deg(f(5)), t, 0.021)
                segs.append((p0, p1, AM.normal(deg(a), t, 0.021), 0.012, 0.0035))
            P.append(bar(it, f"tab_{k}_{s}", m["trim"], segs, weights={"joints": ["upperarm"], "side": s, "surfaces": ["body"]}, weight_mode=["rigid"]))
    return P


# ---------------------------------------------------------------- C. induction gauntlets


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
        pol = lambda joints: {"joints": joints, "side": s, "surfaces": ["hands", "body"]}
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
        on_skin = surfaces_mask(body, ["body", "hands"])
        fa = body.P[(joint_weight(body, ["lowerarm"], s) > 0.5) & on_skin]
        VM = LimbAdapter(LimbMap(body.L["lowerarm_" + s], body.L["hand_" + s], Dn, fa, t_range=(-0.1, 1.15), half=0.014, rmax=0.075, facets=14, tsmooth=0.04))
        ax = (body.L["hand_" + s] - body.L["lowerarm_" + s])
        ax = list(map(float, ax / np.linalg.norm(ax)))
        # forearm sleeve under the bracer (elbow to wrist)
        P.append(Plate(it, f"cuff_liner_{s}", m["under"], VM, D([(-179.5, -0.04), (179.5, -0.04), (179.5, 1.0), (-179.5, 1.0)]), 0.0035, thickness=0.0022,
                       bevel=0.0, segs=0, res=0.01, weights=pol(["lowerarm", "hand", "upperarm"])).export())
        for k, (t0, t1) in enumerate(((0.16, 0.54), (0.58, 0.93))):
            pl = Plate(it, f"vambrace_{k}_{s}", m["plate"], VM, D([(-179, t0), (179, t0), (179, t1), (-179, t1)]), 0.0075 + 0.0015 * k, thickness=0.006, lip0=0.0035,
                       bevel=0.0024, weights=pol(["lowerarm"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
            pl.groove(D([(-150, t0 + 0.05), (150, t0 + 0.05)]), width=0.0032, inlay=False, n_per=40)
            P.append(pl.export())
        # layered outer ulna shield: the conduit runs down its ridge through the core
        pl = Plate(it, f"ulna_{s}", m["plate"], VM, D([(-50, 0.2), (50, 0.2), (58, 0.6), (44, 0.92), (-44, 0.92), (-58, 0.6)]), 0.0155,
                   dome=0.004, keel=0.003, thickness=0.008, bevel=0.0028, weights=pol(["lowerarm"]), weight_mode=["rigid"],
                   flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(0, 0.25), (0, 0.39)]), width=0.0044).groove(D([(0, 0.61), (0, 0.9)]), width=0.0044)
        pl.trace(0.007, chain=(1, 3), width=0.0032, n_per=8).trace(0.007, chain=(4, 0), width=0.0032, n_per=8)
        pl.hole(D([(-12, 0.4), (12, 0.4), (14, 0.5), (12, 0.6), (-12, 0.6), (-14, 0.5)]))
        for a, b in ((-44, 0.28), (44, 0.28), (-36, 0.86), (36, 0.86)):
            pl.bolt(deg(a), b, r=0.0026)
        P.append(pl.export())
        P.append(Plate(it, f"ulna_core_{s}", m["vent"], VM, D([(-14, 0.38), (14, 0.38), (16, 0.5), (14, 0.62), (-14, 0.62), (-16, 0.5)]), 0.0115,
                       thickness=0.005, bevel=0.0008, weights=pol(["lowerarm"]), weight_mode=["rigid"]).export())
        # heavy buckled wrist cuff
        P.append(Plate(it, f"wrist_strap_{s}", m["trim"], VM, D([(-179, 0.9), (179, 0.9), (179, 1.0), (-179, 1.0)]), 0.0175, thickness=0.004, bevel=0.0012,
                       weights=pol(["lowerarm", "hand"]), weight_mode=["band", ax, 0.03]).export())
        bp0, bp1 = VM.point(deg(90 * sg), 0.91, 0.022), VM.point(deg(90 * sg), 0.99, 0.022)
        P.append(bar(it, f"buckle_{s}", m["plate"], [(bp0, bp1, VM.normal(deg(90 * sg), 0.95, 0.022), 0.018, 0.004)],
                     weights=pol(["lowerarm", "hand"]), weight_mode=["rigid"]))
        HM = LimbAdapter(LimbMap(body.L["hand_" + s], body.L[f"middle_01_{s}"], Dn, cloud_for([f"hand_{s}"]), t_range=(-0.2, 1.25), half=0.01, rmax=0.08, facets=8))
        # dorsal metacarpal plate: the conduit splits into a fan toward the knuckles
        pl = Plate(it, f"hand_plate_{s}", m["plate"], HM, D([(-62, 0.12), (62, 0.12), (70, 0.6), (58, 0.92), (-58, 0.92), (-70, 0.6)]), 0.006, dome=0.004,
                   thickness=0.006, bevel=0.002, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        for a in (-36, -12, 12, 36):
            pl.groove(D([(0, 0.2), (a * 0.5, 0.5), (a, 0.86)]), width=0.0024, depth=0.002)
        P.append(pl.export())
        # individually segmented phalanges, a thin strip along each segment
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
                pl.groove(D([(0, 0.16), (0, t1 - 0.14)]), width=0.0017, depth=0.0013, n_per=4)
                P.append(pl.export())
        for seg, nxt in (("02", "03"), ("03", "04_leaf")):
            a, b = body.L.get(f"thumb_{seg}_{s}"), body.L.get(f"thumb_{nxt}_{s}")
            cl = cloud_for([f"thumb_{seg}_{s}"])
            if a is None or b is None or len(cl) < 20:
                continue
            ref = np.cross(b - a, hand_axis)
            ref = ref * np.sign(ref @ Dn) if np.linalg.norm(ref) > 1e-6 else Dn
            FM = LimbAdapter(LimbMap(a, b, ref, cl, t_range=(-0.3, 1.3), step=0.05, half=0.006, rmax=0.03, facets=6))
            pl = Plate(it, f"thumb_{seg}_{s}", m["plate"], FM, D([(-75, 0.05), (75, 0.05), (75, 0.8), (-75, 0.8)]), 0.0035, dome=0.0015,
                       thickness=0.0028, bevel=0.0009, res=0.005, weights=pol([f"thumb_{seg}"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
            pl.groove(D([(0, 0.16), (0, 0.64)]), width=0.0017, depth=0.0013, n_per=4)
            P.append(pl.export())
    return P


# ---------------------------------------------------------------- D. tactical trousers, belt and thigh plates


def design_legs(body, base, m):
    it = "cinderlock_legs"
    P = []
    fwd = [0, 0, 1.0]
    skin = surfaces_mask(body, ["body"])
    # the crotch, from the skin's pelvis-weighted centre line (the shorts
    # shell is skirt-shaped down to the knee and is hidden under the trousers)
    bm_ = body.meshes["body"]
    wp = ((bm_["J"] == body.joints.index("pelvis")) * bm_["W"]).sum(1)
    crotch_y = float(bm_["V"][(wp > 0.3) & (np.abs(bm_["V"][:, 0]) < 0.02)][:, 1].min()) - 0.03
    u_crotch = float((crotch_y - body.y_p) / (body.y_n - body.y_p))
    # waist map over the hips and seat (the torso map stops at the pelvis)
    ya, yb = float(body.y(-0.25)), float(body.y(0.2))
    zc = float(body.centre(body.y(0.03))[2])
    wsel = ~body.head & ~body.arm & (body.P[:, 1] > crotch_y - 0.005) & (body.P[:, 1] < yb + 0.03) & (np.abs(body.P[:, 0]) < 0.3)
    WM = LimbAdapter(LimbMap(np.array([0.0, ya, zc]), np.array([0.0, yb, zc]), [0, 0, 1.0], body.P[wsel], t_range=(-0.1, 1.1), half=0.01, rmax=0.3,
                             facets=26, tsmooth=0.03))
    tw = lambda u: (float(body.y(u)) - ya) / (yb - ya)
    W = lambda poly: [(a, tw(u)) for a, u in poly]
    flow0 = WM.point(0.0, tw(0.03), 0.02)
    band = ["band", "y", 0.05]
    # trouser seat: from under the belt down to the crotch, bridging the legs like a gusset
    P.append(Plate(it, "seat", m["under"], WM, D(W([(-179.5, u_crotch), (179.5, u_crotch), (179.5, 0.065), (-179.5, 0.065)])), 0.006, thickness=0.0024,
                   bevel=0.0, segs=0, res=0.011, weights={"joints": ["pelvis", "spine_01", "thigh"], "surfaces": ["body", "shell_shorts"]}).export())
    # 5 cm webbing belt, matte metal buckle, two side pouches
    pl = Plate(it, "belt", m["trim"], WM, D(W([(-179.5, -0.015), (179.5, -0.015), (179.5, 0.075), (-179.5, 0.075)])), 0.012, thickness=0.005,
               bevel=0.0015, res=0.01, weight_mode=band)
    pl.groove(D(W([(-178, 0.005), (178, 0.005)])), inlay=False, width=0.0018, depth=0.001, n_per=80)
    pl.groove(D(W([(-178, 0.055), (178, 0.055)])), inlay=False, width=0.0018, depth=0.001, n_per=80)
    P.append(pl.export())
    bk = Plate(it, "buckle", m["metal"], WM, D(W([(-8, -0.005), (8, -0.005), (8, 0.065), (-8, 0.065)])), 0.0185, dome=0.002, thickness=0.006, bevel=0.0018,
               weight_mode=["rigid"])
    bk.hole(D(W([(-4.5, 0.012), (4.5, 0.012), (4.5, 0.048), (-4.5, 0.048)])))
    P.append(bk.export())
    for s, sg in SIDES:
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        po = Plate(it, f"pouch_{s}", m["trim"], WM, D(W(side([(54, -0.075), (76, -0.075), (78, 0.065), (52, 0.065)]))), 0.019, dome=0.004, thickness=0.024,
                   bevel=0.004, segs=2, weight_mode=["rigid"])
        P.append(po.export())
        fl = Plate(it, f"pouch_flap_{s}", m["trim"], WM, D(W(side([(53, 0.0), (77, 0.0), (77.5, 0.07), (52.5, 0.07)]))), 0.0445, dome=0.003, thickness=0.004,
                   bevel=0.0014, weight_mode=["rigid"])
        fl.bolt(deg(sg * 65), tw(0.012), r=0.0035)
        P.append(fl.export())
    # legs
    surf = ["body"]
    for s, sg in SIDES:
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        mt = body.P[skin & (np.sign(body.P[:, 0]) == sg) & (body.P[:, 1] < crotch_y + 0.05) & (body.P[:, 1] > ca[1] - 0.06)]
        mc = body.P[(joint_weight(body, ["calf"], s) > 0.45) & skin]
        TM = LimbAdapter(LimbMap(th, ca, fwd, mt, t_range=(-0.15, 1.15), rmax=0.14, tsmooth=0.05))
        CM = LimbAdapter(LimbMap(ca, ft, fwd, mc, t_range=(-0.25, 1.1), tsmooth=0.04))
        tax = list(map(float, (ca - th) / np.linalg.norm(ca - th)))
        t_crotch = float((th[1] - crotch_y) / (th[1] - ca[1]))
        pt = {"joints": ["thigh", "calf"], "side": s, "surfaces": surf}
        pc = {"joints": ["calf", "thigh", "foot"], "side": s, "surfaces": surf}
        o = -sg  # outer side: +phi points to -x on a downward bone with a forward ref
        sidep = lambda poly: poly if o > 0 else mirror_poly(poly)
        # trouser legs: crotch to knee, knee to the boot collar (under the greaves)
        P.append(Plate(it, f"leg_thigh_{s}", m["under"], TM, D([(-179.5, t_crotch - 0.07), (179.5, t_crotch - 0.07), (179.5, 1.06), (-179.5, 1.06)]), 0.009,
                       thickness=0.0024, bevel=0.0, segs=0, res=0.011, weights=pt).export())
        P.append(Plate(it, f"leg_calf_{s}", m["under"], CM, D([(-179.5, -0.08), (179.5, -0.08), (179.5, 0.84), (-179.5, 0.84)]), 0.0055, thickness=0.0024,
                       bevel=0.0, segs=0, res=0.011, weights=pc).export())
        t0 = t_crotch + 0.05
        # hip seam piping down the outer thigh
        sm = Plate(it, f"seam_{s}", m["trim"], TM, D(sidep([(116, t_crotch - 0.04), (124, t_crotch - 0.04), (124, 0.92), (116, 0.92)])), 0.0125, thickness=0.0026,
                   bevel=0.0008, res=0.01, weights=pt, weight_mode=["band", tax, 0.08], flow_origin=flow0, flow_scale=1.0)
        sm.groove(D([(o * 120, t_crotch - 0.02), (o * 120, 0.9)]), width=0.0026, depth=0.0018, n_per=12)
        P.append(sm.export())
        # angled outer-quadriceps guard, tapering toward the knee, outlined
        qd = [(4, t0 + 0.04), (100, t0), (106, t0 + 0.26), (82, 0.76), (30, 0.8), (8, t0 + 0.42)]
        pl = Plate(it, f"thigh_{s}", m["plate"], TM, D(sidep(qd)), 0.02, dome=0.0035, keel=0.005, thickness=0.009, bevel=0.003,
                   weights={"joints": ["thigh"], "side": s, "surfaces": surf}, weight_mode=["rigid"], flow_origin=flow0, flow_scale=1.0)
        pl.trace(0.0075, width=0.0044, n_per=10)
        pl.bolt(deg(o * 14), t0 + 0.08).bolt(deg(o * 92), t0 + 0.05)
        P.append(pl.export())
        # hip plate (tasset) hung from the belt, blended between pelvis and thigh
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        hp = [(66, -0.25), (114, -0.25), (120, -0.12), (112, -0.025), (72, -0.025), (60, -0.12)]
        pl = Plate(it, f"hip_{s}", m["plate"], WM, D(W(side(hp))), 0.026, dome=0.004, thickness=0.008, bevel=0.0028,
                   weights={"joints": ["pelvis", "thigh_" + s], "surfaces": surf}, weight_mode=["rigid"], flow_origin=flow0, flow_scale=1.0)
        pl.trace(0.007, chain=side_chain((5, 2), len(hp), sg), width=0.0036, n_per=10)
        pl.bolt(deg(sg * 92), tw(-0.05), r=0.0038)
        P.append(pl.export())
    return P


# ---------------------------------------------------------------- E. impact greaves


def design_greaves(body, base, m):
    it = "vanguard_field_set_greaves"
    P = []
    fwd = [0, 0, 1.0]
    for s, sg in SIDES:
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        surf = ["body"]
        ins = surfaces_mask(body, surf)
        mt = body.P[(joint_weight(body, ["thigh"], s) > 0.45) & ins]
        mc = body.P[(joint_weight(body, ["calf"], s) > 0.45) & ins]
        CM = LimbAdapter(LimbMap(ca, ft, fwd, mc, t_range=(-0.25, 1.1), facets=12, tsmooth=0.04))
        pc = {"joints": ["calf"], "side": s, "surfaces": surf}
        origin = th
        # hexagonal knee cop on its own rigid thigh/calf blend (floats over the joint)
        KM = LimbAdapter(LimbMap(ca - (ft - ca) * 0.16, ca + (ft - ca) * 0.16, fwd, np.concatenate([mt, mc]), t_range=(-0.3, 1.3), half=0.012, facets=10))
        pl = Plate(it, f"knee_{s}", m["plate"], KM, D([(-55, 0.0), (55, 0.0), (72, 0.5), (55, 1.0), (-55, 1.0), (-72, 0.5)]), 0.024, dome=0.008,
                   thickness=0.01, bevel=0.003, weights={"joints": ["calf", "thigh"], "side": s, "surfaces": surf}, weight_mode=["rigid"],
                   flow_origin=origin, flow_scale=1.0)
        pl.trace(0.0075, width=0.0044, n_per=8)
        pl.groove(D([(-30, 0.52), (0, 0.78), (30, 0.52)]), width=0.0044)  # the chevron
        pl.bolt(0.0, 0.34, r=0.0045, h=0.004)
        P.append(pl.export())
        # forward-swept tibia blade in two segments, conduits down both sides of the ridge
        for k, (t0, t1) in enumerate(((0.1, 0.4), (0.43, 0.86))):
            sh = [(-80, t0), (80, t0), (88, (t0 + t1) / 2), (70, t1 - 0.04), (0, t1 + 0.02), (-70, t1 - 0.04), (-88, (t0 + t1) / 2)]
            pl = Plate(it, f"shin_{k}_{s}", m["plate"], CM, D(sh), 0.014, dome=0.004, keel=0.012, lip1=0.004, thickness=0.009, bevel=0.003,
                       weights=pc, weight_mode=["rigid"], flow_origin=origin, flow_scale=1.0)
            pl.groove(D([(-20, t0 + 0.04), (-26, t1 - 0.06)]), width=0.0042).groove(D([(20, t0 + 0.04), (26, t1 - 0.06)]), width=0.0042)
            pl.trace(0.007, chain=(2, 6), width=0.003, inlay=False, n_per=8)
            pl.bolt(deg(-74), (t0 + t1) / 2).bolt(deg(74), (t0 + t1) / 2)
            P.append(pl.export())
        # hinged rear calf shell
        pl = Plate(it, f"calf_{s}", m["plate"], CM, D([(92, 0.1), (268, 0.1), (262, 0.74), (98, 0.74)]), 0.0115, dome=0.005, thickness=0.008,
                   bevel=0.0026, weights=pc, weight_mode=["rigid"], flow_origin=origin, flow_scale=1.0)
        pl.groove(D([(140, 0.18), (220, 0.18)]), width=0.0032, inlay=False, n_per=10)
        for b in (0.2, 0.62):
            pl.bolt(deg(96), b, r=0.004, h=0.0035).bolt(deg(264), b, r=0.004, h=0.0035)
        P.append(pl.export())
    return P


# ---------------------------------------------------------------- F. anchor boots


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
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body"]}
        F = rm[Fs]
        cloud = ms["V"][side_v]
        origin = body.L["calf_" + s]
        zc = cloud[:, 2]
        xc = float(np.median(cloud[:, 0]))
        heel = np.array([xc, y0 + 0.05, zc.min() + 0.012])
        toe = np.array([xc, y0 + 0.032, zc.max() - 0.008])
        BM = LimbAdapter(LimbMap(heel, toe, [0, 1.0, 0], cloud, t_range=(-0.15, 1.12), step=0.02, half=0.02, rmax=0.13, facets=12, tsmooth=0.06))
        bax = list(map(float, (toe - heel) / np.linalg.norm(toe - heel)))
        pb = {**pol, "joints": ["foot", "ball"]}
        # boot body: a smooth closed loft over the shoe's convex sections (the
        # shoe shell itself has laces and folds that decimate into holes)
        P.append(Plate(it, f"boot_{s}", m["under"], BM, D([(-179.5, -0.12), (179.5, -0.12), (179.5, 1.09), (-179.5, 1.09)]), 0.004, thickness=0.0025,
                       bevel=0.0, segs=0, res=0.012, weights=pb).export())
        # forefoot and midfoot shell; the heel and ankle have their own pieces,
        # so nothing folds over the shoe's ankle opening
        pl = Plate(it, f"upper_{s}", m["plate"], BM, D([(-116, 0.26), (116, 0.26), (120, 0.86), (92, 1.04), (-92, 1.04), (-120, 0.86)]), 0.007,
                   thickness=0.007, bevel=0.0026, res=0.012, weights=pb, weight_mode=["band", bax, 0.05], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-104, 0.36), (-104, 0.66)]), width=0.0034).groove(D([(104, 0.36), (104, 0.66)]), width=0.0034)
        P.append(pl.export())
        # wide angled instep strap with a buckle
        pl = Plate(it, f"instep_{s}", m["trim"], BM, D([(-100, 0.45), (100, 0.37), (100, 0.44), (-100, 0.52)]), 0.0135, dome=0.0015,
                   thickness=0.004, bevel=0.0014, res=0.008, weights=pb, weight_mode=["band", bax, 0.05])
        P.append(pl.export())
        bp0, bp1 = BM.point(deg(72 * sg), 0.4, 0.019), BM.point(deg(72 * sg), 0.48, 0.019)
        P.append(bar(it, f"instep_buckle_{s}", m["metal"], [(bp0, bp1, BM.normal(deg(72 * sg), 0.44, 0.019), 0.016, 0.004)], weights=pb, weight_mode=["rigid"]))
        # armoured toe cap with a glowing bumper strip wrapping its lower perimeter
        tc = [(-104, 0.74), (104, 0.74), (100, 0.94), (64, 1.07), (-64, 1.07), (-100, 0.94)]
        pl = Plate(it, f"toe_cap_{s}", m["plate"], BM, D(tc), 0.0145, dome=0.002,
                   thickness=0.008, bevel=0.0028, res=0.008, weights={**pol, "joints": ["ball", "foot"]}, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.trace(0.0065, chain=(1, 0), width=0.0046, n_per=10)
        P.append(pl.export())
        # high ankle collar tucked under the greaves
        ca = body.L["calf_" + s]
        ft = body.L["foot_" + s]
        ins = surfaces_mask(body, ("body", "shell_shoes"))
        mc = body.P[(joint_weight(body, ["calf", "foot"], s) > 0.45) & ins & (body.P[:, 1] > ft[1] - 0.025)]
        CM = LimbAdapter(LimbMap(ca, ft, fwd, mc, t_range=(0.5, 1.15), half=0.015, rmax=0.085, facets=12, tsmooth=0.05))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        # heel counter: wraps the back of the heel on a vertical map through
        # the ankle (the heel-to-toe map cannot describe the heel's rear cap),
        # with vertical accent lines
        hc = np.concatenate([cloud[cloud[:, 2] < float(np.median(cloud[:, 2]))], mc])
        HM = LimbAdapter(LimbMap(ca, ft, fwd, hc, t_range=(0.7, 1.3), half=0.012, rmax=0.13, facets=12, tsmooth=0.05))
        t_sole = float((ca[1] - (y0 + 0.034)) / (ca[1] - ft[1]))
        pl = Plate(it, f"heel_{s}", m["plate"], HM, D([(118, 1.0), (242, 1.0), (246, t_sole), (114, t_sole)]), 0.011, dome=0.003, thickness=0.008,
                   bevel=0.0026, res=0.008, weights=pb, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        for a in (152, 208):
            pl.groove(D([(a, 1.03), (a, t_sole - 0.03)]), width=0.0034, n_per=6)
        pl.bolt(deg(180), (1.0 + t_sole) / 2, r=0.0035)
        P.append(pl.export())
        pl = Plate(it, f"cuff_{s}", m["plate"], CM, D([(-179, 0.76), (179, 0.76), (179, 1.03), (-179, 1.03)]), 0.011, lip0=0.005, thickness=0.008, bevel=0.003,
                   weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-150, 0.82), (150, 0.82)]), width=0.0032, inlay=False, n_per=40)
        P.append(pl.export())
        # 4 cm deeply lugged outsole with a recessed heel block (built in Blender)
        hp = cloud[cloud[:, 1] < y0 + 0.02][:, [0, 2]]
        hull = hp[ConvexHull(hp).vertices]
        c = hull.mean(0)
        hull = c + (hull - c) * 1.07
        zs = hull[:, 1]
        P.append(sheet_piece(it, f"sole_{s}", m["sole"], np.zeros((0, 3)), np.zeros((0, 3), int), 0.0, weights=pol, weight_mode=["rigid"],
                             sole={"outline": hull.tolist(), "y0": float(y0 - 0.004), "y1": float(y0 + 0.036), "lug_depth": 0.011, "lugs": 9,
                                   "arch": [float(zs.min() + 0.3 * (zs.max() - zs.min())), float(zs.min() + 0.52 * (zs.max() - zs.min())), 0.012],
                                   "channel_front": float(zs.min() + 0.55 * (zs.max() - zs.min()))},
                             bevel=0.003, bevel_segments=2))
    return P


DESIGNS = {"cinderlock_chest": design_cuirass, "cinderlock_arms": design_arms, "cinderlock_gloves": design_gauntlets,
           "cinderlock_legs": design_legs, "cinderlock_greaves": design_greaves, "cinderlock_boots": design_boots}
ad.DESIGNS.update(DESIGNS)
