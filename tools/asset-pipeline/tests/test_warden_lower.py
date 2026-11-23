"""Geometry contract tests for the Halo Construct's fitted Warden lower wardrobe."""
import unittest
import numpy as np
from scipy.spatial import cKDTree
from asset_pipeline.humanoid_wardrobe import lower_security


class SyntheticHalo:
    def __init__(self):
        self.L = {}
        points, normals, labels = [], [], []
        for side, sign in (('l', 1), ('r', -1)):
            x = 0.14 * sign
            self.L.update({
                'calf_'+side: np.array([x, .62, 0]),
                'foot_'+side: np.array([x, .14, 0]),
                'ball_'+side: np.array([x, .085, .13]),
                'toe_'+side: np.array([x, .075, .23]),
            })
            for y in np.linspace(.095, .66, 100):
                for theta in np.linspace(-np.pi, np.pi, 80, endpoint=False):
                    points.append([x+.065*np.cos(theta), y, .065*np.sin(theta)])
                    normals.append([np.cos(theta), 0, np.sin(theta)])
                    labels.append(side)
            for z in np.linspace(-.08, .27, 36):
                for u in np.linspace(-1, 1, 24):
                    points.append([x+.075*u, .055+.055*(1-u*u), z])
                    normals.append([0, 1, 0])
                    labels.append(side)
        self.V = np.asarray(points)
        self.N = np.asarray(normals)
        tags = np.asarray(labels)
        self.R = {'leg_l': tags == 'l', 'leg_r': tags == 'r'}
        self.tree = cKDTree(self.V)

    def surface(self, q):
        _, indexes = self.tree.query(q)
        return self.V[indexes], self.N[indexes]


class WardenLowerArmourTests(unittest.TestCase):
    def test_fitted_pair_has_finite_skinned_meshes_not_primitives(self):
        body = SyntheticHalo()
        for side, sign in (('l', 1), ('r', -1)):
            pieces = lower_security(body, side)
            self.assertEqual(len(pieces), 4)
            self.assertEqual({p['name'] for p in pieces}, {
                'greave_front_'+side, 'greave_rear_'+side,
                'boot_collar_'+side, 'boot_vamp_'+side})
            for p in pieces:
                V, F = p['V'], p['F']
                self.assertEqual(p['skin'], 'transfer')
                self.assertGreater(len(V), 50)
                self.assertGreater(len(F), 60)
                self.assertTrue(np.isfinite(V).all(), p['name'])
                self.assertTrue(np.isfinite(F).all(), p['name'])
                self.assertGreaterEqual(F.min(), 0)
                self.assertLess(F.max(), len(V))
                self.assertGreater(np.median(V[:, 0]) * sign, .04)


if __name__ == '__main__':
    unittest.main()
