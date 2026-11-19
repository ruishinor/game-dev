"""Reference measurement: turn 2D reference views into numeric constraints.

Everything here works on reference pixels and records which view each
number came from. Interpretation choices (for example, which end is the
front) are parameters, not hidden assumptions.
"""
from __future__ import annotations

import cv2
import numpy as np


def _lab_lch(img_bgr):
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    L = lab[..., 0] * 100 / 255
    a = lab[..., 1] - 128
    b = lab[..., 2] - 128
    C = np.hypot(a, b)
    H = (np.degrees(np.arctan2(b, a)) + 360) % 360
    return L, C, H


# --------------------------------------------------------------------------- lineup (scale)
def measure_lineup(img, human_height_m, index, expected):
    """Side-elevation measurements of the index-th figure on a common ground line."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    paper = np.percentile(g, 75)
    ink = (g < paper - 14).astype(np.uint8) * 255
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # the ground line is a long thin horizontal stroke: find and remove it
    rows = (ink > 0).mean(1)
    ground_row = int(np.argmax(rows))
    ink[max(0, ground_row - 1):ground_row + 2] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(ink)
    comps = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 60 and stats[i, cv2.CC_STAT_HEIGHT] > 12]
    # merge fragments of one figure: group by horizontal overlap
    comps.sort(key=lambda i: stats[i, 0])
    groups = []
    for i in comps:
        x, y, w, h = stats[i, :4]
        if groups and x <= groups[-1]["x1"] + 3:
            gr = groups[-1]
            gr["ids"].append(i)
            gr["x1"] = max(gr["x1"], x + w)
        else:
            groups.append({"ids": [i], "x0": x, "x1": x + w})
    if len(groups) != expected:
        raise ValueError(f"lineup: found {len(groups)} figures, expected {expected}")
    figs = []
    for gr in groups:
        m = np.isin(lab, gr["ids"])
        ys, xs = np.nonzero(m)
        figs.append({"mask": m, "x0": int(xs.min()), "x1": int(xs.max()), "top": int(ys.min()), "bottom": int(ys.max())})
    human = figs[0]
    sp = figs[index]
    human_px = ground_row - human["top"]
    mpp = human_height_m / human_px
    m = sp["mask"]
    length_px = sp["x1"] - sp["x0"] + 1
    # rows where the figure is mostly solid (body); leg rows are sparse even where they span the length
    filled = m[:, sp["x0"]:sp["x1"] + 1].sum(1)
    body_rows = np.nonzero(filled >= 0.6 * length_px)[0]
    dorsal_row, underside_row = int(body_rows.min()), int(body_rows.max())
    return {
        "ground_row": ground_row, "human_px": int(human_px), "metres_per_px": mpp,
        "length_m": length_px * mpp,
        "total_height_m": (ground_row - sp["top"]) * mpp,
        "dorsal_height_m": (ground_row - dorsal_row) * mpp,
        "underside_height_m": (ground_row - underside_row) * mpp,
        "crystal_above_dorsal_m": (dorsal_row - sp["top"]) * mpp,
        "px": {"x0": sp["x0"], "x1": sp["x1"], "top": sp["top"], "dorsal": dorsal_row, "underside": underside_row},
    }


# --------------------------------------------------------------------------- top view
def split_body_and_legs(mask, open_frac):
    """Body = mask opened with a disc ~open_frac of the subject width; legs = what the opening removed."""
    ys, xs = np.nonzero(mask)
    r = max(3, int(open_frac * (np.ptp(xs) + 1)))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    body = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((body > 0).astype(np.uint8))
    body = np.where(lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])), 255, 0).astype(np.uint8)
    rest = (mask > 0) & ~(cv2.dilate(body, np.ones((3, 3), np.uint8)) > 0)
    n, lab, stats, cents = cv2.connectedComponentsWithStats(rest.astype(np.uint8))
    legs = []
    bcnt = np.array(np.nonzero(body)[::-1]).T.mean(0)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 0.002 * mask.size:
            continue
        ys, xs = np.nonzero(lab == i)
        pts = np.stack([xs, ys], 1).astype(np.float64)
        d = np.linalg.norm(pts - bcnt, axis=1)
        legs.append({"centroid": cents[i].tolist(), "proximal": pts[np.argmin(d)].tolist(), "distal": pts[np.argmax(d)].tolist(), "area": int(stats[i, cv2.CC_STAT_AREA])})
    return body, legs


def body_frame(body):
    """Principal axes of the body silhouette: centre, long-axis unit vector (image coords), extents."""
    ys, xs = np.nonzero(body)
    P = np.stack([xs, ys], 1).astype(np.float64)
    c = P.mean(0)
    U, S, Vt = np.linalg.svd(P - c, full_matrices=False)
    long_ax = Vt[0]
    if long_ax[1] > 0:  # point towards image top
        long_ax = -long_ax
    side_ax = np.array([-long_ax[1], long_ax[0]])
    pl = (P - c) @ long_ax
    ps = (P - c) @ side_ax
    return c, long_ax, side_ax, (pl.min(), pl.max()), (ps.min(), ps.max())


def plate_regions(img, body, crystal, moss, p):
    """Segment the dorsal surface into plates along the painted fractures.

    Fractures are thin dark lines. After 2x upsampling and an edge-preserving
    bilateral filter, a morphological black-hat isolates them; the strongest
    responses (relative to this body's own distribution) are cracks. Plates
    are then grown by watershed from the interior peaks of the crack-free
    distance field, so each region is bounded by painted cracks.
    """
    from scipy import ndimage as ndi
    from skimage.feature import peak_local_max
    from skimage.segmentation import watershed

    s = 2
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g2 = cv2.bilateralFilter(cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC), 9, 30, 5)
    b2 = cv2.resize(body, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST) > 0
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (p["crack_blackhat_px"] * s + 1,) * 2)
    bh = cv2.morphologyEx(g2, cv2.MORPH_BLACKHAT, k).astype(np.float32)
    thr = np.percentile(bh[b2], p.get("crack_percentile", 82))
    cracks2 = (bh > thr) & b2
    cracks2 = cv2.morphologyEx(cracks2.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
    free = b2 & ~cracks2
    dist = ndi.distance_transform_edt(free)
    md = max(4, int(p.get("plate_seed_spacing_frac", 0.07) * np.sqrt(b2.sum())))
    peaks = peak_local_max(dist, min_distance=md, threshold_abs=2.0, labels=b2.astype(np.int32))
    markers = np.zeros(b2.shape, np.int32)
    for i, (y, x) in enumerate(peaks, 1):
        markers[y, x] = i
    lab2 = watershed(-dist, markers, mask=b2)
    lab = cv2.resize(lab2.astype(np.float32), (body.shape[1], body.shape[0]), interpolation=cv2.INTER_NEAREST).astype(np.int32)
    cracks = cv2.resize(cracks2.astype(np.uint8), (body.shape[1], body.shape[0]), interpolation=cv2.INTER_NEAREST)
    min_area = p["plate_min_area_frac"] * (body > 0).sum()
    plates = []
    for j in range(1, lab.max() + 1):
        m = ((lab == j) & (body > 0)).astype(np.uint8)
        if m.sum() < min_area:
            continue
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cnts, key=cv2.contourArea)
        # fractures in the reference are straight, angular segments
        poly = cv2.approxPolyDP(c, p.get("plate_poly_eps_px", 2.6), True).reshape(-1, 2)
        if len(poly) < 3:
            continue
        ys, xs = np.nonzero(m)
        plates.append({"polygon_px": poly.tolist(), "area_px": int(m.sum()), "centroid_px": [float(xs.mean()), float(ys.mean())],
                       "mean_bgr": img[ys, xs].mean(0).tolist(), "moss_fraction": float((moss[ys, xs] > 0).mean()),
                       "under_crystal_fraction": float((crystal[ys, xs] > 0).mean())})
    return plates, cracks, lab


def crystal_footprints(img, body, p):
    L, C, H = _lab_lch(img)
    Lb = L[body > 0]
    lmin = max(p["crystal_L_min"], float(np.percentile(Lb, p.get("crystal_L_percentile", 80))))
    cr = ((L >= lmin) & (C <= p["crystal_chroma_max"]) & (body > 0)).astype(np.uint8)
    cr = cv2.morphologyEx(cr, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    from scipy import ndimage as ndi
    from skimage.feature import peak_local_max
    from skimage.segmentation import watershed

    dist = ndi.distance_transform_edt(cr)
    peaks = peak_local_max(dist, min_distance=2, threshold_abs=1.0, labels=cr)
    markers = np.zeros(cr.shape, np.int32)
    for i, (y, x) in enumerate(peaks, 1):
        markers[y, x] = i
    lab = watershed(-dist, markers, mask=cr)
    out = []
    for i in range(1, lab.max() + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < 6:
            continue
        P = np.stack([xs, ys], 1).astype(np.float64)
        c = P.mean(0)
        cov = np.cov((P - c).T) if len(P) > 2 else np.eye(2)
        ev, evec = np.linalg.eigh(cov)
        out.append({"centre_px": c.tolist(), "radius_px": float(np.sqrt(len(xs) / np.pi)), "elongation": float(np.sqrt(ev[1] / max(ev[0], 1e-6))),
                    "major_axis": evec[:, 1].tolist(), "brightness": float(L[ys, xs].mean())})
    out = [c for c in out if c["radius_px"] >= p.get("crystal_min_radius_px", 2.0)]
    out.sort(key=lambda c: -c["radius_px"])
    return out[: p.get("crystal_max_count", 80)], cr


def moss_mask(img, body, p):
    L, C, H = _lab_lch(img)
    h0, h1 = p["moss_hue"]
    # Lab hue: olive/yellow-green lies roughly 80-130 deg; the configured range is in OpenCV HSV hue (0-180)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = ((hsv[..., 0] >= h0) & (hsv[..., 0] <= h1) & (C >= p["moss_chroma_min"]) & (body > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return m


def measure_top(img, mask, p):
    body, legs = split_body_and_legs(mask, p["top_body_open_frac"])
    c, long_ax, side_ax, lext, sext = body_frame(body)
    crystals, crys_mask = crystal_footprints(img, body, p)
    moss = moss_mask(img, body, p)
    plates, cracks, markers = plate_regions(img, body, crys_mask, moss, p)
    cnts, _ = cv2.findContours(body, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outline = cv2.approxPolyDP(max(cnts, key=cv2.contourArea), 1.0, True).reshape(-1, 2)
    # body width profile along the long axis (front -> back), used for the side taper
    ys, xs = np.nonzero(body)
    P = np.stack([xs, ys], 1) - c
    pl, ps = P @ long_ax, P @ side_ax
    bins = np.linspace(lext[0], lext[1], 21)
    prof = []
    for a, b in zip(bins[:-1], bins[1:]):
        s = ps[(pl >= a) & (pl < b)]
        prof.append([float((a + b) / 2), float(s.min()) if len(s) else 0.0, float(s.max()) if len(s) else 0.0])
    n, mlab, mstats, mcent = cv2.connectedComponentsWithStats(cv2.dilate(moss, np.ones((3, 3), np.uint8)))
    moss_patches = [{"centre_px": mcent[i].tolist(), "area_px": int(mstats[i, cv2.CC_STAT_AREA])} for i in range(1, n) if mstats[i, cv2.CC_STAT_AREA] >= 4]
    return {"moss_patches": moss_patches, "centre_px": c.tolist(), "long_axis_px": long_ax.tolist(), "side_axis_px": side_ax.tolist(), "length_px": float(lext[1] - lext[0]),
            "long_extent_px": [float(lext[0]), float(lext[1])], "width_px": float(sext[1] - sext[0]), "outline_px": outline.tolist(), "legs": legs,
            "crystals": crystals, "plates": plates, "width_profile_px": prof, "moss_fraction": float((moss > 0).sum() / max((body > 0).sum(), 1))}, {
        "body": body, "cracks": cracks, "crystal": crys_mask, "moss": moss, "markers": markers}


def top_evidence(img, meas, masks):
    """Overlay of everything measured on the top view."""
    out = img.copy()
    rng = np.random.default_rng(3)
    vis = np.zeros_like(out)
    for pl in meas["plates"]:
        col = rng.integers(60, 255, 3).tolist()
        cv2.fillPoly(vis, [np.array(pl["polygon_px"], np.int32)], col)
    out = cv2.addWeighted(out, 0.45, vis, 0.55, 0)
    out[masks["cracks"] > 0] = (0, 0, 0)
    for pl in meas["plates"]:
        cv2.polylines(out, [np.array(pl["polygon_px"], np.int32)], True, (255, 255, 255), 1)
    for cr in meas["crystals"]:
        cv2.circle(out, tuple(int(v) for v in cr["centre_px"]), max(1, int(cr["radius_px"])), (255, 255, 0), 1)
    out[masks["moss"] > 0] = (40, 200, 60)
    for lg in meas["legs"]:
        cv2.line(out, tuple(int(v) for v in lg["proximal"]), tuple(int(v) for v in lg["distal"]), (0, 0, 255), 2)
        cv2.circle(out, tuple(int(v) for v in lg["proximal"]), 3, (0, 255, 255), -1)
    c = np.array(meas["centre_px"])
    a = np.array(meas["long_axis_px"])
    cv2.arrowedLine(out, tuple(c.astype(int)), tuple((c + a * meas["length_px"] * 0.45).astype(int)), (0, 128, 255), 2, tipLength=0.08)
    return out


def srgb_to_linear(c):
    c = np.asarray(c, np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def palette(top_img, top_masks, side_img, side_mask):
    """Median colours per material class, sampled from the references (sRGB 0-255 and linear)."""
    out = {}

    def put(name, img, sel, src):
        px = img[sel]
        if len(px) < 20:
            return
        med = np.median(px, 0)[::-1]  # BGR -> RGB
        out[name] = {"srgb": [round(float(v), 1) for v in med], "linear": [round(float(v), 4) for v in srgb_to_linear(med)], "pixels": int(len(px)), "source": src}

    body = top_masks["body"] > 0
    put("plate_top", top_img, body & (top_masks["crystal"] == 0) & (top_masks["moss"] == 0) & (top_masks["cracks"] == 0), "top view: plate pixels")
    put("crystal", top_img, top_masks["crystal"] > 0, "top view: crystal pixels")
    put("moss", top_img, top_masks["moss"] > 0, "top view: moss pixels")
    L, C, H = _lab_lch(side_img)
    hsv = cv2.cvtColor(side_img, cv2.COLOR_BGR2HSV)
    fg = side_mask > 0
    put("ochre", side_img, fg & (hsv[..., 0] >= 8) & (hsv[..., 0] <= 25) & (C >= 18), "persp_a: orange/ochre streak pixels")
    put("stone_shadow", side_img, fg & (L < np.percentile(L[fg], 25)) & (C < 10), "persp_a: darkest quartile of stone")
    put("stone_side", side_img, fg & (L >= np.percentile(L[fg], 35)) & (L <= np.percentile(L[fg], 70)) & (C < 10), "persp_a: mid-tone stone")
    return out
