"""Unit tests for the body-fitted-armour helpers (no Blender, synthetic data)."""
import unittest
from types import SimpleNamespace

import numpy as np
from scipy.spatial import cKDTree

from asset_pipeline import armour_design as ad
from asset_pipeline.armour import piece_weights, srgb_to_linear
from asset_pipeline.humanoid_wardrobe import angular_envelope, grid_faces


class ConvexEnvelope(unittest.TestCase):
    def test_bridges_a_groove(self):
        # a circle of radius 0.15 with a 4 cm groove at the back (theta = pi)
        th = np.linspace(-np.pi, np.pi, 720, endpoint=False)
        r = 0.15 - 0.04 * np.exp(-((np.abs(th) - np.pi) / 0.15) ** 2)
        x, z = r * np.sin(th), r * np.cos(th)
        cen, env = ad.convex_envelope(x, z)
        raw_c, raw = angular_envelope(np.arctan2(x, z), np.hypot(x, z), bins=96, smooth=2)
        at_back = np.interp(np.pi - 1e-3, cen, env, period=2 * np.pi)
        self.assertGreater(at_back, 0.14, "the convex hull spans the groove (chord, not the 0.11 floor)")
        self.assertLess(np.interp(np.pi - 1e-3, raw_c, raw, period=2 * np.pi), 0.13, "the raw envelope follows it")
        self.assertTrue(np.all(env >= np.interp(cen, raw_c, raw, period=2 * np.pi) - 2e-3))


class Relax(unittest.TestCase):
    def test_boundary_pinned_interior_smoothed(self):
        nr, nc = 6, 8
        g = np.stack(np.meshgrid(np.linspace(0, 1, nc), np.linspace(0, 1, nr)), -1).reshape(-1, 2)
        V = np.c_[g, np.zeros(len(g))]
        F = grid_faces(nr, nc)
        noisy = V.copy()
        inner = (g[:, 0] > 0) & (g[:, 0] < 1) & (g[:, 1] > 0) & (g[:, 1] < 1)
        noisy[inner, 2] = np.random.default_rng(0).normal(0, 0.05, inner.sum())
        out = ad.relax(noisy, F, iters=8)
        np.testing.assert_allclose(out[~inner], noisy[~inner])
        self.assertLess(np.abs(out[inner, 2]).mean(), np.abs(noisy[inner, 2]).mean() * 0.5)


class PushClear(unittest.TestCase):
    def test_reaches_the_gap_along_the_normal(self):
        # body: the plane y=0 sampled densely, normals +y
        g = np.stack(np.meshgrid(np.linspace(-0.5, 0.5, 120), np.linspace(-0.5, 0.5, 120)), -1).reshape(-1, 2)
        P = np.c_[g[:, 0], np.zeros(len(g)), g[:, 1]]
        body = SimpleNamespace(P=P, N=np.tile([0, 1.0, 0], (len(P), 1)), tree=cKDTree(P))
        V = np.c_[np.linspace(-0.2, 0.2, 40), np.full(40, 0.002), np.zeros(40)]
        out = ad.push_clear(body, V, 0.01)
        self.assertTrue(np.all(out[:, 1] >= 0.0099))
        np.testing.assert_allclose(out[:, [0, 2]], V[:, [0, 2]], atol=1e-9)


class Weights(unittest.TestCase):
    def setUp(self):
        self.joints = ["pelvis", "spine_03", "upperarm_l", "lowerarm_l", "thigh_l"]
        P = np.random.default_rng(1).normal(0, 0.1, (500, 3))
        Wd = np.zeros((500, 5))
        Wd[:, 1] = 0.4
        Wd[:, 2] = 0.3
        Wd[:, 3] = 0.2
        Wd[:, 4] = 0.1
        self.body = SimpleNamespace(P=P, Wd=Wd, tree=cKDTree(P))

    def test_torso_borne_and_capped(self):
        J, W = piece_weights(self.body, self.body.P[:50], self.joints, k=6, arm_cap=0.0)
        self.assertEqual(J.shape[1], 4)
        np.testing.assert_allclose(W.sum(1), 1, atol=1e-6)
        used = {self.joints[j] for j, w in zip(J.ravel(), W.ravel()) if w > 0}
        self.assertEqual(used, {"spine_03"}, "no arm or leg influence on torso pieces")
        J, W = piece_weights(self.body, self.body.P[:50], self.joints, k=6, arm_cap=0.25)
        up = np.where(np.array(self.joints)[J] == "upperarm_l", W, 0).sum(1)
        self.assertTrue(np.all(up <= 0.25 + 1e-6))
        self.assertFalse(np.any(np.isin(np.array(self.joints)[J][W > 0], ["lowerarm_l", "thigh_l"])))

    def test_rigid_mode_shares_one_blend(self):
        self.body.Wd[:250, 0], self.body.Wd[:250, 1] = 0.4, 0.0
        J, W = piece_weights(self.body, self.body.P[::5], self.joints, k=4, mode=["rigid"])
        rows = {tuple(sorted(zip(j, np.round(w, 6)))) for j, w in zip(J, W)}
        self.assertEqual(len(rows), 1)


class Palette(unittest.TestCase):
    def test_srgb_to_linear(self):
        np.testing.assert_allclose(srgb_to_linear("#000000"), 0)
        np.testing.assert_allclose(srgb_to_linear("#ffffff"), 1)
        self.assertAlmostEqual(float(srgb_to_linear("#808080")[0]), 0.2158605, places=5)


if __name__ == "__main__":
    unittest.main()
