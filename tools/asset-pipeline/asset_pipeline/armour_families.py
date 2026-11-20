"""The three other rare class armour families, on the Cinderlock route
(owner specification, 2026-11-20). Cinderlock (armour_cinderlock.py) is the
production benchmark; these share its maps, plates, grooves and bakes, and
add swept tubes, straps, boxes, gems and a translucent layer
(armour_parts.py) for what makes each family its own:

* Vesperglass Array (Aegis Keeper): precision porcelain shells on titanium
  frames, protected optical assemblies (faceted prisms, lens rings),
  layered translucent resonance panels, ice-blue lines. Architectural,
  symmetric, tall faceted collar, rounded shoulder shells.
* Strataweave Fieldkit (Brine Surveyor): woven basalt field textile,
  weathered ochre plates with hazard bands, webbing straps and buckles,
  pouches, an instrument housing with a small amber display, a canister,
  lug soles. Practical; almost nothing glows.
* Mycelial Accord (Symbiotech Conductor): cultivated ivory carapace over
  living green tissue, jade membranes, ivory tendrils grown around the
  limbs, branching bioluminescent capillaries from a seed node.
  Asymmetric, lighter, flowing.

All placement is in the same parameter spaces as Cinderlock: TorsoMap
(theta, u) over the torso, limb maps (phi, t) along bones."""
from __future__ import annotations

import numpy as np

from . import armour_design as ad
from .armour_cinderlock import (SIDES, D, LimbAdapter, LimbMap, Plate, TorsoMap, deg, hand_dorsal_dir, joint_weight,
                                mirror_poly, sheet_piece, slats)
from .armour_parts import disc, fx_strip, gem, oriented_box, parts_piece, ring, strap, tube


# ---------------------------------------------------------------- shared maps


class Kit:
    """Per-body maps shared by every family's pieces (built lazily)."""

    def __init__(self, body):
        self.b = body
        self._c = {}

    def _get(self, key, fn):
        if key not in self._c:
            self._c[key] = fn()
        return self._c[key]

    def torso(self, facets=0):
        return self._get(("torso", facets), lambda: TorsoMap(self.b, facets=facets))

    def neck(self, facets=14):
        b = self.b

        def mk():
            nk = b.L["neck_01"]
            cloud = np.concatenate([b.meshes["body"]["V"], b.meshes["head"]["V"]])
            cloud = cloud[(np.abs(cloud[:, 0]) < 0.1) & (cloud[:, 1] > nk[1] - 0.12) & (cloud[:, 1] < nk[1] + 0.12)]
            return LimbAdapter(LimbMap(np.array([0, nk[1] - 0.055, nk[2]]), np.array([0, nk[1] + 0.065, nk[2]]), [0, 0, 1.0], cloud,
                                       t_range=(-0.2, 1.3), half=0.01, rmax=0.12, facets=facets))
        return self._get(("neck", facets), mk)

    def shoulder(self, s, facets=12):
        b = self.b
        sg = 1.0 if s == "l" else -1.0

        def mk():
            sel = ~b.head & (np.abs(b.P[:, 0]) > 0.1) & (np.sign(b.P[:, 0]) == sg)
            return LimbAdapter(LimbMap(b.L["upperarm_" + s], b.L["lowerarm_" + s], [0, 1.0, 0], b.P[sel], t_range=(-0.5, 1.1), half=0.012,
                                       rmax=0.13, facets=facets, tsmooth=0.03))
        return self._get(("shoulder", s, facets), mk)

    def forearm(self, s, facets=14):
        b = self.b

        def mk():
            Dn = hand_dorsal_dir(b, s)
            on_skin = np.isin(b.src, [b.surfaces.index(x) for x in ("body", "hands") if x in b.surfaces])
            fa = b.P[(joint_weight(b, ["lowerarm"], s) > 0.5) & on_skin]
            return LimbAdapter(LimbMap(b.L["lowerarm_" + s], b.L["hand_" + s], Dn, fa, t_range=(-0.1, 1.15), half=0.014, rmax=0.075,
                                       facets=facets, tsmooth=0.04))
        return self._get(("forearm", s, facets), mk)

    def hand_cloud(self, s, names):
        hm = self.b.meshes["hands"]
        sg = 1.0 if s == "l" else -1.0
        side_v = np.sign(hm["V"][:, 0]) == sg
        c = [i for i, n in enumerate(self.b.joints) if n in names]
        w = (np.isin(hm["J"], c) * hm["W"]).sum(1)
        return hm["V"][side_v & (w > 0.5)]

    def hand(self, s, facets=8):
        b = self.b
        return self._get(("hand", s, facets), lambda: LimbAdapter(LimbMap(b.L["hand_" + s], b.L[f"middle_01_{s}"], hand_dorsal_dir(b, s),
                                                                          self.hand_cloud(s, [f"hand_{s}"]), t_range=(-0.2, 1.25), half=0.01,
                                                                          rmax=0.08, facets=facets)))

    def finger(self, s, fng, seg, nxt, facets=6):
        b = self.b
        a, c = b.L.get(f"{fng}_{seg}_{s}"), b.L.get(f"{fng}_{nxt}_{s}")
        cl = self.hand_cloud(s, [f"{fng}_{seg}_{s}"])
        if a is None or c is None or len(cl) < 20:
            return None
        ref = hand_dorsal_dir(b, s)
        if fng == "thumb":
            hand_axis = b.L[f"middle_01_{s}"] - b.L["hand_" + s]
            r = np.cross(c - a, hand_axis)
            ref = r * np.sign(r @ ref) if np.linalg.norm(r) > 1e-6 else ref
        return LimbAdapter(LimbMap(a, c, ref, cl, t_range=(-0.3, 1.3), step=0.05, half=0.006, rmax=0.03, facets=facets))

    def glove_liner(self, it, mat, s, lift=0.0026, thickness=0.0018):
        hm = self.b.meshes["hands"]
        sg = 1.0 if s == "l" else -1.0
        side_v = np.sign(hm["V"][:, 0]) == sg
        Fh = hm["F"][side_v[hm["F"]].all(1)]
        used = np.unique(Fh)
        rm = -np.ones(len(hm["V"]), int)
        rm[used] = np.arange(len(used))
        F = rm[Fh]
        return sheet_piece(it, f"glove_{s}", mat, ad.relax(hm["V"][used] + hm["N"][used] * lift, F, 2, 0.3), F, thickness,
                           weights={"joints": ["lowerarm", "hand", "index", "middle", "ring", "pinky", "thumb"], "side": s,
                                    "surfaces": ["hands", "body", "shell_forearms"]})

    def leg_surfaces(self, s):
        b = self.b
        surf = ["body", "shell_thighs", "shell_shins", "shell_shorts"]
        ins = np.isin(b.src, [b.surfaces.index(x) for x in surf if x in b.surfaces])
        return surf, ins

    def thigh(self, s, facets=12):
        b = self.b

        def mk():
            _, ins = self.leg_surfaces(s)
            mt = b.P[(joint_weight(b, ["thigh"], s) > 0.45) & ins]
            return LimbAdapter(LimbMap(b.L["thigh_" + s], b.L["calf_" + s], [0, 0, 1.0], mt, t_range=(-0.1, 1.15), facets=facets, tsmooth=0.04))
        return self._get(("thigh", s, facets), mk)

    def calf(self, s, facets=12):
        b = self.b

        def mk():
            _, ins = self.leg_surfaces(s)
            mc = b.P[(joint_weight(b, ["calf"], s) > 0.45) & ins]
            return LimbAdapter(LimbMap(b.L["calf_" + s], b.L["foot_" + s], [0, 0, 1.0], mc, t_range=(-0.25, 1.1), facets=facets, tsmooth=0.04))
        return self._get(("calf", s, facets), mk)

    def knee(self, s, facets=10):
        b = self.b

        def mk():
            _, ins = self.leg_surfaces(s)
            mt = b.P[(joint_weight(b, ["thigh"], s) > 0.45) & ins]
            mc = b.P[(joint_weight(b, ["calf"], s) > 0.45) & ins]
            ca, ft = b.L["calf_" + s], b.L["foot_" + s]
            return LimbAdapter(LimbMap(ca - (ft - ca) * 0.16, ca + (ft - ca) * 0.16, [0, 0, 1.0], np.concatenate([mt, mc]), t_range=(-0.3, 1.3),
                                       half=0.012, facets=facets))
        return self._get(("knee", s, facets), mk)

    def foot(self, s):
        """(BM heel->toe map over the shoe shell, cuff map, shoe cloud, y0)."""
        b = self.b

        def mk():
            ms = b.meshes["shell_shoes"]
            sg = 1.0 if s == "l" else -1.0
            y0 = ms["V"][:, 1].min()
            cloud = ms["V"][np.sign(ms["V"][:, 0]) == sg]
            zc = cloud[:, 2]
            xc = float(np.median(cloud[:, 0]))
            heel = np.array([xc, y0 + 0.05, zc.min() + 0.012])
            toe = np.array([xc, y0 + 0.032, zc.max() - 0.008])
            BM = LimbAdapter(LimbMap(heel, toe, [0, 1.0, 0], cloud, t_range=(-0.15, 1.12), step=0.02, half=0.02, rmax=0.13, facets=12, tsmooth=0.06))
            ca, ft = b.L["calf_" + s], b.L["foot_" + s]
            ins = np.isin(b.src, [b.surfaces.index(x) for x in ("body", "shell_shins", "shell_shoes") if x in b.surfaces])
            mc = b.P[(joint_weight(b, ["calf", "foot"], s) > 0.45) & ins & (b.P[:, 1] > ft[1] - 0.025)]
            CM = LimbAdapter(LimbMap(ca, ft, [0, 0, 1.0], mc, t_range=(0.4, 1.15), half=0.015, rmax=0.085, facets=12, tsmooth=0.05))
            return BM, CM, cloud, y0, heel, toe
        return self._get(("foot", s), mk)

    def boot_liner(self, it, mat, s, lift=0.0035):
        ms = self.b.meshes["shell_shoes"]
        sg = 1.0 if s == "l" else -1.0
        side_v = np.sign(ms["V"][:, 0]) == sg
        Fs = ms["F"][side_v[ms["F"]].all(1)]
        used = np.unique(Fs)
        rm = -np.ones(len(ms["V"]), int)
        rm[used] = np.arange(len(used))
        F = rm[Fs]
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        return sheet_piece(it, f"boot_{s}", mat, ad.relax(ms["V"][used] + ms["N"][used] * lift, F, 2, 0.3), F, 0.0025, weights=pol)

    def sole(self, it, mat, s, scale=1.06, y0d=-0.006, y1d=0.022, bevel=0.003, channel=True, treads=7):
        from scipy.spatial import ConvexHull

        _, _, cloud, y0, _, _ = self.foot(s)
        hp = cloud[cloud[:, 1] < y0 + 0.02][:, [0, 2]]
        hull = hp[ConvexHull(hp).vertices]
        c = hull.mean(0)
        hull = c + (hull - c) * scale
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        return sheet_piece(it, f"sole_{s}", mat, np.zeros((0, 3)), np.zeros((0, 3), int), 0.0, weights=pol, weight_mode=["rigid"],
                           sole={"outline": hull.tolist(), "y0": float(y0 + y0d), "y1": float(y0 + y1d), "channel": channel, "treads": treads},
                           bevel=bevel, bevel_segments=2)


