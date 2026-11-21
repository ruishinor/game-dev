"""Closed-solid parts for hard-surface armour beyond plates: swept tubes
(tendrils, cables, hoses), straps that follow a map surface, boxes
(pouches, instrument housings), faceted gems and lens rings.

Every builder returns (V, F) in glTF space; `parts_piece` wraps one or more
of them as a multi-part design piece for the hard-surface build (bevelled
there, skinned by the piece's weight policy in the rig stage)."""

import numpy as np


def _frame(t, hint):
    t = t / np.linalg.norm(t)
    h = np.asarray(hint, float)
    n = h - t * (h @ t)
    if np.linalg.norm(n) < 1e-6:
        n = np.cross(t, [1.0, 0, 0] if abs(t[0]) < 0.9 else [0, 1.0, 0])
    n /= np.linalg.norm(n)
    return t, n, np.cross(t, n)


def tube(path, radius, sides=8, normals=None, flat=1.0, caps=True, twist=0.0, phase=0.0):
    """Sweep a (possibly elliptical: `flat` = height/width) section along a
    polyline. `radius` scalar or per-point; `normals` orient the section's
    height axis (e.g. the body normal under a strap); parallel transport
    otherwise."""
    P = np.asarray(path, float)
    n = len(P)
    R = np.broadcast_to(np.asarray(radius, float), (n,))
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    frames = []
    prev = None
    for i in range(n):
        hint = normals[i] if normals is not None else (prev if prev is not None else np.cross(T[i], [0, 0, 1.0]) + 1e-3)
        t, u, w = _frame(T[i], hint)
        frames.append((u, w))
        prev = u
    ph = np.linspace(0, 2 * np.pi, sides, endpoint=False) + phase
    V = []
    for i in range(n):
        u, w = frames[i]
        a = ph + twist * i / max(n - 1, 1)
        V += list(P[i] + R[i] * (np.outer(np.sin(a) * flat, u) + np.outer(np.cos(a), w)))
    F = []
    for i in range(n - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c, d = a + sides, b + sides
            F += [(a, c, b), (b, c, d)]
    V = np.array(V)
    if caps:
        c0, c1 = len(V), len(V) + 1
        V = np.vstack([V, P[0], P[-1]])
        for k in range(sides):
            F.append((c0, k, (k + 1) % sides))
            F.append((c1, (n - 1) * sides + (k + 1) % sides, (n - 1) * sides + k))
    return _outward(V, np.array(F))


def strap(m, pts_ab, width, thickness, off, samples=6):
    """A flat band lying on map `m` along (a, b) points: rectangular section
    whose height axis is the surface normal."""
    seq = list(pts_ab)
    P, N = [], []
    for (a0, b0), (a1, b1) in zip(seq[:-1], seq[1:]):
        for k in range(samples):
            f = k / samples
            a, b = a0 + (a1 - a0) * f, b0 + (b1 - b0) * f
            P.append(m.point(a, b, off + thickness / 2))
            N.append(m.normal(a, b, off))
    P.append(m.point(*seq[-1], off + thickness / 2))
    N.append(m.normal(*seq[-1], off))
    # a 4-sided tube rotated 45 deg is a rectangle: width across, thickness up
    # a 4-sided section at 45 deg is a rectangle: half-diagonal = width / sqrt 2
    return tube(P, width / np.sqrt(2), sides=4, normals=N, flat=thickness / width, caps=True, phase=np.pi / 4)


def oriented_box(centre, size, normal, along):
    """Box: size = (along, across, height above `normal`), centred on `centre`."""
    t, n, w = _frame(np.asarray(along, float), normal)
    hx, hy, hz = np.asarray(size, float) / 2
    V = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                V.append(centre + t * sx * hx + w * sy * hy + n * sz * hz)
    V = np.array(V)
    # quads, so the bevel rounds the box edges and nothing else
    F = np.array([[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]])
    return _outward(V, F)


def gem(centre, normal, along, width, height, depth, sides=6):
    """Faceted prism crystal: a `sides`-gon girdle, a low crown and a pointed
    pavilion into the mount (normal points out of the armour)."""
    t, n, w = _frame(np.asarray(along, float), normal)
    ph = np.linspace(0, 2 * np.pi, sides, endpoint=False) + np.pi / sides
    girdle = [centre + n * depth * 0.25 + t * np.cos(a) * height / 2 + w * np.sin(a) * width / 2 for a in ph]
    crown = [centre + n * depth * 0.62 + t * np.cos(a) * height * 0.28 + w * np.sin(a) * width * 0.28 for a in ph]
    V = np.array(girdle + crown + [centre + n * depth * 0.7, centre - n * depth * 0.2])
    top, bot = 2 * sides, 2 * sides + 1
    F = []
    for k in range(sides):
        k1 = (k + 1) % sides
        F += [(k, k1, sides + k1), (k, sides + k1, sides + k), (sides + k, sides + k1, top), (k1, k, bot)]
    return _outward(V, np.array(F))


def ring(centre, normal, r_out, r_in, height, sides=24):
    """Lens bezel / torus-like flat ring standing `height` above the surface."""
    _, n, _ = _frame(np.asarray(normal, float), [0, 1.0, 0.3])
    t, u, w = _frame(np.asarray(normal, float), [0.0, 1.0, 0.3])
    ph = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    circ = np.outer(np.cos(ph), u) + np.outer(np.sin(ph), w)
    nn = np.asarray(normal, float) / np.linalg.norm(normal)
    V = np.vstack([centre + circ * r_out, centre + circ * r_out + nn * height,
                   centre + circ * r_in + nn * height, centre + circ * r_in])
    F = []
    for q in range(4):
        q1 = (q + 1) % 4
        for k in range(sides):
            k1 = (k + 1) % sides
            F += [(q * sides + k, q1 * sides + k, q1 * sides + k1), (q * sides + k, q1 * sides + k1, q * sides + k1)]
    return _outward(V, np.array(F))


def disc(centre, normal, r, height, sides=24):
    """Lens: a shallow dome disc (for the translucent layer)."""
    t, u, w = _frame(np.asarray(normal, float), [0.0, 1.0, 0.3])
    nn = np.asarray(normal, float) / np.linalg.norm(normal)
    ph = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    circ = np.outer(np.cos(ph), u) + np.outer(np.sin(ph), w)
    V = np.vstack([centre + circ * r, centre + circ * r * 0.6 + nn * height * 0.75, [centre + nn * height], [centre - nn * 0.001]])
    top, bot = 2 * sides, 2 * sides + 1
    F = []
    for k in range(sides):
        k1 = (k + 1) % sides
        F += [(k, k1, sides + k1), (k, sides + k1, sides + k), (sides + k, sides + k1, top), (k1, k, bot)]
    return _outward(V, np.array(F))


def _outward(V, F):
    """Flip faces whose normal points toward the part's centroid."""
    c = V.mean(0)
    a, b, d = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    nrm = np.cross(b - a, d - a)
    inward = np.einsum("ij,ij->i", nrm, V[F].mean(1) - c) < 0
    F = F.copy()
    F[inward] = F[inward][:, ::-1]
    return V, F


def parts_piece(item, name, mat, parts, *, weights=None, weight_mode=None, bevel=0.0008, segs=1, layer=None, flow=None):
    """Wrap closed parts as one multi-part design piece. `layer="glass"`
    routes it to the translucent mesh; `flow` = per-part (origin, scale)
    makes it an emissive channel strip instead (UV.x = distance)."""
    out = {"name": f"{item}__{name}", "set": item, "mat": mat, "V": [(np.asarray(v), np.asarray(f)) for v, f in parts], "F": None, "multi": True,
           "core": True, "hs": True, "thickness": 0.0, "bevel": bevel, "bevel_segments": segs, "grooves": [], "holes": [], "bolts": [],
           "relax": False, "gap": 0.0, "even": False}
    if weights:
        out["weights"] = weights
    if weight_mode:
        out["weight_mode"] = weight_mode
    if layer:
        out["layer"] = layer
    return out


def fx_strip(path, radius, origin, scale, sides=6):
    """JSON-ready emissive tube for a piece's `fx_strips` list."""
    V, F, N, UV = channel_tube(path, radius, origin, scale, sides)
    return {"V": V.tolist(), "F": F.tolist(), "N": N.tolist(), "UV": UV.tolist()}


def channel_tube(path, radius, origin, scale, sides=6):
    """An emissive tube (capillary, conduit) for the FX mesh: returns arrays
    with flow UVs (UV.x = distance from `origin` / scale, UV.y around)."""
    V, F = tube(path, radius, sides=sides, caps=False)
    P = np.asarray(path, float)
    n = len(P)
    flow = np.minimum(0.999, np.linalg.norm(P - np.asarray(origin, float), axis=1) / scale)
    UV = np.array([(flow[i], (k / sides)) for i in range(n) for k in range(sides)])
    N = V - np.repeat(P, sides, axis=0)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return V, F, N, UV
