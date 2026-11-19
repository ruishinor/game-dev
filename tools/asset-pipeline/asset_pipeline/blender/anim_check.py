"""Measure baked locomotion clips: foot sliding, ground contact, lift, body motion.

Replays the baked keyframes (no IK) from the rigged .blend. The root is moved
the way the runtime would move the entity (declared speed / turn rate), and
each foot tip is tracked in world space. A foot counts as planted below
`contact_z`; while planted it should not move.
"""
from __future__ import annotations

import json
import math

import bpy
import numpy as np
from mathutils import Matrix

from asset_pipeline.blender.common import finish, payload


def main():
    p = payload()
    bpy.ops.wm.open_mainfile(filepath=p["blend"])
    sc = bpy.context.scene
    arm = next(o for o in sc.objects if o.type == "ARMATURE")
    clips = json.loads(sc["clips"])
    legs = [b.name[4:6] for b in arm.data.bones if b.name.endswith("_lower")]
    arm.animation_data_create()
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True
    res = {}
    contact = p.get("contact_z", 0.02)
    for name, meta in clips.items():
        act = bpy.data.actions[name]
        arm.animation_data.action = act
        v = meta.get("ground_speed_m_s", 0.0)
        w = math.radians(meta.get("turn_rate_deg_s", 0.0))
        n = meta["frames"]
        fps = sc.render.fps
        tips = {lg: [] for lg in legs}
        body = []
        speeds = meta.get("speed_samples") or [v if isinstance(v, (int, float)) else 0.0] * n
        travelled = np.concatenate([[0.0], np.cumsum(np.array(speeds[:-1]) / fps)])  # root displacement the runtime applies
        for f in range(1, n + 1):
            sc.frame_set(f)
            t = (f - 1) / fps
            R = Matrix.Translation((0, -travelled[f - 1], 0)) @ Matrix.Rotation(w * t, 4, "Z")
            for lg in legs:
                pb = arm.pose.bones[f"leg_{lg}_lower"]
                tips[lg].append(np.array(R @ (arm.matrix_world @ pb.tail)))
            body.append(np.array(R @ (arm.matrix_world @ arm.pose.bones["body"].head)))
        out = {"frames": n}
        slides, pen, lifts = [], [], []
        for lg, P in tips.items():
            P = np.array(P)
            planted = P[:, 2] < contact
            d = np.linalg.norm(np.diff(P[:, :2], axis=0), axis=1)
            both = planted[1:] & planted[:-1]
            slides.append(float(d[both].sum()))
            pen.append(float(min(0.0, P[:, 2].min())))
            lifts.append(float(P[:, 2].max()))
        out["foot_slide_total_m"] = dict(zip(legs, [round(s, 4) for s in slides]))
        out["max_slide_per_planted_frame_mm"] = round(1000 * float(max((np.linalg.norm(np.diff(np.array(tips[lg])[:, :2], axis=0), axis=1)[(np.array(tips[lg])[1:, 2] < contact) & (np.array(tips[lg])[:-1, 2] < contact)].max(initial=0.0)) for lg in legs)), 3)
        out["min_foot_z_m"] = round(float(min(pen)), 4)
        out["max_foot_lift_m"] = round(float(max(lifts)), 3)
        out["min_feet_planted"] = int(min(sum(np.array(tips[lg])[i, 2] < contact for lg in legs) for i in range(n)))
        B = np.array(body)
        out["body_z_range_m"] = round(float(np.ptp(B[:, 2])), 4)
        out["measured_in"] = "world: root moved at the clip's declared speed / turn rate"
        res[name] = out
    arm.animation_data.action = None
    finish(p, res)


if __name__ == "__main__":
    main()
