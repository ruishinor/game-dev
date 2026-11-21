"""Glow anchors for the Cinderlock Regalia runtime effects.

Each anchor is a bind-pose point on a piece (the reactor behind its slats,
flank vents, vambrace cores, knee cops, thigh vents, ankle plates) and the
joint it follows. The rig stage writes them into the GLB as nodes named
"fxa--<item>--<kind>--<n>" parented to that joint, so the client can hang
additive halos and ember emitters on the wearer's own bones.
"""
from __future__ import annotations

import numpy as np

from .armour_cinderlock import LimbAdapter, LimbMap, TorsoMap, deg, hand_dorsal_dir, joint_weight


def compute(body, items, base):
    T = TorsoMap(body)
    out = {}
    if "vanguard_field_set_chest" in items:
        a = [("core", T.point(0.0, 0.7, base + 0.009), "spine_03")]
        for sg in (1, -1):
            a.append(("vent", T.point(sg * deg(78), 0.5, base + 0.005), "spine_02"))
        out["vanguard_field_set_chest"] = a
    if "vanguard_field_set_gloves" in items:
        a = []
        for s in ("l", "r"):
            fa = body.P[joint_weight(body, ["lowerarm"], s) > 0.5]
            VM = LimbAdapter(LimbMap(body.L["lowerarm_" + s], body.L["hand_" + s], hand_dorsal_dir(body, s), fa, t_range=(-0.1, 1.15), half=0.014))
            a.append(("core_s", VM.point(0.0, 0.5, 0.02), "lowerarm_" + s))
        out["vanguard_field_set_gloves"] = a
    if "vanguard_field_set_greaves" in items:
        a = []
        for s, sg in (("l", 1.0), ("r", -1.0)):
            th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
            mt = body.P[joint_weight(body, ["thigh"], s) > 0.45]
            mc = body.P[joint_weight(body, ["calf"], s) > 0.45]
            KM = LimbAdapter(LimbMap(ca - (ft - ca) * 0.16, ca + (ft - ca) * 0.16, [0, 0, 1.0], np.concatenate([mt, mc]), t_range=(-0.3, 1.3), half=0.012))
            TM = LimbAdapter(LimbMap(th, ca, [0, 0, 1.0], mt, t_range=(-0.1, 1.15)))
            a.append(("spark", KM.point(0.0, 0.5, 0.04), "calf_" + s))
            a.append(("vent", TM.point(deg(-sg * 121), 0.52, 0.009), "thigh_" + s))
        out["vanguard_field_set_greaves"] = a
    if "vanguard_field_set_boots" in items:
        a = []
        for s in ("l", "r"):
            ca, ft = body.L["calf_" + s], body.L["foot_" + s]
            mc = body.P[joint_weight(body, ["calf", "foot"], s) > 0.45]
            CM = LimbAdapter(LimbMap(ca, ft, [0, 0, 1.0], mc, t_range=(0.5, 1.15)))
            for ph in (90, -90):
                a.append(("spark", CM.point(deg(ph), 0.92, 0.038), "calf_" + s))
        out["vanguard_field_set_boots"] = a
    out.update(_families(body, items, base))
    return out


def _families(body, items, base):
    """Anchors for the other class families: the optical prism and lenses
    (Vesperglass), the instrument displays and beacons (Strataweave), the seed
    node, culture vessels and ankle nodes (Mycelial)."""
    from .armour_families import Kit

    kit = Kit(body)
    T = kit.torso()
    out = {}
    sides = (("l", 1.0), ("r", -1.0))
    if "keeper_field_set_chest" in items:
        a = [("core", T.point(0.0, 0.69, base + 0.04), "spine_03")]
        for s, sg in sides:
            a.append(("spark", kit.shoulder(s, facets=0).point(0.0, -0.02, base + 0.05), "upperarm_" + s))
        out["keeper_field_set_chest"] = a
    if "keeper_field_set_gloves" in items:
        out["keeper_field_set_gloves"] = [("core_s", kit.forearm(s).point(0.0, 1.0, 0.02), "hand_" + s) for s, _ in sides]
    if "keeper_field_set_greaves" in items:
        out["keeper_field_set_greaves"] = [("spark", kit.knee(s).point(0.0, 0.5, 0.045), "calf_" + s) for s, _ in sides]
    if "keeper_field_set_boots" in items:
        out["keeper_field_set_boots"] = [("spark", kit.foot(s)[0].point(0.0, 0.66, 0.016), "foot_" + s) for s, _ in sides]
    if "surveyor_field_set_chest" in items:
        out["surveyor_field_set_chest"] = [("display", T.point(0.0, 0.585, base + 0.046), "spine_03")]
    if "surveyor_field_set_gloves" in items:
        out["surveyor_field_set_gloves"] = [("display", kit.forearm(s, facets=0).point(0.0, 0.745, 0.033), "lowerarm_" + s) for s, _ in sides]
    if "surveyor_field_set_boots" in items:
        out["surveyor_field_set_boots"] = [("beacon", kit.foot(s)[1].point(deg(-sg * 90), 0.86, 0.047), "calf_" + s) for s, sg in sides]
    if "symbiotech_field_set_chest" in items:
        out["symbiotech_field_set_chest"] = [("core", T.point(deg(-10), 0.7, base + 0.03), "spine_03")]
    if "symbiotech_field_set_gloves" in items:
        out["symbiotech_field_set_gloves"] = [("core_s", kit.forearm(s, facets=0).point(0.0, 0.5, 0.026), "lowerarm_" + s) for s, _ in sides]
    if "symbiotech_field_set_boots" in items:
        out["symbiotech_field_set_boots"] = [("core_s", kit.foot(s)[1].point(deg(-sg * 90), 0.82, 0.03), "calf_" + s) for s, sg in sides]
    return out
