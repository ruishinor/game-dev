"""CPU dense multi-view reconstruction.

COLMAP's PatchMatch stereo needs CUDA, which this environment does not
have, so dense geometry comes from:

1. Pairwise stereo. Each reference view is paired with nearby views,
   rectified with OpenCV and matched with semi-global block matching
   (SGBM). Disparities are converted back into a depth map in the
   reference view's own pixel grid.
2. Depth consistency. A depth sample is kept only where independent
   neighbour pairs agree.
3. Fusion. Depth maps are fused into a truncated signed distance field
   (TSDF) restricted to the silhouette visual hull. Hull voxels that no
   depth map observed fall back to the hull, which is the only place pure
   silhouette information is used.
4. Surface extraction. Marching cubes, then removal of small disconnected
   fragments and light Taubin smoothing.

Inputs are only images, masks and cameras. Nothing here reads ground truth.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .cameras import Camera


def scene_centre(cams):
    """Least-squares point closest to all optical axes."""
    A = np.zeros((3, 3))
    b = np.zeros(3)
    for c in cams:
        d = c.R[2]
        P = np.eye(3) - np.outer(d, d)
        A += P
        b += P @ c.center
    return np.linalg.solve(A, b)


def choose_neighbours(cams, centre, k, min_angle, max_angle, target=15.0):
    dirs = np.array([(c.center - centre) / np.linalg.norm(c.center - centre) for c in cams])
    out = {}
    for i in range(len(cams)):
        ang = np.degrees(np.arccos(np.clip(dirs @ dirs[i], -1, 1)))
        cand = [j for j in np.argsort(np.abs(ang - target)) if j != i and min_angle <= ang[j] <= max_angle]
        # prefer neighbours on different sides of the reference view
        chosen = []
        for j in cand:
            if len(chosen) == k:
                break
            if chosen and np.dot(dirs[j] - dirs[i], dirs[chosen[0]] - dirs[i]) > 0 and len(cand) > k + 2:
                continue
            chosen.append(int(j))
        for j in cand:
            if len(chosen) == k:
                break
            if j not in chosen:
                chosen.append(int(j))
        out[i] = chosen
    return out


def pair_depth(c1: Camera, c2: Camera, im1, im2, m1, m2, zrange, params):
    """Depth map (in c1's pixel grid, NaN where unknown) from one rectified stereo pair."""
    h, w = im1.shape[:2]
    Rrel = c2.R @ c1.R.T
    trel = c2.t - Rrel @ c1.t
    R1, R2, P1, P2, Q, roi1, roi2 = cv2.stereoRectify(c1.K, np.zeros(5), c2.K, np.zeros(5), (w, h), Rrel, trel.reshape(3, 1), flags=cv2.CALIB_ZERO_DISPARITY, alpha=-1)
    vertical = abs(P2[1, 3]) > abs(P2[0, 3])
    s = P2[1, 3] if vertical else P2[0, 3]
    f = P1[0, 0]
    mx1, my1 = cv2.initUndistortRectifyMap(c1.K, np.zeros(5), R1, P1, (w, h), cv2.CV_32FC1)
    mx2, my2 = cv2.initUndistortRectifyMap(c2.K, np.zeros(5), R2, P2, (w, h), cv2.CV_32FC1)
    g1 = cv2.remap(cv2.cvtColor(im1, cv2.COLOR_BGR2GRAY), mx1, my1, cv2.INTER_LINEAR)
    g2 = cv2.remap(cv2.cvtColor(im2, cv2.COLOR_BGR2GRAY), mx2, my2, cv2.INTER_LINEAR)
    k1 = cv2.remap(m1, mx1, my1, cv2.INTER_NEAREST)
    k2 = cv2.remap(m2, mx2, my2, cv2.INTER_NEAREST)

    def fwd(a):
        if vertical:
            a = a.T
        if s > 0:
            a = a[:, ::-1]
        return np.ascontiguousarray(a)

    def back(a):
        if s > 0:
            a = a[:, ::-1]
        if vertical:
            a = a.T
        return np.ascontiguousarray(a)

    a1, a2, b1, b2 = fwd(g1), fwd(g2), fwd(k1), fwd(k2)
    dmin = abs(s) / zrange[1]
    dmax = abs(s) / zrange[0]
    min_disp = int(np.floor(dmin)) - 8
    num = int(np.ceil((dmax - dmin + 16) / 16.0) * 16)
    num = max(16, min(num, 16 * 24))
    width = a1.shape[1]
    if min_disp + num > width - 32:  # SGBM needs the search window inside the image
        num = max(16, int((width - 32 - max(min_disp, 0)) // 16 * 16))
        if min_disp + num > width - 32:
            return np.full((h, w), np.nan, np.float32)
    bs = params["block_size"]
    sgbm = cv2.StereoSGBM_create(minDisparity=min_disp, numDisparities=num, blockSize=bs, P1=8 * bs * bs, P2=32 * bs * bs, disp12MaxDiff=1, uniquenessRatio=10,
                                 speckleWindowSize=80, speckleRange=2, preFilterCap=31, mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY)
    disp = sgbm.compute(a1, a2).astype(np.float32) / 16.0
    valid = (disp > min_disp) & (b1 > 0)
    # the matched pixel must land on the other view's foreground
    yy, xx = np.nonzero(valid)
    xr = np.round(xx - disp[yy, xx]).astype(int)
    ok = (xr >= 0) & (xr < b2.shape[1])
    ok[ok] &= b2[yy[ok], xr[ok]] > 0
    valid[yy[~ok], xx[~ok]] = False
    disp = np.where(valid, disp, np.nan)
    disp = back(disp)
    # Inverse mapping: each foreground pixel of camera 1 -> its rectified
    # position -> disparity there -> rectified 3D point -> camera-1 depth.
    yy, xx = np.nonzero(m1 > 0)
    if len(yy) == 0 or not np.isfinite(disp).any():
        return np.full((h, w), np.nan, np.float32)
    pr = cv2.undistortPoints(np.stack([xx, yy], 1).astype(np.float64).reshape(-1, 1, 2), c1.K, np.zeros(5), R=R1, P=P1).reshape(-1, 2)
    xi, yi = np.round(pr[:, 0]).astype(int), np.round(pr[:, 1]).astype(int)
    inside = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
    dsp = np.full(len(xx), np.nan, np.float32)
    dsp[inside] = disp[yi[inside], xi[inside]]
    good = np.isfinite(dsp) & (dsp > 0)
    Z = abs(s) / dsp[good]
    Pr = np.stack([(pr[good, 0] - P1[0, 2]) * Z / f, (pr[good, 1] - P1[1, 2]) * Z / f, Z], 1)
    z = (Pr @ R1)[:, 2]  # R1^T applied to row vectors; depth along camera-1 axis
    depth = np.full((h, w), np.nan, np.float32)
    ok = (z > zrange[0] * 0.8) & (z < zrange[1] * 1.2)
    depth[yy[good][ok], xx[good][ok]] = z[ok]
    depth[m1 == 0] = np.nan
    return depth


def fuse_pair_depths(depths, agreement):
    """Keep samples where at least two pair depths agree (relative), averaged."""
    D = np.stack(depths)
    if len(depths) == 1:
        return D[0]
    med = np.nanmedian(D, 0)
    close = np.abs(D - med) <= agreement * med
    cnt = close.sum(0)
    out = np.where(close, D, 0).sum(0) / np.maximum(cnt, 1)
    out[(cnt < 2) | ~np.isfinite(med)] = np.nan
    return out.astype(np.float32)


def _project_grid(cam: Camera, P):
    uv, z = cam.project(P)
    u = np.round(uv[:, 0]).astype(np.int64)
    v = np.round(uv[:, 1]).astype(np.int64)
    inside = (z > 1e-6) & (u >= 0) & (u < cam.width) & (v >= 0) & (v < cam.height)
    return u, v, z, inside


def reconstruct(cams, images: Path, masks: Path, out: Path, params: dict):
    import trimesh
    from skimage.measure import marching_cubes

    from .blender_io import write_ply_points

    out.mkdir(parents=True, exist_ok=True)
    ims = [cv2.imread(str(Path(images) / f"{c.name}.png")) for c in cams]
    mks = [cv2.imread(str(Path(masks) / f"{c.name}.png"), cv2.IMREAD_GRAYSCALE) for c in cams]
    if any(i is None for i in ims) or any(m is None for m in mks):
        raise FileNotFoundError("missing image or mask for a camera")
    centre = scene_centre(cams)
    dists = np.array([np.linalg.norm(c.center - centre) for c in cams])
    # Coarse hull from masks only, to size the volume and the depth search range.
    radius = params.get("scene_radius") or float(np.median(dists) * 0.6)
    lo, hi = centre - radius, centre + radius
    coarse = _hull(cams, mks, lo, hi, 64, params["hull_tolerance"])
    idx = np.argwhere(coarse["inside"])
    if len(idx) == 0:
        raise RuntimeError("visual hull is empty: masks and cameras disagree")
    vs0 = coarse["voxel"]
    lo2 = lo + (idx.min(0) - 2) * vs0
    hi2 = lo + (idx.max(0) + 3) * vs0
    nbrs = choose_neighbours(cams, centre, params["neighbours"], params["min_angle"], params["max_angle"])
    depth_maps = []
    pts, cols = [], []
    stats = []
    hull_pts = coarse["centres"][coarse["inside"].ravel()]
    for i, c in enumerate(cams):
        zc = hull_pts @ c.R[2] + c.t[2]
        zr = (max(zc.min() - 2 * vs0, 1e-3), zc.max() + 2 * vs0)
        pd = [pair_depth(c, cams[j], ims[i], ims[j], mks[i], mks[j], zr, params) for j in nbrs[i]]
        D = fuse_pair_depths(pd, params["agreement"]) if pd else np.full(mks[i].shape, np.nan, np.float32)
        depth_maps.append(D)
        fg = (mks[i] > 0).sum()
        stats.append({"view": c.name, "neighbours": [cams[j].name for j in nbrs[i]], "depth_coverage": float(np.isfinite(D).sum() / max(fg, 1))})
        np.save(out / f"depth_{c.name}.npy", D.astype(np.float16))
        yy, xx = np.nonzero(np.isfinite(D))
        sel = slice(None, None, 3)
        z = D[yy, xx][sel]
        Xc = np.stack([(xx[sel] - c.K[0, 2]) * z / c.K[0, 0], (yy[sel] - c.K[1, 2]) * z / c.K[1, 1], z], 1)
        pts.append((Xc - c.t) @ c.R)
        cols.append(ims[i][yy[sel], xx[sel], ::-1])
    P = np.concatenate(pts) if pts else np.zeros((0, 3))
    write_ply_points(out / "dense_points.ply", P, np.concatenate(cols) if cols else np.zeros((0, 3), np.uint8))
    # Fine hull + TSDF.
    n = params["voxels"]
    fine = _hull(cams, mks, lo2, hi2, n, params["hull_tolerance"])
    vs = fine["voxel"]
    shape = fine["shape"]
    G = fine["centres"]
    inside = fine["inside"].ravel()
    band = inside.copy()
    trunc = params["trunc_vox"] * vs
    T = np.zeros(G.shape[0], np.float32)
    Wt = np.zeros(G.shape[0], np.float32)
    sel = np.nonzero(band)[0]
    for c, D in zip(cams, depth_maps):
        u, v, z, ins = _project_grid(c, G[sel])
        s = sel[ins]
        d = D[v[ins], u[ins]]
        ok = np.isfinite(d)
        sdf = d[ok] - z[ins][ok]
        upd = sdf > -trunc
        tgt = s[ok][upd]
        T[tgt] += np.clip(sdf[upd] / trunc, -1, 1)
        Wt[tgt] += 1
    F = np.where(Wt > 0, T / np.maximum(Wt, 1), -1.0).astype(np.float32)
    F[~inside] = 1.0
    F = F.reshape(shape)
    if params.get("field_sigma_vox"):
        from scipy.ndimage import gaussian_filter

        F = gaussian_filter(F, params["field_sigma_vox"])
    F = np.pad(F, 1, constant_values=1.0)
    verts, faces, _, _ = marching_cubes(F, 0.0, spacing=(vs, vs, vs))
    verts = verts - vs + lo2 + vs / 2
    mesh = trimesh.Trimesh(verts, faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    parts = mesh.split(only_watertight=False)
    total = sum(len(p.faces) for p in parts)
    kept = [p for p in parts if len(p.faces) >= 0.01 * total]
    mesh = trimesh.util.concatenate(kept)
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=6)
    mesh.export(out / "mesh.ply")
    observed = float((Wt[inside] > 0).mean())
    try:
        g = int(round((2 * mesh.body_count - mesh.euler_number) / 2)) if mesh.is_watertight else None
    except Exception:
        g = None
    return {"genus": g, "cameras": len(cams), "voxel_size": float(vs), "grid": list(shape), "bounds": [lo2.tolist(), hi2.tolist()], "dense_points": int(len(P)),
            "hull_voxels": int(inside.sum()), "hull_voxels_observed_by_stereo": observed, "mesh_vertices": int(len(mesh.vertices)), "mesh_faces": int(len(mesh.faces)),
            "fragments_removed": len(parts) - len(kept), "mean_depth_coverage": float(np.mean([s["depth_coverage"] for s in stats])), "views": stats}


def _hull(cams, masks, lo, hi, n, tolerance, min_seen=0.5):
    ext = hi - lo
    vs = float(ext.max() / n)
    shape = tuple(int(np.ceil(e / vs)) for e in ext)
    axes = [lo[k] + vs * (np.arange(shape[k]) + 0.5) for k in range(3)]
    G = np.stack(np.meshgrid(*axes, indexing="ij"), -1).reshape(-1, 3)
    out_votes = np.zeros(len(G), np.int16)
    seen = np.zeros(len(G), np.int16)
    for c, m in zip(cams, masks):
        u, v, z, ins = _project_grid(c, G)
        seen += ins
        bad = np.zeros(len(G), bool)
        bad[ins] = m[v[ins], u[ins]] == 0
        out_votes += bad
    inside = (out_votes <= tolerance) & (seen >= max(3, int(min_seen * len(cams))))
    return {"inside": inside.reshape(shape), "voxel": vs, "shape": shape, "centres": G}
