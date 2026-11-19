"""Unit tests for the Blender-independent parts of the asset pipeline.

Run from tools/asset-pipeline:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from asset_pipeline import workspace  # noqa: E402
from asset_pipeline.cameras import Camera, rotation_angle_deg, umeyama  # noqa: E402
from asset_pipeline.dense import _hull, fuse_pair_depths, scene_centre  # noqa: E402
from asset_pipeline.imaging import border_background_mask, hole_count, remove_small  # noqa: E402
from asset_pipeline.measure import split_body_and_legs  # noqa: E402
from asset_pipeline.metrics import distance_report, iou, silhouette  # noqa: E402
from asset_pipeline.texture import pad_islands, rasterise_uv  # noqa: E402


def look_at(eye, target):
    f = np.asarray(target, float) - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = r, u, -f, eye
    return M


def ring_cameras(n=16, radius=3.0, elev=20.0, size=(160, 120)):
    cams = []
    for k in range(n):
        a, e = 2 * math.pi * k / n, math.radians(elev)
        eye = radius * np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])
        cams.append(Camera.from_blender_matrix(f"c{k}", size[0], size[1], 35.0, 36.0, look_at(eye, [0, 0, 0])))
    return cams


def sphere_mesh(r=0.5, n=24):
    import trimesh

    return trimesh.creation.icosphere(subdivisions=3, radius=r)


class Segmentation(unittest.TestCase):
    def test_enclosed_hole_is_preserved(self):
        # a ring on a uniform background: the aperture must stay background
        img = np.full((200, 200, 3), (60, 40, 30), np.uint8)
        cv2.circle(img, (100, 100), 70, (200, 200, 190), 18)
        m, _ = border_background_mask(img, threshold=0.08, min_area=50)
        self.assertEqual(hole_count(m), 1)
        self.assertEqual(m[100, 100], 0)
        self.assertEqual(m[100, 30], 255)

    def test_thin_lines_survive_threshold_but_small_specks_are_removed(self):
        m = np.zeros((50, 50), np.uint8)
        m[10:40, 10:40] = 255
        m[2, 2] = 255
        out = remove_small(m, 20)
        self.assertEqual(out[2, 2], 0)
        self.assertEqual(out[20, 20], 255)


class Cameras(unittest.TestCase):
    def test_blender_matrix_round_trip_and_projection(self):
        M = look_at(np.array([2.0, -1.0, 1.5]), [0, 0, 0.3])
        cam = Camera.from_blender_matrix("x", 640, 480, 50.0, 36.0, M)
        np.testing.assert_allclose(cam.blender_matrix(), M, atol=1e-9)
        uv, z = cam.project(np.array([[0, 0, 0.3]]))
        np.testing.assert_allclose(uv[0], [320, 240], atol=1e-6)  # the look-at target projects to the centre
        self.assertGreater(z[0], 0)

    def test_orthographic_projection(self):
        cam = Camera("o", 100, 100, np.array([[50.0, 0, 50], [0, 50.0, 50], [0, 0, 1]]), np.eye(3), np.array([0, 0, 5.0]), ortho=True)
        uv, _ = cam.project(np.array([[0.2, -0.4, 0.0]]))
        np.testing.assert_allclose(uv[0], [60, 30])
        np.testing.assert_allclose(cam.view_dirs(np.zeros((2, 3))), [[0, 0, -1]] * 2)

    def test_umeyama_recovers_similarity(self):
        rng = np.random.default_rng(0)
        src = rng.normal(size=(30, 3))
        ang = 0.7
        R = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
        dst = 2.5 * src @ R.T + np.array([1, -2, 0.5])
        s, R2, t = umeyama(src, dst)
        self.assertAlmostEqual(s, 2.5, places=6)
        self.assertLess(rotation_angle_deg(R, R2), 1e-4)  # arccos near 1 amplifies rounding
        np.testing.assert_allclose(t, [1, -2, 0.5], atol=1e-6)


class Reconstruction(unittest.TestCase):
    def test_visual_hull_of_a_sphere(self):
        mesh = sphere_mesh(0.5)
        cams = ring_cameras(16) + ring_cameras(8, elev=60)
        masks = [silhouette(np.asarray(mesh.vertices), np.asarray(mesh.faces), c) for c in cams]
        np.testing.assert_allclose(scene_centre(cams), [0, 0, 0], atol=1e-6)
        h = _hull(cams, masks, np.array([-1.0, -1, -1]), np.array([1.0, 1, 1]), 48, tolerance=0)
        vol = h["inside"].sum() * h["voxel"] ** 3
        true = 4 / 3 * math.pi * 0.5 ** 3
        # a hull from a finite set of views is a superset of the object, but close to it
        self.assertGreater(vol, true * 0.95)
        self.assertLess(vol, true * 1.35)

    def test_depth_agreement_filter(self):
        a = np.array([[1.0, 1.0, np.nan]], np.float32)
        b = np.array([[1.005, 1.5, 1.0]], np.float32)
        out = fuse_pair_depths([a, b], 0.015)
        self.assertAlmostEqual(float(out[0, 0]), 1.0025, places=4)
        self.assertTrue(np.isnan(out[0, 1]))  # disagreeing pair rejected
        self.assertTrue(np.isnan(out[0, 2]))  # single observation rejected


class Metrics(unittest.TestCase):
    def test_silhouette_iou_and_identical_surfaces(self):
        mesh = sphere_mesh(0.4)
        cam = ring_cameras(1)[0]
        s = silhouette(np.asarray(mesh.vertices), np.asarray(mesh.faces), cam)
        self.assertEqual(iou(s, s), 1.0)
        shifted = np.roll(s, 6, axis=1)
        self.assertLess(iou(s, shifted), 0.95)
        zero = np.zeros(1000)
        rep = distance_report(zero, zero, 1.0)
        self.assertEqual(rep["chamfer_mean"], 0.0)
        self.assertEqual(rep["fscore"]["1.0%"]["f"], 1.0)


class Texture(unittest.TestCase):
    def test_uv_rasterisation_covers_layout(self):
        F = np.array([[0, 1, 2], [0, 2, 3]])
        UV = np.array([[[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]], [[0.1, 0.1], [0.9, 0.9], [0.1, 0.9]]])
        tid, ys, xs, t, bary = rasterise_uv(F, UV, 64)
        self.assertAlmostEqual(len(ys) / 64 ** 2, 0.64, delta=0.05)
        np.testing.assert_allclose(bary.sum(1), 1.0, atol=1e-6)
        img = np.zeros((64, 64, 3), np.uint8)
        img[ys, xs] = 200
        cov = np.zeros((64, 64), np.uint8)
        cov[ys, xs] = 255
        padded = pad_islands(img, cov, 3)
        self.assertEqual(padded[2, 2].tolist(), [0, 0, 0])  # far corner untouched
        self.assertEqual(padded[5, 5].tolist(), [200, 200, 200])  # border texels padded


class Measurement(unittest.TestCase):
    def test_body_and_four_legs_are_separated(self):
        m = np.zeros((300, 300), np.uint8)
        cv2.ellipse(m, (150, 150), (80, 110), 0, 0, 360, 255, -1)
        for dx, dy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cv2.line(m, (150 + dx * 50, 150 + dy * 70), (150 + dx * 130, 150 + dy * 135), 255, 14)
        body, legs = split_body_and_legs(m, 0.1)
        self.assertEqual(len(legs), 4)
        for lg in legs:
            d_prox = np.linalg.norm(np.array(lg["proximal"]) - 150)
            d_dist = np.linalg.norm(np.array(lg["distal"]) - 150)
            self.assertLess(d_prox, d_dist)


class StageCaching(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg_dir = self.tmp / "assets" / "unit"
        self.cfg_dir.mkdir(parents=True)
        (self.cfg_dir / "asset.json").write_text('{"id": "unit", "kind": "controlled-benchmark"}')
        self._saved = (workspace.ASSET_CONFIG_DIR, workspace.CACHE_ROOT)
        workspace.ASSET_CONFIG_DIR = self.tmp / "assets"
        workspace.CACHE_ROOT = self.tmp / "cache"

    def tearDown(self):
        workspace.ASSET_CONFIG_DIR, workspace.CACHE_ROOT = self._saved
        shutil.rmtree(self.tmp)

    def test_cached_rerun_param_change_and_failure(self):
        a = workspace.Asset.load("unit")
        src = self.tmp / "input.txt"
        src.write_text("v1")
        calls = []

        def stage(asset, params):
            calls.append(params["k"])
            out = asset.path("out.txt")
            out.write_text(src.read_text() + str(params["k"]))
            return [out], {"ok": True}

        workspace.run_stage(a, "s", stage, [src], {"k": 1})
        workspace.run_stage(a, "s", stage, [src], {"k": 1})
        self.assertEqual(calls, [1])  # second call cached
        workspace.run_stage(a, "s", stage, [src], {"k": 2})
        src.write_text("v2")
        workspace.run_stage(a, "s", stage, [src], {"k": 2})
        self.assertEqual(calls, [1, 2, 2])  # params and inputs both invalidate
        a.path("out.txt").write_text("tampered")
        workspace.run_stage(a, "s", stage, [src], {"k": 2})
        self.assertEqual(calls, [1, 2, 2, 2])  # changed output invalidates

        def broken(asset, params):
            raise workspace.StageError("no inputs")

        with self.assertRaises(workspace.StageError):
            workspace.run_stage(a, "b", broken, [src], {})
        self.assertEqual(workspace.Asset.load("unit").state["stages"]["b"]["status"], "failed")


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class Frames(unittest.TestCase):
    def test_blur_and_duplicate_frames_are_rejected_with_reasons(self):
        from asset_pipeline.frames import extract_frames

        tmp = Path(tempfile.mkdtemp())
        try:
            rng = np.random.default_rng(1)
            base = (rng.random((120, 160, 3)) * 255).astype(np.uint8)
            frames = []
            for k in range(6):
                f = np.roll(base, k * 9, axis=1)
                if k == 3:
                    f = cv2.GaussianBlur(f, (0, 0), 6)
                frames.append(f)
            frames.insert(2, frames[1].copy())  # duplicate viewpoint
            for i, f in enumerate(frames):
                cv2.imwrite(str(tmp / f"in{i:02d}.png"), f)
            video = tmp / "v.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "4", "-i", str(tmp / "in%02d.png"), "-c:v", "libx264", "-crf", "12",
                            "-pix_fmt", "yuv420p", str(video)], check=True)
            s = extract_frames(video, tmp / "out", {"fps": 4, "min_sharpness_ratio": 0.35, "max_frames": 64, "duplicate_mad": 1.5})
            self.assertEqual(s["extracted"], 7)
            self.assertEqual(s["rejected"].get("blur"), 1)
            self.assertEqual(s["rejected"].get("duplicate"), 1)
            self.assertEqual(len(list((tmp / "out" / "selected").glob("*.png"))), 5)
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