def on_map(m, pts_ab, off, samples=6):
    """(a, b) polyline on a map -> dense 3D points and normals."""
    P, N = [], []
    seq = list(pts_ab)
    for (a0, b0), (a1, b1) in zip(seq[:-1], seq[1:]):
        for k in range(samples):
            f = k / samples
            a, b = a0 + (a1 - a0) * f, b0 + (b1 - b0) * f
            P.append(m.point(a, b, off))
            N.append(m.normal(a, b, off))
    P.append(m.point(*seq[-1], off))
    N.append(m.normal(*seq[-1], off))
    return np.array(P), np.array(N)


def organic(poly, per=5):
    """Closed Catmull-Rom through a convex polygon's corners: a grown,
    rounded outline (still convex enough for the plate sampler)."""
    P = np.asarray(poly, float)
    n = len(P)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return [tuple(q) for q in out]


def glassy(piece):
    piece["layer"] = "glass"
    return piece


def limb_pol(s, joints, surfaces=("body",)):
    return {"joints": list(joints), "side": s, "surfaces": list(surfaces)}


# ================================================================ VESPERGLASS


def vesperglass_chest(body, base, m, kit=None):
    it = "keeper_field_set_chest"
    kit = kit or Kit(body)
    T = kit.torso(facets=20)
    core = T.point(0.0, 0.72, base + 0.03)
    P = [ad.vest_body(body, it, m["under"], base - 0.002, hem_u=0.03, neck_front=0.92, neck_back=0.95, arm_u=0.76, top_u=0.98)]
    pls = []

    def plate(name, poly, layer, mat="plate", **kw):
        kw.setdefault("flow_origin", core)
        kw.setdefault("bevel", 0.003)
        kw.setdefault("segs", 2)
        pl = Plate(it, name, m[mat], T, D(poly), base + layer, **kw)
        pls.append(pl)
        return pl

    for s, sg in SIDES:
        f = lambda a: sg * a
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        # large porcelain chest shell: one sweeping plate per side, cut back
        # around the central optical frame
        pl = plate(f"chest_shell_{s}", side([(22, 0.5), (52, 0.46), (72, 0.58), (70, 0.8), (54, 0.93), (24, 0.95), (17, 0.86), (24, 0.72)]),
                   0.013, dome=0.006, thickness=0.009)
        pl.groove(D([(f(26), 0.88), (f(50), 0.86), (f(64), 0.74)]), width=0.0032)
        pl.groove(D([(f(28), 0.56), (f(52), 0.52), (f(66), 0.6)]), width=0.0032)
        # titanium rib frame under the shell, on the flank
        pl = plate(f"rib_frame_{s}", side([(48, 0.24), (86, 0.26), (96, 0.42), (92, 0.6), (74, 0.57), (54, 0.44)]), 0.008, mat="trim",
                   dome=0.002, thickness=0.006, bevel=0.0022, segs=1)
        pl.groove(D([(f(58), 0.32), (f(86), 0.36)]), width=0.003).groove(D([(f(62), 0.4), (f(88), 0.48)]), width=0.003)
        # translucent resonance panel layered over the flank frame
        P.append(glassy(Plate(it, f"flank_prism_{s}", m["glass"], T, D(side([(60, 0.3), (82, 0.33), (88, 0.47), (70, 0.48)])), base + 0.015,
                              thickness=0.003, bevel=0.0008).export()))
        # porcelain abdominal segments, narrow and stepped
        for r, (u0, u1) in enumerate(((0.38, 0.45), (0.29, 0.36), (0.2, 0.27))):
            plate(f"abdomen_{s}{r}", side([(5, u0), (26 - r * 2, u0), (31 - r * 2, (u0 + u1) / 2), (26 - r * 2, u1), (5, u1)]), 0.011 + 0.001 * r,
                  dome=0.003, thickness=0.007)
        # back: porcelain shoulder blades and a titanium spine frame
        scap = [(180 - a, b) for a, b in [(10, 0.56), (44, 0.52), (64, 0.62), (62, 0.84), (40, 0.95), (12, 0.93)]][::-1]
        pl = plate(f"back_shell_{s}", scap if sg > 0 else mirror_poly(scap, 180), 0.013, dome=0.006, thickness=0.009)
        pl.groove(D([(180 - f(16), 0.88), (180 - f(46), 0.84), (180 - f(58), 0.7)]), width=0.0032)
        low = [(180 - a, b) for a, b in [(8, 0.2), (40, 0.2), (46, 0.34), (40, 0.48), (8, 0.48)]][::-1]
        plate(f"back_low_{s}", low if sg > 0 else mirror_poly(low, 180), 0.011, dome=0.003, thickness=0.008)
        # hip shells
        plate(f"hip_{s}", side([(30, 0.05), (70, 0.08), (76, 0.2), (36, 0.19)]), 0.012, dome=0.003, thickness=0.007)
    # central optical assembly: titanium frame, recessed well, faceted prism
    pl = plate("optic_frame", [(-17, 0.5), (17, 0.5), (24, 0.69), (17, 0.88), (-17, 0.88), (-24, 0.69)], 0.016, mat="trim", dome=0.004,
               thickness=0.011, bevel=0.0028)
    pl.hole(D([(-10, 0.58), (10, 0.58), (14, 0.69), (10, 0.8), (-10, 0.8), (-14, 0.69)]))
    pl.groove(D([(-14, 0.54), (14, 0.54), (20, 0.69), (14, 0.84), (-14, 0.84), (-20, 0.69)]), closed=True, width=0.0034)
    for a, b in ((-20, 0.6), (20, 0.6), (-20, 0.78), (20, 0.78)):
        pl.bolt(deg(a), b, r=0.0026)
    P.append(Plate(it, "optic_well", m["vent"], T, D([(-12, 0.57), (12, 0.57), (15, 0.69), (12, 0.81), (-12, 0.81), (-15, 0.69)]), base + 0.007,
                   thickness=0.004, bevel=0.0008).export())
    c, n = T.point(0.0, 0.69, base + 0.01), T.normal(0.0, 0.69, base + 0.01)
    P.append(glassy(parts_piece(it, "optic_prism", m["glass"], [gem(c, n, [0, 1.0, 0], 0.07, 0.085, 0.034, sides=6)], bevel=0.0)))
    # ice-blue lines radiating from the optic to the shoulders and down the abdomen
    pl = plate("sternum_spine", [(-4, 0.06), (4, 0.06), (4, 0.49), (-4, 0.49)], 0.01, mat="trim", keel=0.003, thickness=0.008)
    pl.groove(D([(0, 0.1), (0, 0.47)]), width=0.003)
    pl = plate("spine", [(175, 0.18), (185, 0.18), (186, 0.94), (174, 0.94)], 0.012, mat="trim", keel=0.004, thickness=0.009)
    pl.groove(D([(180, 0.22), (180, 0.9)]), width=0.003)
    # tall faceted collar: three stepped porcelain rings, open at the throat
    NM = kit.neck(facets=10)
    for k, (t0, t1, op, lay) in enumerate(((-0.05, 0.38, 20, 0.05), (0.4, 0.82, 24, 0.034), (0.84, 1.22, 30, 0.022))):
        pc = Plate(it, f"collar_{k}", m["plate" if k != 1 else "trim"], NM, D([(op, t0), (360 - op, t0), (360 - op, t1), (op, t1)]), lay,
                   dome=0.003, thickness=0.008, bevel=0.0026, segs=2, weight_mode=["band", "y", 0.03], flow_origin=core)
        if k == 1:
            pc.groove(D([(op + 10, (t0 + t1) / 2), (360 - op - 10, (t0 + t1) / 2)]), width=0.003)
        pls.append(pc)
    # rounded shoulder shells with a titanium rim band and a prism inset
    for s, sg in SIDES:
        YM = kit.shoulder(s, facets=0)
        pc = Plate(it, f"pauldron_{s}", m["plate"], YM, D([(-120, -0.34), (120, -0.34), (128, 0.05), (112, 0.36), (-112, 0.36), (-128, 0.05)]),
                   base + 0.028, dome=0.012, thickness=0.01, bevel=0.0035, segs=2, weight_mode=["band", "x", 0.03], flow_origin=core)
        pc.groove(D([(-100, 0.24), (0, 0.3), (100, 0.24)]), width=0.0032)
        pls.append(pc)
        pc = Plate(it, f"pauldron_rim_{s}", m["trim"], YM, D([(-110, 0.32), (110, 0.32), (104, 0.48), (-104, 0.48)]), base + 0.032, dome=0.004,
                   thickness=0.007, bevel=0.0022, weight_mode=["band", "x", 0.03], flow_origin=core)
        pls.append(pc)
        P.append(glassy(Plate(it, f"pauldron_prism_{s}", m["glass"], YM, D([(-26, -0.16), (26, -0.16), (34, 0.04), (0, 0.16), (-34, 0.04)]),
                              base + 0.044, thickness=0.003, bevel=0.0008, weight_mode=["band", "x", 0.03]).export()))
    return P + [pl.export() for pl in pls]


