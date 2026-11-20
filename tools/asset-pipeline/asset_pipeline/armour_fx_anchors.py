"""Glow anchors for the Cinderlock Regalia runtime effects.

Each anchor is a bind-pose point on a module (the reactor behind its fins,
flank vents, deltoid caps, ulna cores, knee cops, ankle plates) and the joint
it follows. The rig stage writes them into the GLB as nodes named
"fxa--<module>--<kind>--<n>" parented to that joint, so the client can hang
additive halos and ember emitters on the wearer's own bones.
"""
from __future__ import annotations

import numpy as np

from .armour_cinderlock import LimbAdapter, LimbMap, TorsoMap, deg, hand_dorsal_dir, joint_weight


def compute(body, items, base):
    T = TorsoMap(body)
    out = {}
    if "vanguard_field_set_chest" in items:
        a = [("core", T.point(0.0, 0.7, base + 0.011), "spine_03")]
        for sg in (1, -1):
            a.append(("vent", T.point(sg * deg(78), 0.5, base + 0.005), "spine_02"))
            a.append(("vent", T.point(np.pi - sg * deg(18), 0.62, base + 0.008), "spine_03"))
        out["vanguard_field_set_chest"] = a
    if "cinderlock_arms" in items:
        a = []
        for s in ("l", "r"):
            ua, la = body.L["upperarm_" + s], body.L["lowerarm_" + s]
            sel = ~body.head & (np.abs(body.P[:, 0]) > 0.1) & (np.sign(body.P[:, 0]) == (1 if s == "l" else -1))
            YM = LimbAdapter(LimbMap(ua, la, [0, 1.0, 0], body.P[sel], t_range=(-0.5, 0.8), half=0.012, rmax=0.13))
            a.append(("spark", YM.point(0.0, 0.28, base + 0.03), "upperarm_" + s))
        out["cinderlock_arms"] = a
    if "vanguard_field_set_gloves" in items:
        a = []
        for s in ("l", "r"):
            fa = body.P[joint_weight(body, ["lowerarm"], s) > 0.5]
            VM = LimbAdapter(LimbMap(body.L["lowerarm_" + s], body.L["hand_" + s], hand_dorsal_dir(body, s), fa, t_range=(-0.1, 1.15), half=0.014))
            a.append(("core_s", VM.point(0.0, 0.5, 0.022), "lowerarm_" + s))
        out["vanguard_field_set_gloves"] = a
    if "vanguard_field_set_greaves" in items:
        a = []
        for s in ("l", "r"):
            th, ca, ft = body.L["thigh_" + s], body.L["calf_" + s], body.L["foot_" + s]
            mt = body.P[joint_weight(body, ["thigh"], s) > 0.45]
            mc = body.P[joint_weight(body, ["calf"], s) > 0.45]
            KM = LimbAdapter(LimbMap(ca - (ft - ca) * 0.16, ca + (ft - ca) * 0.16, [0, 0, 1.0], np.concatenate([mt, mc]), t_range=(-0.3, 1.3), half=0.012))
            a.append(("spark", KM.point(0.0, 0.5, 0.042), "calf_" + s))
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
    return out
