"""Fit approximate reference cameras to a model by silhouette agreement.

Illustrations carry no camera data. For each reference view we search for
the camera (azimuth, elevation, distance, focal length, small roll, target
offset) whose rendering of the model's silhouette best overlaps the
reference mask, then report that overlap (IoU). Because the camera is fitted
per view, IoU is an optimistic "best-fit" agreement measure. Views that were
not used to derive the geometry act as validation views.
"""
from __future__ import annotations

import math

import cv2
import numpy as np
from scipy.optimize import minimize

from .cameras import Camera
from .metrics import iou, silhouette


def look_at(eye, target, roll=0.0):
    f = target - eye
    f = f / np.linalg.norm(f)
    r = np.cross(f, [0, 0, 1.0])
    if np.linalg.norm(r) < 1e-6:
        r = np.cross(f, [0, 1.0, 0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    c, s = math.cos(roll), math.sin(roll)
    r, u = c * r + s * u, -s * r + c * u
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = r, u, -f, eye
    return M


def persp_camera(x, centre, size, W, H, name="fit"):
    az, el, dk, f_mm, tx, ty, tz, roll = x
    a, e = math.radians(az), math.radians(el)
    tgt = centre + np.array([tx, ty, tz]) * size
    eye = tgt + dk * size * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
    return Camera.from_blender_matrix(name, W, H, f_mm, 36.0, look_at(eye, tgt, math.radians(roll)))


def fit_view(V, F, mask, name, grid_az=range(-180, 180, 15), el_range=(8.0, 30.0)):
    """el_range bounds the elevation: without it the optimiser can trade elevation for
    model proportions and hide a real shape mismatch."""
    grid_el = np.linspace(el_range[0], el_range[1], 4)
    H, W = mask.shape
    lo, hi = V.min(0), V.max(0)
    centre, size = (lo + hi) / 2, float(np.linalg.norm(hi - lo))
    # decimate triangles for speed during search (every k-th triangle still gives the outline at this resolution)
    Fs = F[:: max(1, len(F) // 25000)]
    cache = {}

    def score(x, faces=Fs):
        key = tuple(np.round(x, 4))
        if key in cache:
            return cache[key]
        cam = persp_camera(x, centre, size, W, H)
        s = 1 - iou(silhouette(V, faces, cam), mask)
        s += 0.02 * max(0.0, el_range[0] - x[1]) + 0.02 * max(0.0, x[1] - el_range[1]) + 0.01 * max(0.0, abs(x[7]) - 5)
        cache[key] = s
        return s

    best = None
    for az in grid_az:
        for el in grid_el:
            for dk in (1.6, 2.2, 3.0):
                x = np.array([az, el, dk, 50, 0, 0, 0, 0], float)
                s = score(x)
                if best is None or s < best[0]:
                    best = (s, x)
    x0 = best[1]
    simplex = np.vstack([x0, x0 + np.diag([8, 6, 0.3, 12, 0.05, 0.05, 0.05, 3])])
    res = minimize(score, x0, method="Nelder-Mead", options={"xatol": 0.05, "fatol": 1e-4, "maxiter": 700, "initial_simplex": simplex})
    x = res.x
    cam = persp_camera(x, centre, size, W, H, name)
    sil = silhouette(V, F, cam)
    return {"camera": cam, "params": {"az": x[0], "el": x[1], "dist_x_size": x[2], "focal_mm": x[3], "roll": x[7], "el_range": list(el_range)}, "iou": iou(sil, mask),
            "silhouette": sil}


def fit_ortho_top(V, F, mask, name="top"):
    """Orthographic top view: rotation about Z, scale and translation."""
    H, W = mask.shape
    lo, hi = V.min(0), V.max(0)
    centre = (lo + hi) / 2

    def cam(x):
        rot, ppm, tx, ty = x
        c, s = math.cos(rot), math.sin(rot)
        # camera looking straight down: x_cam = rotated world x, y_cam = rotated world -y (image down)
        R = np.array([[c, s, 0], [s, -c, 0], [0, 0, -1.0]])
        t = -R @ np.array([centre[0], centre[1], hi[2] + 10])
        K = np.array([[ppm, 0, W / 2 + tx], [0, ppm, H / 2 + ty], [0, 0, 1]])
        return Camera(name, W, H, K, R, t, ortho=True)

    Fs = F[:: max(1, len(F) // 25000)]

    def score(x):
        return 1 - iou(silhouette(V, Fs, cam(x)), mask)

    ys, xs = np.nonzero(mask)
    ppm0 = (np.ptp(ys) + 1) / max(np.ptp(V[:, 1]), 1e-6)
    best = min(((score(np.array([r, ppm0, 0, 0])), np.array([r, ppm0, 0, 0])) for r in np.radians(np.arange(0, 360, 15))), key=lambda t: t[0])
    res = minimize(score, best[1], method="Nelder-Mead", options={"maxiter": 400, "xatol": 1e-3})
    c = cam(res.x)
    sil = silhouette(V, F, c)
    return {"camera": c, "params": {"rot_deg": math.degrees(res.x[0]), "px_per_m": res.x[1]}, "iou": iou(sil, mask), "silhouette": sil}


def overlay_contours(img, ref_mask, model_mask):
    out = img.copy()
    for m, col in [(ref_mask, (0, 0, 255)), (model_mask, (0, 255, 0))]:
        cnts, _ = cv2.findContours((m > 0).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(out, cnts, -1, col, 1)
    return out
