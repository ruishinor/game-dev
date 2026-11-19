"""Unit tests for the imported-mechanical-humanoid route (no Blender).

Run from tools/asset-pipeline:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from asset_pipeline import gltf_io, humanoid_analysis as ha, humanoid_rig as hr, workspace  # noqa: E402
from asset_pipeline.mech_humanoid import aperture_area, ring_variant  # noqa: E402


def ref_rig():
    """Three-joint reference chain along +Y, rest rotations non-trivial."""
    q = hr.q_axis_angle([1, 0, 0], 0.3)
    return {"joints": ["root", "a", "b"], "nodes": [
        {"name": "Armature", "parent": None, "t": [0, 0, 0], "r": [0, 0, 0, 1], "s": [1, 1, 1], "joint": False},
        {"name": "root", "parent": "Armature", "t": [0, 0, 0], "r": [0, 0, 0, 1], "s": [1, 1, 1], "joint": True},
        {"name": "a", "parent": "root", "t": [0, 1.0, 0], "r": q.tolist(), "s": [1, 1, 1], "joint": True},
        {"name": "b", "parent": "a", "t": [0, 0.5, 0], "r": [0, 0, 0, 1], "s": [1, 1, 1], "joint": True},
    ]}


class RigTests(unittest.TestCase):
    def test_q_between_maps_direction(self):
        a, b = np.array([0, 1.0, 0]), np.array([1.0, 0.2, -0.3])
        q = hr.q_between(a, b)
        np.testing.assert_allclose(hr.qrot(q, a), b / np.linalg.norm(b), atol=1e-9)

    def test_bind_pose_reproduces_landmarks_and_reference_frames_are_kept(self):
        ref = ref_rig()
        hr.AIM_BACKUP = dict(hr.AIM)
        hr.AIM.clear()
        hr.AIM["a"] = "b"
        try:
            L = {"a": np.array([0.1, 0.9, 0.05]), "b": np.array([0.4, 0.5, 0.1])}
            rig = hr.build_rig(ref, L)
            k = 0.9
            nodes = hr.make_nodes(rig, k)
            sk = hr.Skeleton(nodes)
            bl = hr.bind_local_rotations(rig)
            bind = {"channels": [{"node": n, "path": "rotation", "times": [0], "values": list(q)} for n, q in bl.items()]
                    + [{"node": "a", "path": "translation", "times": [0], "values": sk.t[sk.index["a"]].tolist()}]}
            W = sk.world(*hr.pose_at(sk, bind, 0))
            for n in ("a", "b"):
                np.testing.assert_allclose(W[sk.index[n]][:3, 3], L[n], atol=1e-9)
            # rest local rotations are the reference's: clips keep their meaning
            for n in ("a", "b"):
                np.testing.assert_allclose(sk.r[sk.index[n]], hr.Skeleton(ref["nodes"]).r[sk.index[n]])
            # skinning a point rigidly bound to b reproduces it in the bind pose
            jidx = np.array([sk.index[n] for n in ref["joints"]])
            IBM = np.zeros((len(sk.names), 4, 4))
            IBM[jidx] = np.linalg.inv(W[jidx])
            V = np.array([[0.3, 0.6, 0.1]])
            out = hr.skin(sk, IBM, jidx, V, np.array([[2, 0, 0, 0]]), np.array([[1.0, 0, 0, 0]]), hr.pose_at(sk, bind, 0))
            np.testing.assert_allclose(out, V, atol=1e-9)
        finally:
            hr.AIM.clear()
            hr.AIM.update(hr.AIM_BACKUP)

    def test_pack_weights_prunes_small_influences(self):
        w = {"a": np.array([0.985, 0.5]), "b": np.array([0.015, 0.5])}
        J, W = hr.pack_weights(w, ["a", "b"])
        self.assertAlmostEqual(W[0, 0], 1.0)
        self.assertAlmostEqual(W[0, 1], 0.0)
        np.testing.assert_allclose(W[1, :2], [0.5, 0.5])

    def test_chain_weights_are_rigid_away_from_couplings(self):
        V = np.array([[0, y, 0] for y in np.linspace(0, 2, 41)])
        up = np.array([0, 1.0, 0])
        W = hr.chain_weights(V, [(np.array([0, 1.0, 0]), up, up)], ["lo", "hi"], [0.05])
        self.assertTrue(np.all(W[np.abs(V[:, 1] - 1) > 0.05].max(1) == 1.0))
        np.testing.assert_allclose(W.sum(1), 1.0)


class AnalysisTests(unittest.TestCase):
    def test_lower_envelope_ignores_outward_accessories(self):
        th = np.linspace(-np.pi, np.pi, 400, endpoint=False)
        r = np.full_like(th, 0.15)
        r[(th > 0.3) & (th < 0.8)] += 0.06  # a pouch
        coef = ha.lower_envelope(th, r, order=5, outward_weight=0.01)
        fit = ha.eval_envelope(coef, th, 5)
        # away from the accessory the body section is recovered to within 1 cm
        # (a low-order fit rings next to a 6 cm step; flattening starts at 4 mm
        # and only reaches full strength at 14 mm for that reason)
        self.assertLess(np.abs(fit[(th < 0.0) | (th > 1.2)] - 0.15).max(), 0.01)
        self.assertLess(np.abs(np.median(fit) - 0.15), 0.003)

    def test_flatten_protrusions_is_continuous_and_local(self):
        # a vertical cylinder with a bump; vertices outside the bump must not move
        ys = np.linspace(0.0, 1.0, 101)
        th = np.linspace(-np.pi, np.pi, 90, endpoint=False)
        Y, T = np.meshgrid(ys, th, indexing="ij")
        R = np.full_like(Y, 0.2)
        bump = (np.abs(Y - 0.5) < 0.08) & (np.abs(T - 1.0) < 0.3)
        R[bump] += 0.05
        V = np.stack([R * np.sin(T), Y, R * np.cos(T)], -1).reshape(-1, 3)
        sel = np.ones(len(V), bool)
        V2, disp, _ = ha.flatten_protrusions(V, sel, lambda y: (0.0, 0.0), 0.1, 0.9, mirror=False)
        self.assertGreater(disp[bump.ravel()].max(), 0.04)
        far = ((np.abs(Y - 0.5) > 0.14) | (np.abs(T - 1.0) > 0.7)).ravel()
        self.assertLess(disp[far].max(), 0.004)
        self.assertLess(np.median(disp[~bump.ravel()]), 1e-6)
        # nothing moves at the band ends (feathered)
        ends = (np.abs(V[:, 1] - 0.1) < 1e-6) | (np.abs(V[:, 1] - 0.9) < 1e-6)
        self.assertLess(disp[ends].max(), 1e-9)


class RingVariantTests(unittest.TestCase):
    def test_ring_remap_keeps_thickness_and_aperture(self):
        # elliptical tube (centreline a=0.08, b=0.125, tube radius 0.015) standing on y=1.585
        a, b, cy, tr = 0.08, 0.125, 1.71, 0.015
        P = []
        for t in np.linspace(0, 2 * np.pi, 160, endpoint=False):
            c = np.array([a * np.cos(t), cy + b * np.sin(t), 0])
            n = np.array([np.cos(t) / a, np.sin(t) / b, 0])
            n /= np.linalg.norm(n)
            for u in np.linspace(0, 2 * np.pi, 16, endpoint=False):
                P.append(c + tr * (np.cos(u) * n + np.sin(u) * np.array([0, 0, 1])))
        P = np.array(P)
        mask = np.ones(len(P), bool)
        Q, rep = ring_variant(P, mask, {"ring_bottom": cy - b - tr, "ring_half_width": 0.145, "ring_half_height": 0.082, "blend": [0, 0.01]})
        a2, b2, cy2 = rep["target_ellipse"]
        # every point stays ~tube-radius from the new centreline
        t = np.arctan2((Q[:, 1] - cy2) / b2, Q[:, 0] / a2)
        C = np.stack([a2 * np.cos(t), cy2 + b2 * np.sin(t), np.zeros_like(t)], 1)
        d = np.linalg.norm(Q - C, axis=1)
        self.assertLess(np.abs(np.percentile(d, 50) - tr), 0.004)
        self.assertGreater(aperture_area(Q), 0.02)  # still open, and wider
        self.assertGreater(np.ptp(Q[:, 0]), np.ptp(Q[:, 1]))

    def test_aperture_of_a_filled_disc_is_zero(self):
        rr, tt = np.meshgrid(np.linspace(0, 0.1, 60), np.linspace(0, 2 * np.pi, 200))
        P = np.stack([rr.ravel() * np.cos(tt.ravel()), rr.ravel() * np.sin(tt.ravel()), np.zeros(rr.size)], 1)
        self.assertEqual(aperture_area(P), 0.0)


class GlbWriterTests(unittest.TestCase):
    def test_inverse_bind_matrices_are_column_major(self):
        w = gltf_io.GlbWriter()
        root = w.node("j")
        M = np.eye(4)
        M[:3, 3] = [1, 2, 3]  # translation lives in the last column
        w.skin("s", [root], M[None])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "t.glb"
            w.write(path)
            j, binbuf = ha.read_glb(path)
            flat = ha._accessor(j, binbuf, j["skins"][0]["inverseBindMatrices"])[0]
            np.testing.assert_allclose(flat[12:15], [1, 2, 3])  # column-major: elements 12..14


class WorkspaceTests(unittest.TestCase):
    def test_stage_key_changes_with_shared_modules_and_toolchain(self):
        with tempfile.TemporaryDirectory() as d:
            mod = Path(d) / "shared.py"
            mod.write_text("a = 1\n")
            saved = (workspace.SHARED_MODULES, workspace.PIPELINE_DIR)
            try:
                workspace.SHARED_MODULES = ("shared.py",)
                workspace.PIPELINE_DIR = Path(d)
                asset = workspace.Asset("t", {}, Path(d) / "asset.json", Path(d))
                k1 = asset.stage_key("s", [], {"p": 1})
                mod.write_text("a = 2\n")
                self.assertNotEqual(k1, asset.stage_key("s", [], {"p": 1}))
            finally:
                workspace.SHARED_MODULES, workspace.PIPELINE_DIR = saved
        self.assertIn("bpy", workspace.toolchain_versions())

    def test_portable_paths_are_repo_relative(self):
        p = workspace.REPO_ROOT / "client" / "assets" / "x.glb"
        self.assertEqual(workspace.portable(p), "client/assets/x.glb")


if __name__ == "__main__":
    unittest.main()