def vesperglass_gloves(body, base, m, kit=None):
    it = "keeper_field_set_gloves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        pol = lambda joints: limb_pol(s, joints, ("hands", "body", "shell_forearms"))
        origin = body.L["lowerarm_" + s]
        P.append(kit.glove_liner(it, m["under"], s))
        VM = kit.forearm(s, facets=10)
        ax = body.L["hand_" + s] - body.L["lowerarm_" + s]
        ax = list(map(float, ax / np.linalg.norm(ax)))
        wm = ["band", ax, 0.05]
        # porcelain vambrace: dorsal and ventral shells leaving a channel at each side
        for nm, poly in (("vambrace_top", [(-62, 0.12), (62, 0.12), (70, 0.5), (60, 0.96), (-60, 0.96), (-70, 0.5)]),
                         ("vambrace_under", [(118, 0.16), (242, 0.16), (236, 0.9), (124, 0.9)])):
            pl = Plate(it, f"{nm}_{s}", m["plate"], VM, D(poly), 0.008, dome=0.004, thickness=0.007, bevel=0.0026, segs=2,
                       weights=pol(["lowerarm", "hand"]), weight_mode=wm, flow_origin=origin, flow_scale=0.6)
            P.append(pl)
        top = P[-2]
        top.hole(D([(-30, 0.22), (30, 0.22), (34, 0.55), (0, 0.84), (-34, 0.55)]))  # window for the prism panel
        top.groove(D([(-40, 0.18), (40, 0.18), (46, 0.55), (0, 0.9), (-46, 0.55)]), closed=True, width=0.003)
        P[-2], P[-1] = top.export(), P[-1].export()
        # titanium side rails with ice-blue lines
        for k, (a0, a1) in enumerate(((72, 116), (-116, -72))):
            pl = Plate(it, f"vambrace_rail{k}_{s}", m["trim"], VM, D([(a0, 0.1), (a1, 0.1), (a1, 0.94), (a0, 0.94)]), 0.006, thickness=0.006,
                       bevel=0.0018, weights=pol(["lowerarm", "hand"]), weight_mode=wm, flow_origin=origin, flow_scale=0.6)
            pl.groove(D([((a0 + a1) / 2, 0.14), ((a0 + a1) / 2, 0.9)]), width=0.0026)
            P.append(pl.export())
        P.append(glassy(Plate(it, f"vambrace_prism_{s}", m["glass"], VM, D([(-32, 0.2), (32, 0.2), (36, 0.55), (0, 0.86), (-36, 0.55)]), 0.0115,
                              thickness=0.003, bevel=0.0008, weights=pol(["lowerarm"]), weight_mode=wm).export()))
        # wrist projection lens: titanium bezel ring and a lens on the back of the wrist
        c, n = VM.point(0.0, 1.0, 0.012), VM.normal(0.0, 1.0, 0.012)
        P.append(parts_piece(it, f"lens_ring_{s}", m["trim"], [ring(c, n, 0.022, 0.015, 0.006, sides=20)], weights=pol(["hand"]), weight_mode=["rigid"]))
        P.append(glassy(parts_piece(it, f"lens_{s}", m["glass"], [disc(c + n * 0.002, n, 0.0155, 0.006, sides=20)], weights=pol(["hand"]),
                                    weight_mode=["rigid"], bevel=0.0)))
        HM = kit.hand(s)
        pl = Plate(it, f"hand_shell_{s}", m["plate"], HM, D([(-58, 0.1), (58, 0.1), (66, 0.55), (52, 0.92), (-52, 0.92), (-66, 0.55)]), 0.006,
                   dome=0.004, thickness=0.006, bevel=0.002, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(0, 0.16), (0, 0.86)]), width=0.0028)
        P.append(pl.export())
        for fng in ("index", "middle", "ring", "pinky", "thumb"):
            segs = (("02", "03"), ("03", "04_leaf")) if fng == "thumb" else (("01", "02"), ("02", "03"), ("03", "04_leaf"))
            for seg, nxt in segs:
                FM = kit.finger(s, fng, seg, nxt)
                if FM is None:
                    continue
                t1 = 0.78 if seg != "03" else 0.72
                P.append(Plate(it, f"finger_{fng}{seg}_{s}", m["trim" if seg == "01" else "plate"], FM, D([(-72, 0.06), (72, 0.06), (72, t1), (-72, t1)]),
                               0.0032, dome=0.0016, thickness=0.0026, bevel=0.0009, res=0.005, weights=pol([f"{fng}_{seg}"]),
                               weight_mode=["rigid"]).export())
    return P


def vesperglass_greaves(body, base, m, kit=None):
    it = "keeper_field_set_greaves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        surf, _ = kit.leg_surfaces(s)
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        TM, CM, KM = kit.thigh(s), kit.calf(s), kit.knee(s)
        tax = list(map(float, (ca - th) / np.linalg.norm(ca - th)))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        pt = limb_pol(s, ["thigh", "calf"], surf)
        pc = limb_pol(s, ["calf", "thigh", "foot"], surf)
        for nm, M, t0, t1, pol in (("legging_thigh", TM, 0.06, 1.0, pt), ("legging_calf", CM, -0.02, 0.95, pc)):
            P.append(Plate(it, f"{nm}_{s}", m["under"], M, D([(-179.5, t0), (179.5, t0), (179.5, t1), (-179.5, t1)]), 0.004, thickness=0.003,
                           bevel=0.0, segs=0, res=0.012, weights=pol).export())
        # tall porcelain thigh shell, diamond window with a prism panel
        pl = Plate(it, f"thigh_shell_{s}", m["plate"], TM, D([(-46, 0.16), (46, 0.16), (62, 0.46), (50, 0.84), (0, 0.94), (-50, 0.84), (-62, 0.46)]),
                   0.011, dome=0.003, thickness=0.008, bevel=0.003, segs=2, weights=pt, weight_mode=["band", tax, 0.06], flow_origin=th, flow_scale=1.0)
        pl.hole(D([(0, 0.26), (22, 0.5), (0, 0.76), (-22, 0.5)]))
        pl.groove(D([(0, 0.2), (31, 0.5), (0, 0.82), (-31, 0.5)]), closed=True, width=0.003)
        P.append(pl.export())
        P.append(glassy(Plate(it, f"thigh_prism_{s}", m["glass"], TM, D([(0, 0.23), (25, 0.5), (0, 0.79), (-25, 0.5)]), 0.0135, thickness=0.003,
                              bevel=0.0008, weights=pt, weight_mode=["band", tax, 0.06]).export()))
        # titanium side frame
        sidep = lambda poly: poly if -sg > 0 else mirror_poly(poly)
        pl = Plate(it, f"thigh_frame_{s}", m["trim"], TM, D(sidep([(66, 0.2), (112, 0.22), (112, 0.8), (66, 0.84)])), 0.008, thickness=0.006,
                   bevel=0.0022, weights=pt, weight_mode=["band", tax, 0.06], flow_origin=th, flow_scale=1.0)
        pl.groove(D(sidep([(89, 0.26), (89, 0.78)])), width=0.0028)
        P.append(pl.export())
        # titanium diamond knee cop with an ice-blue ring line
        pl = Plate(it, f"knee_{s}", m["trim"], KM, D([(0, -0.05), (62, 0.5), (0, 1.05), (-62, 0.5)]), 0.024, dome=0.008, keel=0.004, thickness=0.01,
                   bevel=0.003, weights=limb_pol(s, ["calf", "thigh"], surf), weight_mode=["rigid"], flow_origin=th, flow_scale=1.0)
        pl.groove(D([(0, 0.15), (40, 0.5), (0, 0.85), (-40, 0.5)]), closed=True, width=0.003)
        P.append(pl.export())
        c, n = KM.point(0.0, 0.5, 0.036), KM.normal(0.0, 0.5, 0.036)
        P.append(glassy(parts_piece(it, f"knee_gem_{s}", m["glass"], [gem(c, n, list(cax), 0.022, 0.03, 0.014, sides=4)], weights=limb_pol(s, ["calf"], surf),
                                    weight_mode=["rigid"], bevel=0.0)))
        # porcelain shin shell with a long prism strip
        pl = Plate(it, f"shin_{s}", m["plate"], CM, D([(-80, 0.12), (80, 0.12), (86, 0.5), (70, 0.92), (-70, 0.92), (-86, 0.5)]), 0.013, dome=0.005,
                   keel=0.004, thickness=0.009, bevel=0.003, segs=2, weights=pc, weight_mode=["band", cax, 0.06], flow_origin=th, flow_scale=1.0)
        pl.hole(D([(-12, 0.2), (12, 0.2), (12, 0.78), (-12, 0.78)]))
        pl.groove(D([(-20, 0.16), (20, 0.16), (20, 0.84), (-20, 0.84)]), closed=True, width=0.003)
        P.append(pl.export())
        P.append(glassy(Plate(it, f"shin_prism_{s}", m["glass"], CM, D([(-14, 0.18), (14, 0.18), (14, 0.8), (-14, 0.8)]), 0.0155, thickness=0.003,
                              bevel=0.0008, weights=pc, weight_mode=["band", cax, 0.06]).export()))
        P.append(Plate(it, f"calf_shell_{s}", m["plate"], CM, D(sidep([(110, 0.14), (250, 0.14), (250, 0.7), (110, 0.7)])), 0.011, dome=0.005,
                       thickness=0.008, bevel=0.0026, weights=pc, weight_mode=["band", cax, 0.06]).export())
    return P


