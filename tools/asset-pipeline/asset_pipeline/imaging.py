"""Foreground segmentation, overlays and contact sheets.

Segmentation never fills enclosed holes: negative space (arches, ring
apertures, gaps between limbs) must survive into reconstruction. Masks keep
the original image's size and pixel coordinates.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def _lab(img_bgr):
    return cv2.cvtColor(img_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)


def border_background_mask(img_bgr, threshold=0.08, border=6, min_area=400, open_px=1, close_px=1, exclude=None, bg_model="mixed"):
    """Foreground = pixels far (in Lab) from the background colour model sampled on the image border.

    The background model is the border pixels' per-row/column median, so
    gentle gradients are tolerated. `threshold` is a fraction of the Lab
    distance range (L in 0..100). `exclude` is a list of [x, y, w, h]
    rectangles forced to background (annotations, typography).
    Returns uint8 mask (0/255).
    """
    lab = _lab(img_bgr)
    h, w = lab.shape[:2]
    b = border
    top, bot = lab[:b].reshape(-1, 3), lab[-b:].reshape(-1, 3)
    left, right = lab[:, :b].reshape(-1, 3), lab[:, -b:].reshape(-1, 3)
    samples = np.concatenate([top, bot, left, right])
    # per-row interpolated background from left/right borders blended with global median
    med = np.median(samples, 0)
    row_bg = (np.median(lab[:, :b], 1) + np.median(lab[:, -b:], 1)) / 2  # (h,3)
    # "rows": background varies vertically (paper gradients, studio sweeps)
    bg = row_bg[:, None, :] if bg_model == "rows" else 0.5 * row_bg[:, None, :] + 0.5 * med[None, None, :]
    d = np.sqrt(((lab - bg) ** 2).sum(-1)) / 100.0
    m = (d > threshold).astype(np.uint8) * 255
    if exclude:
        for x, y, ww, hh in exclude:
            m[y:y + hh, x:x + ww] = 0
    if open_px:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * open_px + 1, 2 * open_px + 1))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    if close_px:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * close_px + 1, 2 * close_px + 1))
        closed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
        # closing may bridge narrow gaps but must not fill holes: keep only
        # newly set pixels that touch the original foreground boundary band
        m = np.where((closed > 0) & (cv2.dilate(m, k) > 0), 255, 0).astype(np.uint8)
    return remove_small(m, min_area), d


def remove_small(mask, min_area):
    n, lab, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return np.where(keep[lab], 255, 0).astype(np.uint8)


def grabcut_refine(img_bgr, mask, iterations=4, band=6):
    """Edge-aware refinement: GrabCut seeded from a coarse mask, constrained to a band around its boundary."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * band + 1, 2 * band + 1))
    sure_fg = cv2.erode(mask, k)
    maybe = cv2.dilate(mask, k)
    gc = np.full(mask.shape, cv2.GC_BGD, np.uint8)
    gc[maybe > 0] = cv2.GC_PR_BGD
    gc[mask > 0] = cv2.GC_PR_FGD
    gc[sure_fg > 0] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img_bgr, gc, None, bgd, fgd, iterations, cv2.GC_INIT_WITH_MASK)
    return np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


def hole_count(mask):
    """Number of enclosed background regions (holes) inside the foreground."""
    inv = (mask == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    return len([i for i in range(1, n) if i not in border])


def overlay(img_bgr, mask, colour=(60, 220, 255), alpha=0.45):
    out = img_bgr.copy()
    col = np.zeros_like(out)
    col[:] = colour
    sel = mask > 0
    out[sel] = (out[sel] * (1 - alpha) + col[sel] * alpha).astype(np.uint8)
    cnts, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, cnts, -1, (0, 0, 255), 1)
    return out


def contact_sheet(paths_or_imgs, out_path, cols=8, thumb=200, labels=None, label_colours=None):
    tiles = []
    for i, p in enumerate(paths_or_imgs):
        img = cv2.imread(str(p)) if isinstance(p, (str, Path)) else p
        h, w = img.shape[:2]
        s = thumb / max(h, w)
        t = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        tile = np.full((thumb + 18, thumb, 3), 24, np.uint8)
        tile[:t.shape[0], :t.shape[1]] = t
        if labels:
            c = (label_colours[i] if label_colours else (230, 230, 230))
            cv2.putText(tile, str(labels[i])[:30], (3, thumb + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.38, c, 1, cv2.LINE_AA)
        tiles.append(tile)
    rows = []
    for r in range(0, len(tiles), cols):
        row = tiles[r:r + cols]
        row += [np.full_like(tiles[0], 24)] * (cols - len(row))
        rows.append(np.hstack(row))
    sheet = np.vstack(rows)
    cv2.imwrite(str(out_path), sheet)
    return out_path


def segment_folder(src: Path, out: Path, params: dict, overlays: Path | None = None):
    imgs = sorted(p for p in Path(src).iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"))
    if not imgs:
        raise FileNotFoundError(f"no images in {src}")
    stats = []
    ov = []
    for p in imgs:
        img = cv2.imread(str(p))
        m, _ = border_background_mask(img, params["threshold"], min_area=params["min_area"], open_px=params["open_px"], close_px=params["close_px"],
                                      exclude=params.get("exclude"))
        if params.get("grabcut"):
            m = grabcut_refine(img, m)
        cv2.imwrite(str(out / f"{p.stem}.png"), m)
        stats.append({"image": p.name, "foreground_fraction": float((m > 0).mean()), "holes": hole_count(m)})
        if overlays is not None:
            ov.append(overlay(img, m))
    if overlays is not None:
        contact_sheet(ov, overlays / "segmentation_overlays.jpg", cols=8, thumb=220, labels=[p.stem for p in imgs])
    fr = [s["foreground_fraction"] for s in stats]
    return {"images": len(imgs), "foreground_fraction_min": min(fr), "foreground_fraction_max": max(fr), "masks_with_holes": sum(s["holes"] > 0 for s in stats),
            "per_image": stats}
