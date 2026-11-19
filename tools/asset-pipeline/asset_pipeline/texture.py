"""Multi-view texture reprojection onto a UV-unwrapped mesh.

For every texel covered by the UV layout:
  1. its 3D position and normal come from rasterising the UV triangles;
  2. for each source camera, it is visible when it projects inside the
     image and the foreground mask (eroded, so silhouette edges and
     background do not bleed in) and its depth matches the ray-cast depth of
     the mesh from that camera (occlusion test);
  3. visible samples are blended with weight cos(view angle)^power, so the
     most frontal views dominate.

Texels no camera sees are filled from neighbouring texels (inpainting) and
flagged in the confidence map. The result is source-derived colour with the
capture's lighting still in it. It is not an albedo estimate.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .workspace import run_blender


def rasterise_uv(F, UV, size):
    """Per-texel triangle id (-1 = none) and barycentric coordinates."""
    tid = np.full((size, size), -1, np.int32)
    pix = UV * size  # (T,3,2), v up
    pix[..., 1] = size - pix[..., 1]
    for i, tri in enumerate(pix):
        cv2.fillConvexPoly(tid, np.round(tri * 16).astype(np.int32), int(i), lineType=cv2.LINE_8, shift=4)
    ys, xs = np.nonzero(tid >= 0)
    t = tid[ys, xs]
    p = np.stack([xs + 0.5, ys + 0.5], 1)
    a, b, c = pix[t, 0], pix[t, 1], pix[t, 2]
    v0, v1, v2 = b - a, c - a, p - a
    d00 = (v0 * v0).sum(1)
    d01 = (v0 * v1).sum(1)
    d11 = (v1 * v1).sum(1)
    d20 = (v2 * v0).sum(1)
    d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-12] = 1e-12
    w1 = (d11 * d20 - d01 * d21) / den
    w2 = (d00 * d21 - d01 * d20) / den
    bary = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1)
    bary /= bary.sum(1, keepdims=True)
    return tid, ys, xs, t, bary


def bilinear(img, u, v):
    """Bilinear samples of img (H,W,C) at float pixel coordinates (pixel centres at integers)."""
    h, w = img.shape[:2]
    u = np.clip(u, 0, w - 1.001)
    v = np.clip(v, 0, h - 1.001)
    x0, y0 = u.astype(int), v.astype(int)
    fx, fy = (u - x0)[:, None], (v - y0)[:, None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def project_colours(V, F, UV, cams, images, masks, depth_dir, size, power=3.0, depth_scale=0.5, erode_px=2, depth_tol=0.01):
    tid, ys, xs, t, bary = rasterise_uv(F, UV, size)
    tri = V[F[t]]  # (N,3,3)
    P = (tri * bary[:, :, None]).sum(1)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    N = fn[t]
    acc = np.zeros((len(P), 3))
    wsum = np.zeros(len(P))
    views = np.zeros(len(P), np.int16)
    best = np.zeros(len(P))
    ext = np.ptp(V, 0).max()
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * erode_px + 1, 2 * erode_px + 1))
    for c in cams:
        img = cv2.imread(str(Path(images) / f"{c.name}.png")).astype(np.float32)
        m = cv2.imread(str(Path(masks) / f"{c.name}.png"), cv2.IMREAD_GRAYSCALE)
        m = cv2.erode(m, k) if erode_px else m
        D = np.load(Path(depth_dir) / f"{c.name}.npy")
        uv, z = c.project(P)
        u, v = uv[:, 0], uv[:, 1]
        ins = (u >= 0) & (u < c.width - 1) & (v >= 0) & (v < c.height - 1) & (z > 0)
        idx = np.nonzero(ins)[0]
        ui, vi = u[idx].astype(int), v[idx].astype(int)
        ok = m[vi, ui] > 0
        du = np.clip((u[idx] * depth_scale).astype(int), 0, D.shape[1] - 1)
        dv = np.clip((v[idx] * depth_scale).astype(int), 0, D.shape[0] - 1)
        dd = D[dv, du]
        ok &= np.isfinite(dd) & (z[idx] <= dd + depth_tol * ext)
        cosang = (N[idx] * c.view_dirs(P[idx])).sum(1)
        ok &= cosang > 0.05
        idx = idx[ok]
        w = cosang[ok] ** power
        col = bilinear(img, u[idx], v[idx])
        acc[idx] += col * w[:, None]
        wsum[idx] += w
        views[idx] += 1
        best[idx] = np.maximum(best[idx], cosang[ok])
    tex = np.zeros((size, size, 3), np.float32)
    seen = wsum > 0
    tex[ys[seen], xs[seen]] = acc[seen] / wsum[seen, None]
    conf = np.zeros((size, size), np.uint8)
    conf[ys, xs] = 1
    conf[ys[seen], xs[seen]] = np.clip(60 + best[seen] * 195, 0, 255).astype(np.uint8)
    covered = np.zeros((size, size), np.uint8)
    covered[ys, xs] = 255
    hole = np.zeros((size, size), np.uint8)
    hole[ys[~seen], xs[~seen]] = 255
    tex8 = np.clip(tex, 0, 255).astype(np.uint8)
    if hole.any():
        tex8 = cv2.inpaint(tex8, hole, 5, cv2.INPAINT_TELEA)
    tex8 = pad_islands(tex8, covered, 8)
    # area-weighted coverage over the surface
    area = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1) / 2
    tri_seen = np.bincount(t[seen], minlength=len(F)) / np.maximum(np.bincount(t, minlength=len(F)), 1)
    stats = {"texels_in_layout": int(len(P)), "texels_with_source_colour": int(seen.sum()), "texel_coverage": float(seen.mean()),
             "surface_area_coverage": float((area * tri_seen).sum() / area.sum()), "mean_views_per_texel": float(views[seen].mean()) if seen.any() else 0.0,
             "uv_layout_fill": float(len(P) / size ** 2)}
    return tex8, conf, stats


def pad_islands(tex, covered, iters):
    """Grow island colours outward so mip-mapping and bilinear filtering do not pull in black."""
    out = tex.copy()
    cov = covered > 0
    k = np.ones((3, 3), np.uint8)
    for _ in range(iters):
        grown = cv2.dilate(out, k)
        newcov = cv2.dilate(cov.astype(np.uint8), k) > 0
        ring = newcov & ~cov
        out[ring] = grown[ring]
        cov = newcov
    return out


def uv_layout_image(F, UV, size=1024):
    img = np.full((size, size, 3), 30, np.uint8)
    pix = UV * size
    pix[..., 1] = size - pix[..., 1]
    cv2.polylines(img, np.round(pix * 4).astype(np.int32), True, (90, 220, 255), 1, cv2.LINE_AA, shift=2)
    return img


def texture_mesh(asset, mesh_ply: Path, cams, images, masks, out: Path, params: dict):
    out.mkdir(parents=True, exist_ok=True)
    work = str(asset.work)
    run_blender("asset_pipeline.blender.mesh_jobs", {"work": work, "op": "unwrap", "mesh": str(mesh_ply), "out_npz": str(out / "unwrapped.npz"),
                                                     "out_blend": str(out / "unwrapped.blend"), "decimate_faces": params.get("decimate_faces", 120000)})
    run_blender("asset_pipeline.blender.mesh_jobs", {"work": work, "op": "depth", "mesh": str(out / "unwrapped.blend"), "out": str(out / "visibility"),
                                                     "scale": params["depth_scale"], "cameras": [c.to_json() for c in cams]})
    d = np.load(out / "unwrapped.npz")
    tex, conf, stats = project_colours(d["V"], d["F"], d["UV"], cams, images, masks, out / "visibility", params["size"], params["view_power"], params["depth_scale"])
    cv2.imwrite(str(out / "basecolor_reprojected.png"), tex)
    cv2.imwrite(str(out / "confidence.png"), conf)
    cv2.imwrite(str(out / "uv_layout.png"), uv_layout_image(d["F"], d["UV"]))
    stats["triangles"] = int(len(d["F"]))
    return stats