def vesperglass_boots(body, base, m, kit=None):
    it = "keeper_field_set_boots"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        BM, CM, cloud, y0, heel, toe = kit.foot(s)
        origin = body.L["calf_" + s]
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        pb = {**pol, "joints": ["foot", "ball"]}
        bax = list(map(float, (toe - heel) / np.linalg.norm(toe - heel)))
        cax = list(map(float, (body.L["foot_" + s] - body.L["calf_" + s]) / np.linalg.norm(body.L["foot_" + s] - body.L["calf_" + s])))
        P.append(kit.boot_liner(it, m["under"], s))
        pl = Plate(it, f"upper_{s}", m["plate"], BM, D([(-150, -0.02), (150, -0.02), (150, 0.86), (96, 1.05), (-96, 1.05), (-150, 0.86)]), 0.006,
                   thickness=0.007, bevel=0.003, segs=2, res=0.011, weights=pb, weight_mode=["band", bax, 0.05], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-118, 0.06), (-118, 0.84), (-80, 1.0)]), width=0.003).groove(D([(118, 0.06), (118, 0.84), (80, 1.0)]), width=0.003)
        P.append(pl.export())
        # titanium instep strap plate and a prism strip down the instep
        pl = Plate(it, f"instep_{s}", m["trim"], BM, D([(-62, 0.34), (62, 0.34), (66, 0.5), (-66, 0.5)]), 0.0145, dome=0.003, thickness=0.007,
                   bevel=0.0022, res=0.008, weights=pb, weight_mode=["rigid"], flow_origin=origin, flow_scale=0.6)
        pl.bolt(deg(-50), 0.42, r=0.0028).bolt(deg(50), 0.42, r=0.0028)
        P.append(pl.export())
        P.append(glassy(Plate(it, f"instep_prism_{s}", m["glass"], BM, D([(-12, 0.52), (12, 0.52), (10, 0.8), (-10, 0.8)]), 0.0115, thickness=0.003,
                              bevel=0.0008, res=0.006, weights=pb, weight_mode=["rigid"]).export()))
        P.append(Plate(it, f"toe_cap_{s}", m["plate"], BM, D([(-104, 0.8), (104, 0.8), (98, 0.95), (60, 1.07), (-60, 1.07), (-98, 0.95)]), 0.0135,
                       dome=0.003, thickness=0.008, bevel=0.003, segs=2, res=0.008, weights={**pol, "joints": ["ball", "foot"]},
                       weight_mode=["rigid"]).export())
        P.append(Plate(it, f"heel_{s}", m["trim"], BM, D([(-124, -0.05), (124, -0.05), (114, 0.22), (-114, 0.22)]), 0.0135, thickness=0.008,
                       bevel=0.0024, res=0.008, weights=pb, weight_mode=["rigid"]).export())
        # high porcelain cuff with a titanium band and a line
        pl = Plate(it, f"cuff_{s}", m["plate"], CM, D([(-179, 0.62), (179, 0.62), (179, 1.03), (-179, 1.03)]), 0.011, lip0=0.004, thickness=0.008,
                   bevel=0.003, segs=2, weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04], flow_origin=origin, flow_scale=0.6)
        P.append(pl.export())
        pl = Plate(it, f"cuff_band_{s}", m["trim"], CM, D([(-179, 0.82), (179, 0.82), (179, 0.92), (-179, 0.92)]), 0.019, thickness=0.006,
                   bevel=0.0018, weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04], flow_origin=origin, flow_scale=0.6)
        pl.groove(D([(-170, 0.87), (170, 0.87)]), width=0.0028)
        P.append(pl.export())
        P.append(kit.sole(it, m["sole"], s, scale=1.07))
    return P


# ================================================================ STRATAWEAVE


def strataweave_chest(body, base, m, kit=None):
    it = "surveyor_field_set_chest"
    kit = kit or Kit(body)
    T = kit.torso(facets=0)
    core = T.point(0.0, 0.62, base + 0.03)
    P = [ad.vest_body(body, it, m["under"], base - 0.002, hem_u=0.0, neck_front=0.9, neck_back=0.95, arm_u=0.76, top_u=0.98)]
    pls = []

    def plate(name, poly, layer, mat="plate", **kw):
        kw.setdefault("flow_origin", core)
        kw.setdefault("bevel", 0.0022)
        pl = Plate(it, name, m[mat], T, D(poly), base + layer, **kw)
        pls.append(pl)
        return pl

    # padded textile panels (quilted look comes from the weave and grooves)
    for s, sg in SIDES:
        f = lambda a: sg * a
        side = lambda poly: poly if sg > 0 else mirror_poly(poly)
        pl = plate(f"pad_{s}", side([(8, 0.5), (50, 0.47), (66, 0.6), (62, 0.86), (40, 0.95), (10, 0.92)]), 0.006, mat="under", dome=0.006,
                   thickness=0.007, bevel=0.0028)
        for k in range(3):
            pl.groove(D([(f(12), 0.56 + 0.12 * k), (f(56), 0.53 + 0.12 * k)]), width=0.0022, depth=0.0018, inlay=False)
        # segmented ochre plate over the upper chest, hazard paint on the lowest
        for r, (u0, u1) in enumerate(((0.8, 0.92), (0.69, 0.795))):
            pl = plate(f"chest_plate_{s}{r}", side([(14, u0), (48, u0 - 0.02), (56, u1 - 0.01), (16, u1)]), 0.013 + 0.002 * r, mat="plate",
                       dome=0.002, thickness=0.006)
            pl.bolt(deg(f(18)), (u0 + u1) / 2, r=0.0026).bolt(deg(f(50)), (u0 + u1) / 2, r=0.0026)
        # side panels: hazard-banded plate
        pl = plate(f"side_{s}", side([(64, 0.28), (98, 0.3), (100, 0.56), (70, 0.6)]), 0.008, mat="hazard", dome=0.003, thickness=0.006)
        pl.bolt(deg(f(68)), 0.32, r=0.0026).bolt(deg(f(96)), 0.54, r=0.0026)
        # back panels and the pack frame
        bk = [(180 - a, b) for a, b in [(6, 0.32), (52, 0.3), (60, 0.62), (52, 0.92), (8, 0.94)]][::-1]
        plate(f"back_pad_{s}", bk if sg > 0 else mirror_poly(bk, 180), 0.006, mat="under", dome=0.005, thickness=0.007, bevel=0.0028)
    # sternum instrument housing: box with a recessed amber display line
    c, n = T.point(0.0, 0.58, base + 0.012), T.normal(0.0, 0.58, base + 0.012)
    up = T.point(0.0, 0.62, base) - T.point(0.0, 0.54, base)
    P.append(parts_piece(it, "instrument", m["trim"], [oriented_box(c + n * 0.016, (0.075, 0.11, 0.032), n, up / np.linalg.norm(up))], bevel=0.003, segs=2))
    pl = plate("display_bezel", [(-13, 0.55), (13, 0.55), (13, 0.62), (-13, 0.62)], 0.044, mat="vent", thickness=0.004, bevel=0.0012)
    pl.groove(D([(-9, 0.585), (9, 0.585)]), width=0.0055, depth=0.0022)
    pl.groove(D([(-9, 0.567), (2, 0.567)]), width=0.0028, depth=0.0018)
    # cross harness: two webbing straps over the shoulders to the belt,
    # buckles where they cross the chest plates
    straps = []
    for s, sg in SIDES:
        straps.append(strap(T, [(sg * 34, 0.99), (sg * 30, 0.8), (sg * 18, 0.6), (sg * 8, 0.36), (sg * 6, 0.12)], 0.034, 0.004, base + 0.021))
        straps.append(strap(T, [(180 - sg * 34, 0.99), (180 - sg * 28, 0.7), (180 - sg * 18, 0.4), (180 - sg * 14, 0.12)], 0.034, 0.004, base + 0.012))
    P.append(parts_piece(it, "harness", m["strap"], straps, bevel=0.0008))
    # belt with pouches, a canister and buckles
    belt = [strap(T, [(a, 0.1) for a in np.linspace(-179, 179, 30)], 0.05, 0.005, base + 0.016)]
    P.append(parts_piece(it, "belt", m["strap"], belt, bevel=0.0008))
    boxes = []
    for a, w, h, d in ((-38, 0.07, 0.085, 0.04), (38, 0.06, 0.075, 0.036), (-62, 0.05, 0.08, 0.034), (160, 0.11, 0.09, 0.045)):
        c, n = T.point(deg(a), 0.13, base + 0.022), T.normal(deg(a), 0.13, base + 0.022)
        boxes.append(oriented_box(c + n * d / 2, (h, w, d), n, [0, 1.0, 0]))
    P.append(parts_piece(it, "pouches", m["pouch"], boxes, bevel=0.004, segs=2))
    flaps = []
    for a, w in ((-38, 0.074), (38, 0.064), (-62, 0.054), (160, 0.114)):
        c, n = T.point(deg(a), 0.16, base + 0.022), T.normal(deg(a), 0.16, base + 0.022)
        d = 0.046 if a == 160 else 0.04
        flaps.append(oriented_box(c + n * (d + 0.002) / 2 + np.array([0, 0.012, 0]), (0.04, w, d + 0.004), n, [0, 1.0, 0]))
    P.append(parts_piece(it, "pouch_flaps", m["strap"], flaps, bevel=0.003, segs=1))
    buckles = []
    for a in (-8, 8):
        c, n = T.point(deg(a), 0.1, base + 0.03), T.normal(deg(a), 0.1, base + 0.03)
        buckles.append(oriented_box(c, (0.04, 0.03, 0.008), n, [1.0, 0, 0]))
    for s, sg in SIDES:
        c, n = T.point(deg(sg * 22), 0.66, base + 0.03), T.normal(deg(sg * 22), 0.66, base + 0.03)
        buckles.append(oriented_box(c, (0.036, 0.028, 0.008), n, [0, 1.0, 0]))
    P.append(parts_piece(it, "buckles", m["trim"], buckles, bevel=0.0018, segs=1))
    # survey canister on the left hip
    c, n = T.point(deg(78), 0.2, base + 0.03), T.normal(deg(78), 0.2, base + 0.03)
    can = tube([c + n * 0.03 + np.array([0, -0.07, 0]), c + n * 0.03 + np.array([0, 0.08, 0])], 0.022, sides=14)
    cap = tube([c + n * 0.03 + np.array([0, 0.08, 0]), c + n * 0.03 + np.array([0, 0.1, 0])], 0.018, sides=14)
    P.append(parts_piece(it, "canister", m["trim"], [can, cap], bevel=0.002, segs=1))
    # padded collar
    NM = kit.neck(facets=0)
    pc = Plate(it, "collar", m["under"], NM, D([(14, -0.05), (346, -0.05), (346, 0.62), (14, 0.62)]), 0.026, dome=0.008, thickness=0.012,
               bevel=0.004, segs=2, weight_mode=["band", "y", 0.03], flow_origin=core)
    pc.groove(D([(30, 0.3), (330, 0.3)]), width=0.0022, depth=0.0016, inlay=False)
    pls.append(pc)
    # segmented ochre shoulder plates
    for s, sg in SIDES:
        YM = kit.shoulder(s, facets=0)
        for k, (t0, t1, w) in enumerate(((-0.34, 0.02, 110), (-0.02, 0.22, 104), (0.2, 0.4, 96))):
            pc = Plate(it, f"pauldron{k}_{s}", m["plate" if k != 1 else "hazard"], YM, D([(-w, t0), (w, t0), (w - 6, t1), (-w + 6, t1)]),
                       base + 0.022 + 0.004 * k, dome=0.006, thickness=0.006, bevel=0.0022, weight_mode=["band", "x", 0.03], flow_origin=core)
            pc.bolt(deg(-w + 14), (t0 + t1) / 2, r=0.0026).bolt(deg(w - 14), (t0 + t1) / 2, r=0.0026)
            pls.append(pc)
    return P + [pl.export() for pl in pls]


