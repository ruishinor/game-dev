"""Texture synthesis for the cleaned humanoid body (no Blender).

Inputs are the Blender bakes of the clean stage (base colour from the
source, the same from an X-mirrored source, tangent normals, AO and
object-space position). Everything is decided per texel from its 3D
position (glTF frame) and its source colour:

* base garments (crop top, shorts) replace the source's baked clothing,
  harness and pouches with an authored textile: colour from the owner's
  clean-base references, an object-space weave so the pattern is
  continuous across UV islands, mottling, hem/waistband stitching;
* surfaces a removed accessory covered (and that no base garment covers)
  take colour from the mirrored source, i.e. the other side of the body;
* the ceramic shell keeps the source colour with its baked cavity shading
  partly divided out by the AO bake (the source atlas is a projection of
  lit turntable frames, so true albedo is not recoverable; this is an
  inference, recorded as such);
* roughness / metallic / emissive are *inferred* from material classes
  (shell, textile, dark mechanism, optics), not recovered from the source.
"""
from __future__ import annotations

import os

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402


def read_rgb(path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise FileNotFoundError(path)
    if im.ndim == 2:
        im = np.repeat(im[..., None], 3, 2)
    scale = {np.dtype(np.uint8): 255.0, np.dtype(np.uint16): 65535.0}.get(im.dtype, 1.0)
    im = im[..., :3][..., ::-1]
    return im.astype(np.float32) / scale


def write_rgb(path, rgb):
    cv2.imwrite(str(path), (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)[..., ::-1])


def position_gltf(encoded):
    """16-bit position bake -> glTF frame.

    Blender wrote (P + (1, 1, 0.1)) / 2 in its object space (x, y, z); the
    glTF frame is (x, z, -y). Texels outside every UV island stay 0 and are
    reported as NaN.
    """
    empty = np.all(encoded <= 1e-6, axis=-1)
    P = encoded * 2.0 - np.array([1.0, 1.0, 0.1], np.float32)
    out = np.stack([P[..., 0], P[..., 2], -P[..., 1]], -1)
    out[empty] = np.nan
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def value_noise3(P, scale, seed=0):
    """Smooth 3D value noise in [0,1] at lattice spacing `scale` metres."""
    rng = np.random.default_rng(seed)
    lat = rng.random((64, 64, 64)).astype(np.float32)
    q = P / scale
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = np.zeros(P.shape[:-1], np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out += w * lat[(i[..., 0] + dx) % 64, (i[..., 1] + dy) % 64, (i[..., 2] + dz) % 64]
    return out


def fbm(P, scale, octaves=4, seed=0):
    acc, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        acc = acc + amp * value_noise3(P, scale / (2 ** o), seed + o)
        tot += amp
        amp *= 0.5
    return acc / tot


def hsv(rgb):
    return cv2.cvtColor((np.clip(rgb, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32) / [180, 255, 255]


def textile(P, base, *, weave=0.0035, seed=1, wear=0.18):
    """Authored canvas: base colour, object-space weave, mottling and wear."""
    warp = np.sin(2 * np.pi * P[..., 1] / weave)
    weft = np.sin(2 * np.pi * (P[..., 0] + P[..., 2]) / weave)
    thread = 0.5 + 0.25 * (warp * (weft > 0) + weft * (warp <= 0))
    mottle = fbm(P, 0.06, 4, seed)
    grime = smoothstep(0.55, 0.85, fbm(P, 0.12, 3, seed + 7))
    col = np.asarray(base, np.float32)[None, None] * (0.86 + 0.18 * mottle[..., None]) * (0.94 + 0.08 * thread[..., None])
    col = col * (1 - wear * grime[..., None]) + wear * grime[..., None] * np.array([0.33, 0.29, 0.24], np.float32) * 0.6
    rough = 0.86 + 0.08 * mottle
    return col, rough


def stitch_band(y, centre, half, period=0.006):
    """Dark hem band with a dashed stitch line (y-based)."""
    band = 1 - smoothstep(half * 0.6, half, np.abs(y - centre))
    return band


def soft_mask(m, sigma=1.2):
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), sigma)


def mechanism_mask(pos, covered, L, cfg):
    """Texels that are genuine mechanism and keep their dark source colour:
    coupling bands around the elbow/wrist/knee/ankle pivots (measured along
    the limb axis), the neck mechanism, the central abdominal struts, the
    optical units in the ring and the soles. Everything else on the shell is
    ceramic."""
    m = np.zeros(pos.shape[:2], bool)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    mc = cfg["mechanism"]
    chains = {"lowerarm": ("upperarm", "hand"), "hand": ("lowerarm", "hand_tip"),
              "calf": ("thigh", "foot"), "foot": ("calf", "ball")}
    for joint, half in mc["couplings"].items():
        prev, nxt = chains[joint]
        for s in ("l", "r"):
            J = np.asarray(L[f"{joint}_{s}"])
            axis = np.asarray(L[f"{nxt}_{s}"]) - np.asarray(L[f"{prev}_{s}"])
            axis /= np.linalg.norm(axis)
            d = pos - J
            along = d @ axis
            radial = np.linalg.norm(d - along[..., None] * axis, axis=-1)
            m |= (np.abs(along) < half) & (radial < mc["coupling_radius"])
    n = mc["neck"]
    m |= (y > n["y"][0]) & (y < n["y"][1]) & (np.abs(x) < n["max_abs_x"])
    a = mc.get("abdomen")
    if a:
        m |= (y > a["y"][0]) & (y < a["y"][1]) & (np.abs(x) < a["max_abs_x"])
    for e in mc["optics"]:
        m |= np.linalg.norm(pos - np.asarray(e), axis=-1) < mc["optic_radius"]
    m |= y < mc["sole_height"]
    return m & covered


def synthesize(paths, cfg, kit_points, landmarks=None):
    """Build base colour, ORM, normal and emissive maps. Returns dict of arrays + report."""
    col = read_rgb(paths["color"])
    donor = read_rgb(paths["donor"])
    ao = read_rgb(paths["ao"])[..., 0]
    nrm = read_rgb(paths["normal"])
    pos = position_gltf(read_rgb(paths["position"]))
    covered = np.isfinite(pos).all(-1)
    pos = np.where(covered[..., None], pos, 0.0).astype(np.float32)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    # bake misses keep the sentinel colour: take the mirrored donor there, else inpaint
    def sentinel(im):
        # bake margins blend the sentinel with real texels, so test by hue, not equality
        # (the earthy source palette has no hues near magenta, 270-340 degrees)
        h = hsv(im)
        return (h[..., 0] > 0.75) & (h[..., 0] < 0.95) & (h[..., 1] > 0.3) & (h[..., 2] > 0.25)
    miss = sentinel(col) & covered
    donor_ok = ~sentinel(donor)
    col[miss & donor_ok] = donor[miss & donor_ok]
    still = sentinel(col) & covered
    if still.any():
        u8 = (np.clip(col, 0, 1) * 255).astype(np.uint8)
        col = cv2.inpaint(u8, still.astype(np.uint8), 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
    dmiss = sentinel(donor)
    donor[dmiss] = col[dmiss]
    lum = col @ np.array([0.3, 0.59, 0.11], np.float32)
    H = hsv(col)
    ivory = (lum > cfg.get("ivory_luminance", 0.5)) & (H[..., 1] < 0.42)

    # distance (in metres) to the nearest surface point an accessory was removed from
    kit_d = np.full(pos.shape[:2], 9.0, np.float32)
    if len(kit_points):
        tree = cKDTree(kit_points)
        ids = np.nonzero(covered)
        kit_d[ids] = tree.query(pos[ids], distance_upper_bound=0.05)[0].astype(np.float32)
        kit_d[~np.isfinite(kit_d)] = 9.0
    kit = 1 - smoothstep(0.004, 0.014, kit_d)

    g = cfg["garments"]
    hand_x = cfg.get("hand_x", 0.26)
    not_hand = np.abs(x) < hand_x
    top = g["top"]
    in_top = (y > top["y"][0]) & (y < top["y"][1]) & (np.abs(x) < top["max_abs_x"]) & not_hand
    # the whole band below the neckline is garment (light harness straps included);
    # above it only non-shell texels are
    top_m = in_top & ((y < top["neckline"]) | ~ivory | (kit > 0.3))
    sh = g["shorts"]
    in_sh = (y > sh["hem"]) & (y < sh["waist"]) & not_hand
    sh_m = in_sh
    # soften mask edges in UV space (masks are evaluated per texel, islands are small)
    soft = lambda m: cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)
    top_w, sh_w = soft(top_m), soft(sh_m)

    out = col.copy()
    # 1) shell / mechanism: partial removal of baked cavity shading
    k = cfg.get("ao_unshade", 0.45)
    unshade = np.clip(1.0 / (1 - k + k * np.clip(ao, 0.05, 1)), 1.0, 1.0 / (1 - k))
    lit = np.clip(out * np.where(ivory, unshade, 1 + 0.4 * (unshade - 1))[..., None], 0, 1)
    # warm the shell toward the reference ivory and compress the projection's
    # baked highlights/streaks, keeping a share of the source variation
    iv = np.asarray(cfg.get("ivory_color", [0.84, 0.78, 0.68]), np.float32)
    L = lit @ np.array([0.3, 0.59, 0.11], np.float32)
    Lm = float(np.median(L[ivory & covered])) if (ivory & covered).any() else 0.7
    rel = np.clip(L / max(Lm, 1e-3), 0.5, 1.25) ** 0.6
    warm = iv[None, None] * rel[..., None]
    a = cfg.get("ivory_blend", 0.55) * soft_mask(ivory)
    out = lit * (1 - a[..., None]) + warm * a[..., None]
    # 2) donor colour where an accessory covered body that no base garment covers
    use_donor = kit * (1 - np.maximum(top_w, sh_w))
    out = out * (1 - use_donor[..., None]) + donor * use_donor[..., None]
    # 2b) ceramic shell: every dark blotch that is not mechanism becomes ivory.
    # The source's dark streaks on the shell read as damage; the owner asked
    # for a clean, smoothly varying ivory there (2026-11-19). This runs after
    # the donor step, because the mirrored donor carries the same streaks.
    # The fill is the local average of the surrounding ivory (normalised
    # convolution in UV space), so tone still varies gently across the body.
    # Genuine mechanism (joint couplings, neck column, soles) is repainted as
    # one clean graphite with only gentle shading kept, so it reads as a
    # deliberate seam rather than grime.
    shell_clean = np.zeros(pos.shape[:2], np.float32)
    mech_w = np.zeros(pos.shape[:2], np.float32)
    if landmarks is not None and cfg.get("mechanism"):
        mc = cfg["mechanism"]
        keep = mechanism_mask(pos, covered, landmarks, cfg)
        optic_keep = np.zeros_like(keep)
        for e in mc["optics"]:
            optic_keep |= np.linalg.norm(pos - np.asarray(e), axis=-1) < mc["optic_radius"]
        optic_keep &= covered
        garment = np.maximum(top_w, sh_w) > 0.5
        target = covered & ~keep & ~garment
        Lo = out @ np.array([0.3, 0.59, 0.11], np.float32)
        Lmed = max(float(np.median(Lo[ivory & covered])), 1e-3)
        clean_src = ivory & covered & ~keep & ~garment & (Lo / Lmed > mc.get("dark_hi", 0.93))
        ivw = clean_src.astype(np.float32)
        fill = np.zeros_like(out)
        for sigma in (6, 18, 48):
            num = cv2.GaussianBlur(out * ivw[..., None], (0, 0), sigma)
            den = cv2.GaussianBlur(ivw, (0, 0), sigma)[..., None]
            est = num / np.maximum(den, 1e-4)
            fill = np.where((fill.sum(-1, keepdims=True) == 0) & (den > 0.15), est, fill)
        fill = np.where(fill.sum(-1, keepdims=True) == 0, iv[None, None], fill)
        fill = cv2.GaussianBlur(fill, (0, 0), 3)
        dark = smoothstep(mc.get("dark_hi", 0.93), mc.get("dark_lo", 0.74), Lo / Lmed)
        # dilate the dark mask a little so streak fringes go too
        dark = np.maximum(dark, cv2.GaussianBlur(dark, (0, 0), 1.5) * 1.6).clip(0, 1)
        shell_clean = soft_mask(target, 2.0) * dark
        out = out * (1 - shell_clean[..., None]) + fill * shell_clean[..., None]
        # mechanism: uniform graphite, gentle shading only
        mcol = np.asarray(mc.get("color", [0.16, 0.14, 0.13]), np.float32)
        Lk = Lo[keep & ~optic_keep]
        kmed = max(float(np.median(Lk)), 1e-3) if Lk.size else 0.2
        rel_m = np.clip(cv2.GaussianBlur(Lo, (0, 0), 2) / kmed, 0.8, 1.25)
        mech = mcol[None, None] * rel_m[..., None]
        mech_w = soft_mask(keep & ~optic_keep & ~garment, 1.5)
        out = out * (1 - mech_w[..., None]) + mech * mech_w[..., None]
        keep_frac = float(keep[covered].mean())
    else:
        keep_frac = 0.0
    # 3) authored base garments
    tcol, trough = textile(pos, top["color"], seed=11)
    scol, srough = textile(pos, sh["color"], seed=23)
    # hems and waistband: darker bands
    hem_top = stitch_band(y, top["y"][0] + 0.008, 0.009)
    tcol *= (1 - 0.18 * hem_top)[..., None]
    wb = stitch_band(y, sh["waist"] - 0.016, 0.016)
    hem_sh = stitch_band(y, sh["hem"] + 0.008, 0.009)
    scol *= (1 - 0.14 * np.maximum(wb, hem_sh))[..., None]
    stitch = (np.abs(y - (sh["waist"] - 0.03)) < 0.0012) & (np.sin(2 * np.pi * (x + z) / 0.006) > 0.2)
    scol[stitch] *= 0.62
    garment_ao = (0.55 + 0.45 * ao)[..., None]  # authored textile has no baked shading of its own
    out = out * (1 - top_w[..., None]) + tcol * garment_ao * top_w[..., None]
    out = out * (1 - sh_w[..., None]) + scol * garment_ao * sh_w[..., None]

    # inferred PBR channels
    textile_w = np.maximum(top_w, sh_w)
    lum2 = out @ np.array([0.3, 0.59, 0.11], np.float32)
    dirt = np.clip((cv2.GaussianBlur(lum2, (0, 0), 6) - lum2) * 4, 0, 1)
    dark_mech = (mech_w > 0.5) if landmarks is not None and cfg.get("mechanism") else ((~ivory) & (lum < 0.33))
    H2 = hsv(col)
    optics = (y > cfg.get("optics_min_y", 1.6)) & (H2[..., 0] > 0.03) & (H2[..., 0] < 0.13) & (H2[..., 1] > 0.45) & (H2[..., 2] > 0.35)
    optics = soft(optics) > 0.35
    rough = np.where(~dark_mech, 0.52 + 0.3 * dirt, np.where(dark_mech, 0.58, 0.64))
    metal = np.where(dark_mech, 0.35, 0.0)
    rough = rough * (1 - textile_w) + 0.9 * textile_w
    metal = metal * (1 - textile_w)
    rough = np.where(optics, 0.18, rough)
    metal = np.where(optics, 0.0, metal)
    orm = np.stack([np.clip(0.35 + 0.65 * ao, 0, 1), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)], -1)
    emis = np.where(optics[..., None], col * cfg.get("optics_emission", 0.8), 0.0)
    # flatten normal detail on authored textile (the source bumps there were accessories)
    flat = np.array([0.5, 0.5, 1.0], np.float32)
    nrm = nrm * (1 - 0.7 * textile_w[..., None]) + flat * 0.7 * textile_w[..., None]
    out[~covered] = 0.5
    # optional painted livery (owner direction 2026-11-21, vendor): the shell
    # repainted a clean white and everything that is not shell (base garments,
    # mechanism) ebony, keeping only the gentle shading of each class; optics
    # keep their colour. Same UVs, ORM and normal map as the base body.
    paint = None
    pc = cfg.get("paint")
    if pc:
        lum_o = out @ np.array([0.3, 0.59, 0.11], np.float32)
        shell_w = np.clip(1 - np.maximum(textile_w, (mech_w if landmarks is not None and cfg.get("mechanism") else dark_mech.astype(np.float32))), 0, 1)
        sm = max(float(np.median(lum_o[(shell_w > 0.9) & covered])), 1e-3)
        rel_s = np.clip(cv2.GaussianBlur(lum_o, (0, 0), 2) / sm, *pc.get("shell_range", [0.78, 1.08]))
        dk = (shell_w < 0.1) & covered & ~optics
        dm = max(float(np.median(lum_o[dk])), 1e-3) if dk.any() else 0.2
        rel_d = np.clip(cv2.GaussianBlur(lum_o, (0, 0), 2) / dm, 0.8, 1.3)
        white = np.asarray(pc["shell"], np.float32)[None, None] * rel_s[..., None]
        ebony = np.asarray(pc["ebony"], np.float32)[None, None] * rel_d[..., None]
        paint = white * shell_w[..., None] + ebony * (1 - shell_w[..., None])
        paint = np.where(optics[..., None], out, paint)
        paint[~covered] = 0.5
    report = {
        "covered_fraction": float(covered.mean()),
        "bake_misses_filled": int(miss.sum()),
        "shell_texels_cleaned_to_ivory": float((shell_clean > 0.5)[covered].mean()),
        "mechanism_texels_kept": keep_frac,
        "texel_fractions": {
            "crop_top": float((top_w > 0.5)[covered].mean()), "shorts": float((sh_w > 0.5)[covered].mean()),
            "donor": float((use_donor > 0.5)[covered].mean()), "shell": float(ivory[covered].mean()),
            "dark_mechanism": float(dark_mech[covered].mean()), "optics": float(optics[covered].mean()),
        },
        "method": {
            "base_colour": "source projection atlas re-baked onto the new UVs; shell cavity shading partly divided out with AO (k=%.2f); garments authored" % k,
            "roughness_metallic": "inferred from material classes, not recovered",
            "emissive": "optics mask x source colour x %.2f" % cfg.get("optics_emission", 0.8),
        },
    }
    maps = {"basecolor": out, "orm": orm, "normal": nrm, "emissive": emis, "masks": np.stack([top_w, sh_w, use_donor], -1)}
    if paint is not None:
        maps["basecolor_paint"] = np.clip(paint, 0, 1)
        report["paint"] = {"shell": list(pc["shell"]), "ebony": list(pc["ebony"]), "method": "shell recoloured with its own relative shading; garments and mechanism ebony; optics kept"}
    return maps, report