def strataweave_gloves(body, base, m, kit=None):
    it = "surveyor_field_set_gloves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        pol = lambda joints: limb_pol(s, joints, ("hands", "body", "shell_forearms"))
        origin = body.L["lowerarm_" + s]
        P.append(kit.glove_liner(it, m["under"], s, lift=0.0032, thickness=0.0024))
        VM = kit.forearm(s, facets=0)
        ax = body.L["hand_" + s] - body.L["lowerarm_" + s]
        ax = list(map(float, ax / np.linalg.norm(ax)))
        wm = ["band", ax, 0.05]
        # textile gauntlet cuff, two straps, an ochre forearm guard
        P.append(Plate(it, f"cuff_{s}", m["under"], VM, D([(-179, 0.5), (179, 0.5), (179, 1.02), (-179, 1.02)]), 0.006, thickness=0.004, bevel=0.0016,
                       weights=pol(["lowerarm", "hand"]), weight_mode=wm).export())
        st = [strap(VM, [(a, t) for a in np.linspace(-179, 179, 24)], 0.018, 0.003, 0.0105) for t in (0.62, 0.9)]
        P.append(parts_piece(it, f"cuff_straps_{s}", m["strap"], st, weights=pol(["lowerarm", "hand"]), weight_mode=wm))
        pl = Plate(it, f"forearm_guard_{s}", m["plate"], VM, D([(-50, 0.14), (50, 0.14), (56, 0.5), (-56, 0.5)]), 0.008, dome=0.003, thickness=0.005,
                   bevel=0.0018, weights=pol(["lowerarm"]), weight_mode=wm, flow_origin=origin, flow_scale=0.6)
        pl.bolt(deg(-40), 0.2, r=0.0024).bolt(deg(40), 0.2, r=0.0024).bolt(deg(-44), 0.44, r=0.0024).bolt(deg(44), 0.44, r=0.0024)
        P.append(pl.export())
        # wrist calibration display: a housing with a small amber readout
        c, n = VM.point(0.0, 0.76, 0.014), VM.normal(0.0, 0.76, 0.014)
        P.append(parts_piece(it, f"display_housing_{s}", m["trim"], [oriented_box(c + n * 0.008, (0.05, 0.042, 0.016), n, ax)], weights=pol(["lowerarm", "hand"]),
                             weight_mode=wm, bevel=0.0025, segs=2))
        pl = Plate(it, f"display_{s}", m["vent"], VM, D([(-16, 0.7), (16, 0.7), (16, 0.82), (-16, 0.82)]), 0.0315, thickness=0.002, bevel=0.0008,
                   weights=pol(["lowerarm", "hand"]), weight_mode=wm, flow_origin=c, flow_scale=0.05)
        pl.groove(D([(-11, 0.745), (11, 0.745)]), width=0.0048, depth=0.0014)
        pl.groove(D([(-11, 0.775), (4, 0.775)]), width=0.0024, depth=0.0012)
        P.append(pl.export())
        # back-of-hand plate and knuckle guards (ochre, bolted)
        HM = kit.hand(s, facets=0)
        pl = Plate(it, f"hand_plate_{s}", m["plate"], HM, D([(-58, 0.14), (58, 0.14), (62, 0.62), (-62, 0.62)]), 0.0065, dome=0.003, thickness=0.005,
                   bevel=0.0016, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"])
        pl.bolt(deg(-46), 0.22, r=0.0022).bolt(deg(46), 0.22, r=0.0022)
        P.append(pl.export())
        P.append(Plate(it, f"knuckles_{s}", m["hazard"], HM, D([(-66, 0.74), (66, 0.74), (62, 1.0), (-62, 1.0)]), 0.008, dome=0.003, thickness=0.006,
                       bevel=0.0018, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"]).export())
        for fng in ("index", "middle", "ring", "pinky", "thumb"):
            segs = (("02", "03"),) if fng == "thumb" else (("01", "02"), ("02", "03"))
            for seg, nxt in segs:
                FM = kit.finger(s, fng, seg, nxt, facets=0)
                if FM is None:
                    continue
                P.append(Plate(it, f"finger_{fng}{seg}_{s}", m["trim" if seg == "01" else "pouch"], FM, D([(-60, 0.12), (60, 0.12), (60, 0.7), (-60, 0.7)]),
                               0.0034, dome=0.0012, thickness=0.0022, bevel=0.0008, res=0.005, weights=pol([f"{fng}_{seg}"]),
                               weight_mode=["rigid"]).export())
    return P


def strataweave_greaves(body, base, m, kit=None):
    it = "surveyor_field_set_greaves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        surf, _ = kit.leg_surfaces(s)
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        TM, CM, KM = kit.thigh(s, facets=0), kit.calf(s, facets=0), kit.knee(s, facets=0)
        tax = list(map(float, (ca - th) / np.linalg.norm(ca - th)))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        pt = limb_pol(s, ["thigh", "calf"], surf)
        pc = limb_pol(s, ["calf", "thigh", "foot"], surf)
        sidep = lambda poly: poly if -sg > 0 else mirror_poly(poly)
        for nm, M, t0, t1, pol in (("trouser_thigh", TM, 0.04, 1.0, pt), ("trouser_calf", CM, -0.02, 0.96, pc)):
            pl = Plate(it, f"{nm}_{s}", m["under"], M, D([(-179.5, t0), (179.5, t0), (179.5, t1), (-179.5, t1)]), 0.005, thickness=0.004,
                       bevel=0.0, segs=0, res=0.012, weights=pol)
            P.append(pl.export())
        # ochre thigh plates (front and outer), bolted, with straps around the thigh
        pl = Plate(it, f"thigh_plate_{s}", m["plate"], TM, D([(-56, 0.16), (56, 0.16), (60, 0.62), (-60, 0.62)]), 0.013, dome=0.004, thickness=0.006,
                   bevel=0.002, weights=pt, weight_mode=["band", tax, 0.06])
        for a, t in ((-48, 0.2), (48, 0.2), (-50, 0.58), (50, 0.58)):
            pl.bolt(deg(a), t, r=0.0026)
        P.append(pl.export())
        P.append(Plate(it, f"thigh_side_{s}", m["plate"], TM, D(sidep([(72, 0.2), (132, 0.24), (132, 0.7), (72, 0.74)])), 0.012, dome=0.004,
                       thickness=0.006, bevel=0.002, weights=pt, weight_mode=["band", tax, 0.06]).export())
        st = [strap(TM, [(a, t) for a in np.linspace(-179, 179, 30)], 0.026, 0.004, 0.0215) for t in (0.34, 0.5)]
        P.append(parts_piece(it, f"thigh_straps_{s}", m["strap"], st, weights=pt, weight_mode=["band", tax, 0.06]))
        bk = []
        for t in (0.34, 0.5):
            c, n = TM.point(deg(-sg * 70), t, 0.026), TM.normal(deg(-sg * 70), t, 0.026)
            bk.append(oriented_box(c, (0.03, 0.034, 0.008), n, tax))
        P.append(parts_piece(it, f"thigh_buckles_{s}", m["trim"], bk, weights=pt, weight_mode=["band", tax, 0.06], bevel=0.0016))
        # knee guard with hazard bands
        pl = Plate(it, f"knee_{s}", m["hazard"], KM, D([(-64, 0.0), (64, 0.0), (70, 0.5), (60, 1.0), (-60, 1.0), (-70, 0.5)]), 0.024, dome=0.01,
                   thickness=0.008, bevel=0.0028, segs=2, weights=limb_pol(s, ["calf", "thigh"], surf), weight_mode=["rigid"])
        pl.bolt(deg(-54), 0.5, r=0.003).bolt(deg(54), 0.5, r=0.003)
        P.append(pl.export())
        # shin plates, segmented
        for k, (t0, t1) in enumerate(((0.12, 0.44), (0.47, 0.82))):
            pl = Plate(it, f"shin_{k}_{s}", m["plate"], CM, D([(-74, t0), (74, t0), (70, t1), (-70, t1)]), 0.012, dome=0.004, thickness=0.006,
                       bevel=0.002, weights=pc, weight_mode=["band", cax, 0.06])
            pl.bolt(deg(-62), t0 + 0.04, r=0.0024).bolt(deg(62), t0 + 0.04, r=0.0024)
            P.append(pl.export())
        st = [strap(CM, [(a, t) for a in np.linspace(-179, 179, 26)], 0.024, 0.004, 0.0195) for t in (0.3, 0.7)]
        P.append(parts_piece(it, f"shin_straps_{s}", m["strap"], st, weights=pc, weight_mode=["band", cax, 0.06]))
    return P


def strataweave_boots(body, base, m, kit=None):
    it = "surveyor_field_set_boots"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        BM, CM, cloud, y0, heel, toe = kit.foot(s)
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        pb = {**pol, "joints": ["foot", "ball"]}
        bax = list(map(float, (toe - heel) / np.linalg.norm(toe - heel)))
        cax = list(map(float, (body.L["foot_" + s] - body.L["calf_" + s]) / np.linalg.norm(body.L["foot_" + s] - body.L["calf_" + s])))
        P.append(kit.boot_liner(it, m["under"], s))
        # leather upper and high shaft
        P.append(Plate(it, f"upper_{s}", m["leather"], BM, D([(-152, -0.03), (152, -0.03), (152, 0.86), (96, 1.06), (-96, 1.06), (-152, 0.86)]), 0.007,
                       thickness=0.007, bevel=0.003, segs=2, res=0.011, weights=pb, weight_mode=["band", bax, 0.05]).export())
        P.append(Plate(it, f"shaft_{s}", m["leather"], CM, D([(-179, 0.5), (179, 0.5), (179, 1.03), (-179, 1.03)]), 0.012, lip0=0.004, thickness=0.007,
                       bevel=0.003, segs=2, weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04]).export())
        # ochre toe cap and heel counter (bolted)
        pl = Plate(it, f"toe_cap_{s}", m["plate"], BM, D([(-108, 0.74), (108, 0.74), (100, 0.95), (60, 1.08), (-60, 1.08), (-100, 0.95)]), 0.0145,
                   dome=0.004, thickness=0.006, bevel=0.0026, segs=2, res=0.008, weights={**pol, "joints": ["ball", "foot"]}, weight_mode=["rigid"])
        pl.bolt(deg(-80), 0.82, r=0.0024).bolt(deg(80), 0.82, r=0.0024)
        P.append(pl.export())
        P.append(Plate(it, f"heel_{s}", m["plate"], BM, D([(-126, -0.06), (126, -0.06), (116, 0.2), (-116, 0.2)]), 0.0145, thickness=0.006, bevel=0.0022,
                       res=0.008, weights=pb, weight_mode=["rigid"]).export())
        # three buckled straps across the instep and shaft
        st = [strap(BM, [(a, t) for a in np.linspace(-140, 140, 20)], 0.022, 0.004, 0.0165) for t in (0.4, 0.58)]
        st += [strap(CM, [(a, 0.7) for a in np.linspace(-179, 179, 26)], 0.022, 0.004, 0.0215)]
        P.append(parts_piece(it, f"straps_{s}", m["strap"], st, weights=pb, weight_mode=["band", bax, 0.05]))
        bk = []
        for M, a, t in ((BM, -sg * 110, 0.4), (BM, -sg * 110, 0.58), (CM, -sg * 90, 0.7)):
            c, n = M.point(deg(a), t, 0.022), M.normal(deg(a), t, 0.022)
            bk.append(oriented_box(c, (0.026, 0.03, 0.008), n, [0, 1.0, 0]))
        P.append(parts_piece(it, f"buckles_{s}", m["trim"], bk, weights=pb, weight_mode=["rigid"], bevel=0.0016))
        # beacon pod on the outer ankle with a small amber lens line
        c, n = CM.point(deg(-sg * 90), 0.86, 0.024), CM.normal(deg(-sg * 90), 0.86, 0.024)
        P.append(parts_piece(it, f"beacon_{s}", m["trim"], [oriented_box(c + n * 0.01, (0.05, 0.03, 0.02), n, [0, 1.0, 0])], weights=pb, weight_mode=["rigid"],
                             bevel=0.003, segs=2))
        lens = [c + n * 0.0215 + np.array([0, k * 0.006, 0]) for k in (-1.6, 1.6)]
        P.append({**parts_piece(it, f"beacon_lamp_{s}", m["trim"], [], weights=pb, weight_mode=["rigid"]),
                  "fx_strips": [fx_strip(lens, 0.0035, c, 0.05, sides=6)]})
        # deep lug sole
        P.append(kit.sole(it, m["sole"], s, scale=1.08, y0d=-0.014, y1d=0.02, bevel=0.004, channel=False, treads=11))
    return P


# ================================================================ MYCELIAL


def _branch(T, start, ends, off, rng, depth=2):
    """Capillary tree in torso parameter space: from `start` toward each end,
    wandering, splitting once or twice. Returns list of (a, b) polylines."""
    lines = []
    for e in ends:
        pts = [start]
        a0, b0 = start
        for k in range(1, 9):
            f = k / 8
            a = a0 + (e[0] - a0) * f + rng.normal(0, 3.0)
            b = b0 + (e[1] - b0) * f + rng.normal(0, 0.012)
            pts.append((a, b))
        lines.append(pts)
        if depth > 1:
            mid = pts[4]
            ang = (e[0] - a0) * 0.6
            lines += _branch(T, mid, [(mid[0] + ang + rng.normal(0, 8), mid[1] + (e[1] - b0) * 0.35)], off, rng, depth - 1)
    return lines


def mycelial_chest(body, base, m, kit=None):
    it = "symbiotech_field_set_chest"
    kit = kit or Kit(body)
    T = kit.torso(facets=0)
    rng = np.random.default_rng(11)
    seed_pt = T.point(deg(-10), 0.7, base + 0.012)
    P = [ad.vest_body(body, it, m["under"], base - 0.002, hem_u=0.0, neck_front=0.9, neck_back=0.95, arm_u=0.76, top_u=0.98)]
    pls = []

    def plate(name, poly, layer, mat="plate", **kw):
        kw.setdefault("flow_origin", seed_pt)
        kw.setdefault("bevel", 0.0026)
        kw.setdefault("segs", 2)
        pl = Plate(it, name, m[mat], T, D(organic(poly)), base + layer, **kw)
        pls.append(pl)
        return pl

    # cultivated carapace: organic shells, deliberately unlike either side
    pl = plate("carapace_l", [(8, 0.52), (30, 0.47), (58, 0.55), (72, 0.7), (62, 0.86), (40, 0.95), (14, 0.9), (6, 0.74)], 0.008, dome=0.012, keel=0.002, thickness=0.008)
    # bioluminescent veins grown into the carapace
    pl.groove(D([(14, 0.86), (26, 0.78), (42, 0.74), (58, 0.7)]), width=0.0028, depth=0.0022)
    pl.groove(D([(30, 0.78), (36, 0.66), (46, 0.58)]), width=0.0024, depth=0.0020)
    pl = plate("carapace_r", [(-6, 0.6), (-24, 0.55), (-48, 0.6), (-60, 0.72), (-50, 0.86), (-30, 0.93), (-10, 0.88)], 0.008, dome=0.01, thickness=0.008)
    pl.groove(D([(-12, 0.82), (-28, 0.76), (-44, 0.7)]), width=0.0026, depth=0.0021)
    # rib-like ivory ridges curving round the left flank, membrane between
    ribs = []
    for k, u in enumerate((0.44, 0.35, 0.26)):
        Pp, Nn = on_map(T, D([(4, u + 0.02), (30, u), (66, u + 0.035), (96, u + 0.08)]), base + 0.012, samples=5)
        ribs.append(tube(Pp, np.linspace(0.009, 0.005, len(Pp)), sides=8, normals=Nn, flat=0.45))
    P.append(parts_piece(it, "ribs", m["plate"], ribs, bevel=0.0))
    P.append(glassy(Plate(it, "flank_membrane", m["glass"], T, D([(8, 0.22), (84, 0.26), (94, 0.5), (60, 0.56), (8, 0.48)]), base + 0.0055,
                          thickness=0.0016, bevel=0.0, segs=0).export()))
    # right side: smaller, separated shells (asymmetric growth)
    for k, (u0, u1) in enumerate(((0.36, 0.48), (0.2, 0.32))):
        plate(f"cell_plate_r{k}", [(-6, u0 + 0.01), (-30, u0), (-46, (u0 + u1) / 2), (-34, u1), (-8, u1 - 0.01)], 0.006, dome=0.005, thickness=0.006)
    # back: a long spine ridge of segmented vertebral plates, shoulder shells
    for k in range(7):
        u = 0.2 + k * 0.105
        plate(f"spine_{k}", [(172, u), (188, u), (190, u + 0.06), (180, u + 0.085), (170, u + 0.06)], 0.012, dome=0.004, keel=0.004, thickness=0.007)
    for s, sg in SIDES:
        bk = [(180 - a, b) for a, b in [(14, 0.6), (40, 0.55), (60, 0.66), (54, 0.86), (32, 0.93), (16, 0.84)]][::-1]
        plate(f"back_shell_{s}", bk if sg > 0 else mirror_poly(bk, 180), 0.008, dome=0.007, thickness=0.008)
    P.append(glassy(Plate(it, "back_membrane", m["glass"], T, D([(150, 0.3), (210, 0.3), (214, 0.6), (146, 0.6)]), base + 0.0055, thickness=0.0016,
                          bevel=0.0, segs=0).export()))
    # the seed node: a translucent nutrient vessel in an ivory socket
    c, n = T.point(deg(-10), 0.7, base + 0.012), T.normal(deg(-10), 0.7, base + 0.012)
    P.append(parts_piece(it, "seed_socket", m["trim"], [ring(c, n, 0.032, 0.02, 0.01, sides=18)], bevel=0.002))
    P.append(glassy(parts_piece(it, "seed", m["glass"], [disc(c + n * 0.004, n, 0.021, 0.02, sides=18)], bevel=0.0)))
    # tendrils: ivory growths sweeping from the left shoulder over the chest
    # and around the waist (the asymmetric silhouette)
    tend = []
    for path, r0, r1 in (([(40, 0.99), (26, 0.86), (12, 0.66), (-8, 0.46), (-26, 0.28), (-34, 0.12)], 0.009, 0.004),
                         ([(58, 0.92), (70, 0.72), (84, 0.5), (104, 0.32), (130, 0.2)], 0.008, 0.0035),
                         ([(-170, 0.96), (-150, 0.8), (-140, 0.6), (-120, 0.42), (-96, 0.3)], 0.007, 0.003)):
        Pp, Nn = on_map(T, D(path), base + 0.016, samples=5)
        r = np.linspace(r0, r1, len(Pp))
        tend.append(tube(Pp + Nn * r[:, None] * 0.4, r, sides=8))
    P.append(parts_piece(it, "tendrils", m["plate"], tend, bevel=0.0))
    # bioluminescent capillaries branching from the seed (FX only)
    caps = []
    for line in _branch(T, (-10, 0.7), [(40, 0.92), (60, 0.6), (-50, 0.8), (-30, 0.36), (14, 0.3), (-62, 0.55)], base, rng):
        Pp, Nn = on_map(T, D(line), base + 0.0105, samples=4)
        caps.append(fx_strip(Pp, 0.0018, seed_pt, 0.55, sides=5))
    P.append({**parts_piece(it, "capillaries", m["plate"], []), "fx_strips": caps})
    # collar: soft ivory petals open at the throat
    NM = kit.neck(facets=0)
    for k, (a0, a1) in enumerate(((22, 110), (115, 245), (250, 338))):
        pc = Plate(it, f"collar_{k}", m["plate"], NM, D([(a0, -0.05), (a1, -0.05), (a1 - 8, 0.7), ((a0 + a1) / 2, 0.95), (a0 + 8, 0.7)]), 0.03 + 0.004 * (k == 1),
                   dome=0.006, thickness=0.006, bevel=0.0022, weight_mode=["band", "y", 0.03], flow_origin=seed_pt)
        pls.append(pc)
    # asymmetric shoulders: a large leaf-shell with a membrane fin (left),
    # a small cupped shell (right)
    YM = kit.shoulder("l", facets=0)
    pls.append(Plate(it, "pauldron_l", m["plate"], YM, D([(-126, -0.36), (110, -0.4), (140, 0.0), (120, 0.44), (20, 0.56), (-110, 0.4), (-136, 0.02)]),
                     base + 0.028, dome=0.012, thickness=0.008, bevel=0.003, segs=2, weight_mode=["band", "x", 0.03], flow_origin=seed_pt))
    P.append(glassy(Plate(it, "shoulder_fin_l", m["glass"], YM, D([(-40, -0.3), (40, -0.3), (52, 0.1), (0, 0.4), (-52, 0.1)]), base + 0.048,
                          thickness=0.0016, bevel=0.0, segs=0, weight_mode=["band", "x", 0.03]).export()))
    YR = kit.shoulder("r", facets=0)
    pls.append(Plate(it, "pauldron_r", m["plate"], YR, D([(-100, -0.3), (100, -0.3), (108, 0.02), (60, 0.22), (-60, 0.22), (-108, 0.02)]), base + 0.024,
                     dome=0.009, thickness=0.007, bevel=0.0026, segs=2, weight_mode=["band", "x", 0.03], flow_origin=seed_pt))
    return P + [pl.export() for pl in pls]


def mycelial_gloves(body, base, m, kit=None):
    it = "symbiotech_field_set_gloves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        pol = lambda joints: limb_pol(s, joints, ("hands", "body", "shell_forearms"))
        P.append(kit.glove_liner(it, m["under"], s))
        VM = kit.forearm(s, facets=0)
        ax = body.L["hand_" + s] - body.L["lowerarm_" + s]
        ax = list(map(float, ax / np.linalg.norm(ax)))
        wm = ["band", ax, 0.05]
        origin = VM.point(0.0, 0.5, 0.02)
        # grown ivory bracer, open on the inner wrist
        P.append(Plate(it, f"bracer_{s}", m["plate"], VM, D([(-120, 0.1), (100, 0.14), (120, 0.6), (80, 0.96), (-90, 0.92), (-128, 0.5)]), 0.007,
                       dome=0.004, thickness=0.006, bevel=0.0024, segs=2, weights=pol(["lowerarm", "hand"]), weight_mode=wm).export())
        # culture vessel on the forearm: translucent tube in two ivory rings
        a, b = VM.point(0.0, 0.26, 0.026), VM.point(0.0, 0.72, 0.026)
        nrm = VM.normal(0.0, 0.5, 0.02)
        P.append(glassy(parts_piece(it, f"vessel_{s}", m["glass"], [tube([a, b], 0.012, sides=14)], weights=pol(["lowerarm"]), weight_mode=wm, bevel=0.0)))
        P.append(parts_piece(it, f"vessel_rings_{s}", m["trim"], [tube([a - (b - a) * 0.04, a + (b - a) * 0.06], 0.016, sides=14),
                                                                   tube([b - (b - a) * 0.06, b + (b - a) * 0.04], 0.016, sides=14)],
                             weights=pol(["lowerarm"]), weight_mode=wm, bevel=0.0015))
        P.append({**parts_piece(it, f"vessel_glow_{s}", m["trim"], [], weights=pol(["lowerarm"]), weight_mode=wm),
                  "fx_strips": [fx_strip([a + (b - a) * 0.05, b - (b - a) * 0.05], 0.007, a, 0.3, sides=8)]})
        # tendrils spiralling from the elbow to the back of the hand
        tend = []
        for k, ph0 in enumerate((-60, 70)):
            path = [(ph0 + 160 * f * sg, 0.05 + 0.95 * f) for f in np.linspace(0, 1, 12)]
            Pp, Nn = on_map(VM, D(path), 0.012, samples=3)
            r = np.linspace(0.006, 0.003, len(Pp))
            tend.append(tube(Pp + Nn * r[:, None] * 0.4, r, sides=7))
        P.append(parts_piece(it, f"tendrils_{s}", m["plate"], tend, weights=pol(["lowerarm", "hand"]), weight_mode=wm, bevel=0.0))
        # synaptic fibres (capillaries) along the bracer
        caps = []
        for ph in (-90, -40, 40, 90):
            Pp, _ = on_map(VM, D([(ph, 0.12), (ph * 0.8, 0.5), (ph * 0.5, 0.94)]), 0.0136, samples=6)
            caps.append(fx_strip(Pp, 0.0014, origin, 0.4, sides=5))
        P.append({**parts_piece(it, f"fibres_{s}", m["trim"], [], weights=pol(["lowerarm", "hand"]), weight_mode=wm), "fx_strips": caps})
        HM = kit.hand(s, facets=0)
        P.append(Plate(it, f"hand_shell_{s}", m["plate"], HM, D([(-56, 0.12), (40, 0.1), (62, 0.5), (46, 0.94), (-50, 0.9), (-66, 0.46)]), 0.0055, dome=0.004,
                       thickness=0.005, bevel=0.0018, res=0.006, weights=pol(["hand"]), weight_mode=["rigid"]).export())
        for fng in ("index", "middle", "ring", "pinky", "thumb"):
            segs = (("02", "03"), ("03", "04_leaf")) if fng == "thumb" else (("01", "02"), ("02", "03"), ("03", "04_leaf"))
            for seg, nxt in segs:
                FM = kit.finger(s, fng, seg, nxt, facets=0)
                if FM is None:
                    continue
                t1 = 0.85 if seg != "03" else 0.95  # pointed, grown tips
                P.append(Plate(it, f"finger_{fng}{seg}_{s}", m["plate"], FM, D([(-64, 0.04), (64, 0.04), (40, t1 - 0.1), (0, t1), (-40, t1 - 0.1)]), 0.003,
                               dome=0.0016, thickness=0.0024, bevel=0.0008, res=0.004, weights=pol([f"{fng}_{seg}"]), weight_mode=["rigid"]).export())
    return P


def mycelial_greaves(body, base, m, kit=None):
    it = "symbiotech_field_set_greaves"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        surf, _ = kit.leg_surfaces(s)
        th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
        TM, CM, KM = kit.thigh(s, facets=0), kit.calf(s, facets=0), kit.knee(s, facets=0)
        tax = list(map(float, (ca - th) / np.linalg.norm(ca - th)))
        cax = list(map(float, (ft - ca) / np.linalg.norm(ft - ca)))
        pt = limb_pol(s, ["thigh", "calf"], surf)
        pc = limb_pol(s, ["calf", "thigh", "foot"], surf)
        for nm, M, t0, t1, pol in (("tissue_thigh", TM, 0.04, 1.0, pt), ("tissue_calf", CM, -0.02, 0.96, pc)):
            P.append(Plate(it, f"{nm}_{s}", m["under"], M, D([(-179.5, t0), (179.5, t0), (179.5, t1), (-179.5, t1)]), 0.004, thickness=0.003,
                           bevel=0.0, segs=0, res=0.012, weights=pol).export())
        # overlapping ivory leaf scales down the front of the thigh, veined
        for k, (a0, t0, w) in enumerate(((-sg * 18, 0.1, 34), (sg * 22, 0.3, 30), (-sg * 6, 0.5, 26))):
            pl = Plate(it, f"thigh_leaf{k}_{s}", m["plate"], TM, D(organic([(a0 - w, t0 + 0.08), (a0, t0), (a0 + w, t0 + 0.08), (a0 + w * 0.7, t0 + 0.3), (a0, t0 + 0.38), (a0 - w * 0.7, t0 + 0.3)])),
                       0.011 + 0.002 * k, dome=0.005, keel=0.002, thickness=0.006, bevel=0.0022, segs=2, weights=pt, weight_mode=["band", tax, 0.06], flow_origin=th, flow_scale=0.9)
            pl.groove(D([(a0, t0 + 0.05), (a0 + 4, t0 + 0.2), (a0, t0 + 0.33)]), width=0.0024, depth=0.0018)
            P.append(pl.export())
        P.append(glassy(Plate(it, f"thigh_membrane_{s}", m["glass"], TM, D([(-50, 0.62), (50, 0.62), (40, 0.98), (-40, 0.98)]), 0.0075, thickness=0.0016,
                              bevel=0.0, segs=0, weights=pt, weight_mode=["band", tax, 0.06]).export()))
        # knee: a cupped ivory shell
        P.append(Plate(it, f"knee_{s}", m["plate"], KM, D([(-56, 0.0), (56, 0.0), (64, 0.5), (0, 1.08), (-64, 0.5)]), 0.02, dome=0.01, thickness=0.007,
                       bevel=0.0026, segs=2, weights=limb_pol(s, ["calf", "thigh"], surf), weight_mode=["rigid"]).export())
        # shin: two narrow ivory blades with membrane between
        for k, (a0, a1) in enumerate(((-60, -14), (14, 60))):
            P.append(Plate(it, f"shin_blade{k}_{s}", m["plate"], CM, D([(a0, 0.1), (a1, 0.1), (a1 * 0.7 if a1 else a1, 0.9), ((a0 + a1) / 2, 0.98), (a0 * 0.7, 0.9)]),
                           0.012, dome=0.004, thickness=0.006, bevel=0.0022, segs=2, weights=pc, weight_mode=["band", cax, 0.06]).export())
        P.append(glassy(Plate(it, f"shin_membrane_{s}", m["glass"], CM, D([(-18, 0.14), (18, 0.14), (14, 0.88), (-14, 0.88)]), 0.0085, thickness=0.0016,
                              bevel=0.0, segs=0, weights=pc, weight_mode=["band", cax, 0.06]).export()))
        # tendrils grown in a spiral round the leg (thigh and calf)
        tend = []
        for M, pol_, t0, t1, turns, r0 in ((TM, pt, 0.05, 0.95, 0.75, 0.007), (CM, pc, 0.04, 0.92, -0.6, 0.0065)):
            for k in range(2):
                ph0 = -sg * 100 + k * 160
                path = [(ph0 + 360 * turns * f * sg, t0 + (t1 - t0) * f) for f in np.linspace(0, 1, 16)]
                Pp, Nn = on_map(M, D(path), 0.0125, samples=3)
                r = np.linspace(r0, r0 * 0.55, len(Pp))
                tend.append(tube(Pp + Nn * r[:, None] * 0.4, r, sides=7))
        P.append(parts_piece(it, f"tendrils_{s}", m["plate"], tend, weights=pc, bevel=0.0))
        caps = []
        for M, t0, t1 in ((TM, 0.12, 0.8), (CM, 0.12, 0.88)):
            for ph in (-35, 35):
                Pp, _ = on_map(M, D([(ph, t0), (ph * 0.6, (t0 + t1) / 2), (ph * 0.2, t1)]), 0.0128, samples=6)
                caps.append(fx_strip(Pp, 0.0015, th, 0.9, sides=5))
        P.append({**parts_piece(it, f"capillaries_{s}", m["trim"], [], weights=pc), "fx_strips": caps})
    return P


def mycelial_boots(body, base, m, kit=None):
    it = "symbiotech_field_set_boots"
    kit = kit or Kit(body)
    P = []
    for s, sg in SIDES:
        BM, CM, cloud, y0, heel, toe = kit.foot(s)
        pol = {"joints": ["foot", "ball", "calf"], "side": s, "surfaces": ["shell_shoes", "body", "shell_shins"]}
        pb = {**pol, "joints": ["foot", "ball"]}
        bax = list(map(float, (toe - heel) / np.linalg.norm(toe - heel)))
        cax = list(map(float, (body.L["foot_" + s] - body.L["calf_" + s]) / np.linalg.norm(body.L["foot_" + s] - body.L["calf_" + s])))
        P.append(kit.boot_liner(it, m["under"], s))
        # ivory shell upper with an organic opening over the instep (membrane behind)
        pl = Plate(it, f"upper_{s}", m["plate"], BM, D([(-150, -0.03), (150, -0.03), (150, 0.86), (96, 1.05), (-96, 1.05), (-150, 0.86)]), 0.006,
                   thickness=0.006, bevel=0.0026, segs=2, res=0.011, weights=pb, weight_mode=["band", bax, 0.05])
        pl.hole(D([(-34, 0.3), (34, 0.3), (40, 0.5), (0, 0.72), (-40, 0.5)]))
        P.append(pl.export())
        P.append(glassy(Plate(it, f"instep_membrane_{s}", m["glass"], BM, D([(-38, 0.28), (38, 0.28), (44, 0.5), (0, 0.75), (-44, 0.5)]), 0.0035,
                              thickness=0.0016, bevel=0.0, segs=0, res=0.007, weights=pb, weight_mode=["rigid"]).export()))
        P.append(Plate(it, f"cuff_{s}", m["plate"], CM, D([(-160, 0.55), (150, 0.58), (170, 1.03), (-170, 1.03)]), 0.009, lip0=0.003, thickness=0.006,
                       bevel=0.0024, segs=2, weights={**pol, "joints": ["calf", "foot"]}, weight_mode=["band", cax, 0.04]).export())
        # culture node on the outer ankle
        c, n = CM.point(deg(-sg * 90), 0.82, 0.016), CM.normal(deg(-sg * 90), 0.82, 0.016)
        P.append(parts_piece(it, f"node_socket_{s}", m["trim"], [ring(c, n, 0.02, 0.012, 0.008, sides=16)], weights=pb, weight_mode=["rigid"], bevel=0.0015))
        P.append(glassy(parts_piece(it, f"node_{s}", m["glass"], [disc(c + n * 0.003, n, 0.013, 0.016, sides=16)], weights=pb, weight_mode=["rigid"], bevel=0.0)))
        # root ridges along the sole edge and up the heel
        roots = []
        for k, (a0, a1) in enumerate(((-150, -60), (60, 150), (-170, 170))):
            path = [(a0 + (a1 - a0) * f, 0.04 + 0.85 * f if k < 2 else -0.04 + 0.06 * np.sin(f * np.pi)) for f in np.linspace(0, 1, 10)]
            if k == 2:
                path = [(a, -0.03) for a in np.linspace(a0, a1, 14)]
            Pp, Nn = on_map(BM, D(path), 0.011, samples=3)
            r = np.full(len(Pp), 0.0055)
            roots.append(tube(Pp, r, sides=7))
        P.append(parts_piece(it, f"roots_{s}", m["plate"], roots, weights=pb, weight_mode=["band", bax, 0.05], bevel=0.0))
        caps = []
        for ph in (-60, 60):
            Pp, _ = on_map(CM, D([(ph, 0.6), (ph * 0.8, 0.8), (ph * 0.5, 1.0)]), 0.0102, samples=5)
            caps.append(fx_strip(Pp, 0.0014, c, 0.3, sides=5))
        P.append({**parts_piece(it, f"capillaries_{s}", m["trim"], [], weights={**pol, "joints": ["calf", "foot"]}), "fx_strips": caps})
        P.append(kit.sole(it, m["sole"], s, scale=1.05, y0d=-0.008, y1d=0.016, bevel=0.004, channel=False, treads=5))
    return P


def _smooth(fn):
    """Pieces lofted on smooth (un-faceted) maps skip the planar dissolve."""
    def wrapped(body, base, m, kit=None):
        P = fn(body, base, m, kit)
        for p in P:
            p.setdefault("planar", 0.0)
        return P
    wrapped.__name__ = fn.__name__
    return wrapped


strataweave_chest, strataweave_gloves, strataweave_greaves, strataweave_boots = map(_smooth, (strataweave_chest, strataweave_gloves, strataweave_greaves, strataweave_boots))
mycelial_chest, mycelial_gloves, mycelial_greaves, mycelial_boots = map(_smooth, (mycelial_chest, mycelial_gloves, mycelial_greaves, mycelial_boots))
vesperglass_chest, vesperglass_gloves, vesperglass_greaves, vesperglass_boots = map(_smooth, (vesperglass_chest, vesperglass_gloves, vesperglass_greaves, vesperglass_boots))

DESIGNS = {
    "vesperglass_chest": vesperglass_chest, "vesperglass_gloves": vesperglass_gloves,
    "vesperglass_greaves": vesperglass_greaves, "vesperglass_boots": vesperglass_boots,
    "strataweave_chest": strataweave_chest, "strataweave_gloves": strataweave_gloves,
    "strataweave_greaves": strataweave_greaves, "strataweave_boots": strataweave_boots,
    "mycelial_chest": mycelial_chest, "mycelial_gloves": mycelial_gloves,
    "mycelial_greaves": mycelial_greaves, "mycelial_boots": mycelial_boots,
}

# design functions take (body, base, mats); a Kit per call is cheap enough
# (maps are rebuilt per item), keeping the registry signature unchanged
ad.DESIGNS.update({k: (lambda f: (lambda body, base, m: f(body, base, m)))(f) for k, f in DESIGNS.items()})
