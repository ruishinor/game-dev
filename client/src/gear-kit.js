// Signature equipment for the four profession looks (EQP-001 reservoir family
// and its relatives). Presentation only.
//
// Built in bind-pose model space (T-pose, facing +Z, feet at y = 0, left at +X),
// like the rest of looks.js, then handed to bones. Each look's static gear is
// merged into one mesh per (bone, material), built once per look and shared by
// every character wearing it; only the animated parts (reservoir fluid and
// charge segments) get per-character materials.
//
// THREE is injected so the geometry rules can be tested in Node; canvas paint
// textures are optional (absent in Node, generated once in the browser).

const TAU = Math.PI * 2;

// --- small deterministic helpers -------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Merge geometries that all carry position/normal/uv into one non-indexed geometry. */
export function mergeGeometries(THREE, list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.getAttribute('position').count;
  const out = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), uv: new Float32Array(n * 2) };
  let o = 0;
  for (const g of parts) {
    const c = g.getAttribute('position').count;
    for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const a = g.getAttribute(k);
      if (a) out[k].set(a.array.subarray(0, c * size), o * size);
    }
    o += c;
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== list[i]) parts[i].dispose();
  }
  const g = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2]]) g.setAttribute(k, new THREE.BufferAttribute(out[k], size));
  g.computeBoundingSphere();
  return g;
}

// --- paint textures (browser only) ------------------------------------------------

/**
 * Worn industrial paint: base colour, panel seams, chipped edges exposing metal,
 * grime at the bottom, optional hazard band, stencil code or medical cross.
 * Returns { map, roughnessMap } or null without a DOM.
 */
export function paintTexture(THREE, key, { base = '#7a6a58', metal = '#9aa0a2', seams = true, hazard = false, cross = false, stencil = '', seed = 1 } = {}) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // mottled tone
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.04})`;
    const s = 6 + r() * 30;
    g.fillRect(r() * size, r() * size, s, s * (0.3 + r()));
  }
  if (hazard) {
    g.save();
    g.beginPath();
    g.rect(0, size * 0.72, size, size * 0.14);
    g.clip();
    for (let x = -size; x < size * 2; x += 28) {
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.moveTo(x, size * 0.72);
      g.lineTo(x + 14, size * 0.72);
      g.lineTo(x + 14 + size * 0.14, size * 0.86);
      g.lineTo(x + size * 0.14, size * 0.86);
      g.fill();
    }
    g.restore();
  }
  if (cross) {
    g.fillStyle = '#efe9df';
    g.fillRect(size * 0.36, size * 0.18, size * 0.28, size * 0.28);
    g.fillStyle = '#b2242a';
    g.fillRect(size * 0.46, size * 0.21, size * 0.08, size * 0.22);
    g.fillRect(size * 0.39, size * 0.28, size * 0.22, size * 0.08);
  }
  if (stencil) {
    g.fillStyle = 'rgba(230,226,214,0.75)';
    g.font = `bold ${size * 0.09}px monospace`;
    g.fillText(stencil, size * 0.08, size * 0.62);
  }
  if (seams) {
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2;
    for (const y of [0.25, 0.5, 0.92]) {
      g.beginPath();
      g.moveTo(0, size * y);
      g.lineTo(size, size * y);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (const [x, y] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.44], [0.94, 0.44]]) {
      g.beginPath();
      g.arc(size * x, size * y, 3, 0, TAU);
      g.fill();
    }
  }
  // chipped paint showing bare metal, concentrated near edges
  const rough = document.createElement('canvas');
  rough.width = rough.height = size;
  const rg = rough.getContext('2d');
  rg.fillStyle = '#b4b4b4';
  rg.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const edge = r() < 0.7;
    const x = edge ? (r() < 0.5 ? r() * 18 : size - r() * 18) : r() * size;
    const y = r() * size;
    const w = 1 + r() * 7;
    const h = 1 + r() * 4;
    g.fillStyle = metal;
    g.globalAlpha = 0.5 + r() * 0.5;
    g.fillRect(x, y, w, h);
    rg.fillStyle = '#4a4a4a';
    rg.fillRect(x, y, w, h);
  }
  g.globalAlpha = 1;
  // scratches
  g.strokeStyle = 'rgba(220,220,215,0.25)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = r() * size;
    const y = r() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12);
    g.stroke();
  }
  // grime at the bottom
  const grd = g.createLinearGradient(0, size * 0.7, 0, size);
  grd.addColorStop(0, 'rgba(30,24,18,0)');
  grd.addColorStop(1, 'rgba(30,24,18,0.45)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.name = key;
    return t;
  };
  return { map: tex(c, true), roughnessMap: tex(rough, false) };
}

// --- shaders ----------------------------------------------------------------------

const FLUID_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 q = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -q.xyz; gl_Position = projectionMatrix * q; }`;
// kind 0 kinetic plasma, 1 culture strands, 2 bubbling culture, 3 particulate, 4 power cell
const FLUID_FS = `uniform vec3 color; uniform float fill, t, energy, kind;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float y = vUv.y;
  float surf = fill + 0.018 * sin(vUv.x * 25.13 + t * 3.0);
  if (y > surf + 0.01) discard;
  vec2 g = vec2(vUv.x * 10.0, y * 12.0 - t * (0.6 + energy * 1.8));
  vec2 id = floor(g); vec2 f = fract(g) - 0.5; float h = hash(id);
  float bub = h > 0.72 ? smoothstep(0.2, 0.06, length(f + vec2((h - 0.86) * 0.8, 0.0))) : 0.0;
  float strands = 0.5 + 0.5 * sin(vUv.x * 18.85 + y * 7.0 + sin(y * 11.0 - t * 0.8) * 1.6);
  float grain = step(0.86, hash(floor(vec2(vUv.x * 40.0, y * 46.0 - t * 0.5))));
  float plasma = 0.5 + 0.5 * sin(y * 30.0 - t * 9.0 * (0.3 + energy));
  float pattern = kind < 0.5 ? plasma * 0.6 + bub * 0.4 : kind < 1.5 ? pow(strands, 3.0) : kind < 2.5 ? bub : kind < 3.5 ? grain : plasma * 0.3 + bub;
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float depth = 0.45 + 0.55 * clamp(y / max(fill, 0.01), 0.0, 1.0);
  float men = smoothstep(0.035, 0.0, abs(y - surf));
  float glow = 0.3 + 0.7 * energy;
  vec3 c = color * glow * (depth * 0.75 + rim * 0.5) + color * pattern * 0.75 * glow + vec3(1.0) * men * 0.55 * glow;
  gl_FragColor = vec4(c, 1.0);
}`;
const SEG_VS = `attribute float seg; varying float vSeg; varying vec2 vUv; void main(){ vSeg = seg; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SEG_FS = `uniform vec3 color; uniform float level, count, t;
varying float vSeg; varying vec2 vUv;
void main(){
  float on = step(vSeg + 0.5, level * count);
  float top = step(level * count - 1.0, vSeg) * on;
  float pulse = 0.75 + 0.25 * sin(t * 6.0);
  vec3 off = color * 0.08;
  gl_FragColor = vec4(mix(off, color * mix(1.0, pulse * 1.4, top), on), 1.0);
}`;
// A resonance core: concentric standing rings and a bright centre.
const CORE_FS = `uniform vec3 color; uniform float t, energy;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float rings = 0.5 + 0.5 * sin(r * 26.0 - t * (2.0 + energy * 4.0));
  float centre = exp(-r * r * 9.0);
  float spokes = pow(0.5 + 0.5 * sin(atan(p.y, p.x) * 6.0 + t * 0.7), 8.0) * (1.0 - r);
  float glow = 0.35 + 0.65 * energy;
  vec3 c = color * glow * (0.25 + rings * 0.55 * (1.0 - r * 0.6) + spokes * 0.6) + mix(color, vec3(1.0), 0.7) * centre * (0.6 + 0.6 * energy);
  gl_FragColor = vec4(c, 1.0);
}`;

// --- kit --------------------------------------------------------------------------

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export function createGearKit(THREE, { shared = (x) => x } = {}) {
  const geoCache = new Map();
  const matCache = new Map();
  const lookCache = new Map();
  const cached = (key, make) => {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  };

  // Geometry primitives (unit-free, metres).
  const prim = {
    /** Box with rounded, bevelled edges. */
    block(w, h, d, r = Math.min(w, h, d) * 0.18) {
      return cached(`block:${w}:${h}:${d}:${r}`, () => {
        r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
        const s = new THREE.Shape();
        const x = -w / 2 + r;
        const y = -h / 2 + r;
        const W = w - 2 * r;
        const H = h - 2 * r;
        s.moveTo(x, -h / 2);
        s.lineTo(x + W, -h / 2);
        s.quadraticCurveTo(w / 2, -h / 2, w / 2, y);
        s.lineTo(w / 2, y + H);
        s.quadraticCurveTo(w / 2, h / 2, x + W, h / 2);
        s.lineTo(x, h / 2);
        s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y + H);
        s.lineTo(-w / 2, y);
        s.quadraticCurveTo(-w / 2, -h / 2, x, -h / 2);
        const depth = Math.max(1e-3, d - 2 * r * 0.6);
        const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.5, bevelSegments: 2, curveSegments: 3 });
        g.translate(0, 0, -depth / 2);
        // planar UVs from x/y so paint maps sit on the faces
        const p = g.getAttribute('position');
        const uv = g.getAttribute('uv');
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
        g.computeVertexNormals();
        return g;
      });
    },
    /** Revolved profile [[radius, y], ...] around Y. */
    lathe(profile, segs = 20) {
      return cached(`lathe:${segs}:${profile.join(';')}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs));
    },
    cyl(r, h, segs = 16, open = false) {
      return cached(`cyl:${r}:${h}:${segs}:${open}`, () => new THREE.CylinderGeometry(r, r, h, segs, 1, open));
    },
    torus(R, r, segs = 20, arc = TAU) {
      return cached(`torus:${R}:${r}:${segs}:${arc}`, () => new THREE.TorusGeometry(R, r, 6, segs, arc));
    },
    disc(r, segs = 24) {
      return cached(`disc:${r}:${segs}`, () => new THREE.CircleGeometry(r, segs));
    },
    hose(points, r = 0.012) {
      return cached(`hose:${r}:${points.flat().map((v) => v.toFixed(3)).join(',')}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 20, r, 6, false));
    },
  };

  // Shared static materials.
  function paint(key, opts, extra = {}) {
    return mat(`paint:${key}`, () => {
      const t = paintTexture(THREE, key, opts);
      return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.35, map: t?.map || null, roughnessMap: t?.roughnessMap || null, ...(t ? {} : { color: new THREE.Color(opts.base || '#888888') }), ...extra });
    });
  }
  function mat(key, make) {
    if (!matCache.has(key)) {
      const m = make();
      m.name = `gear:${key}`;
      matCache.set(key, shared(m));
    }
    return matCache.get(key);
  }
  const M = {
    steel: () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x7c868c, metalness: 0.85, roughness: 0.38 })),
    darkSteel: () => mat('darkSteel', () => new THREE.MeshStandardMaterial({ color: 0x353b40, metalness: 0.75, roughness: 0.48 })),
    chrome: () => mat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 1, roughness: 0.16 })),
    brass: () => mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.35 })),
    rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1d2022, metalness: 0, roughness: 0.92 })),
    glass: () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xcfe6ea, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false })),
    lamp: (hex) => mat(`lamp:${hex}`, () => new THREE.MeshBasicMaterial({ color: hex })),
    paint,
  };

  /**
   * Build (or reuse) the static meshes for a look. `recipe(b)` places parts
   * with b.add(bone, geometry, material, [x,y,z], [rx,ry,rz], [sx,sy,sz]) and
   * declares animated parts with b.fluid(...) / b.segments(...) / b.core(...).
   */
  function build(lookId, recipe, variant = {}) {
    const armK = Number.isFinite(variant.armK) && variant.armK > 0.5 && variant.armK < 2 ? variant.armK : 1;
    const cacheKey = armK === 1 ? lookId : `${lookId}@${armK.toFixed(3)}`;
    if (lookCache.has(cacheKey)) return lookCache.get(cacheKey);
    // Gear authored for one frame, moved along the arm for the other (shoulder at x ~0.17).
    const armX = (bone, x) => (armK !== 1 && /^(upperarm|lowerarm|hand)_/.test(bone) ? Math.sign(x) * (0.17 + (Math.abs(x) - 0.17) * armK) : x);
    const buckets = new Map();
    const dynamic = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const place = (geo, at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
      const g = geo.clone();
      e.set(rot[0], rot[1], rot[2]);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(...at), q, new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
      g.applyMatrix4(m4);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      return g;
    };
    const b = {
      prim,
      M,
      add(bone, geo, material, at, rot, scale) {
        const key = `${bone}|${material.name}`;
        if (!buckets.has(key)) buckets.set(key, { bone, material, list: [] });
        const p = at ? [armX(bone, at[0]), at[1], at[2]] : at;
        buckets.get(key).list.push(place(geo, p, rot, scale));
      },
      /** A fluid column (inside a reservoir) driven by the owner's state. */
      fluid(bone, r, h, at, rot, opts) {
        dynamic.push({ type: 'fluid', bone, geometry: shared(place(prim.cyl(r, h, 18, false), at, rot)), opts });
      },
      /** A column of `count` indicator segments lit up to the owner's level. */
      segments(bone, count, w, h, gap, at, rot, color) {
        const list = [];
        for (let i = 0; i < count; i++) {
          const g = new THREE.BoxGeometry(w, h, w * 0.6).toNonIndexed();
          g.translate(0, i * (h + gap), 0);
          const n = g.getAttribute('position').count;
          g.setAttribute('seg', new THREE.BufferAttribute(new Float32Array(n).fill(i), 1));
          list.push(g);
        }
        const merged = new THREE.BufferGeometry();
        const total = list.reduce((s, g) => s + g.getAttribute('position').count, 0);
        const pos = new Float32Array(total * 3);
        const seg = new Float32Array(total);
        const uv = new Float32Array(total * 2);
        let o = 0;
        for (const g of list) {
          const c = g.getAttribute('position').count;
          pos.set(g.getAttribute('position').array, o * 3);
          seg.set(g.getAttribute('seg').array, o);
          o += c;
          g.dispose();
        }
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        merged.setAttribute('seg', new THREE.BufferAttribute(seg, 1));
        merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        dynamic.push({ type: 'segments', bone, geometry: shared(place(merged, at, rot)), opts: { count, color } });
        merged.dispose();
      },
      /** A flat resonance core disc facing local -Z. */
      core(bone, r, at, rot, color) {
        dynamic.push({ type: 'core', bone, geometry: shared(place(prim.disc(r, 32), at, rot)), opts: { color } });
      },
    };
    recipe(b);
    const statics = [];
    for (const { bone, material, list } of buckets.values()) {
      const g = shared(mergeGeometries(THREE, list));
      for (const x of list) x.dispose();
      statics.push({ bone, material, geometry: g });
    }
    const built = { statics, dynamic };
    lookCache.set(cacheKey, built);
    return built;
  }

  /**
   * Attach a look's gear to a character via ctx.attach(bone, object).
   * Returns an updater (st) => void for the animated parts, or null.
   */
  function instantiate(lookId, recipe, ctx, variant = {}) {
    const built = build(lookId, recipe, variant);
    for (const s of built.statics) {
      const mesh = new THREE.Mesh(s.geometry, s.material);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `gear:${lookId}:${s.bone}`;
      ctx.attach(s.bone, mesh);
    }
    const uniforms = [];
    for (const d of built.dynamic) {
      let material;
      if (d.type === 'fluid') {
        const u = { color: { value: new THREE.Vector3(...rgb(d.opts.color)) }, fill: { value: d.opts.fill ?? 0.75 }, t: { value: 0 }, energy: { value: 0.5 }, kind: { value: d.opts.kind ?? 0 } };
        material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLUID_VS, fragmentShader: FLUID_FS });
        uniforms.push({ type: 'fluid', u, opts: d.opts });
      } else if (d.type === 'segments') {
        const u = { color: { value: new THREE.Vector3(...rgb(d.opts.color)) }, level: { value: 0.5 }, count: { value: d.opts.count }, t: { value: 0 } };
        material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SEG_VS, fragmentShader: SEG_FS });
        uniforms.push({ type: 'segments', u });
      } else {
        const u = { color: { value: new THREE.Vector3(...rgb(d.opts.color)) }, t: { value: 0 }, energy: { value: 0.5 } };
        material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: CORE_FS, side: THREE.DoubleSide });
        uniforms.push({ type: 'core', u });
      }
      material.name = `gear:${lookId}:${d.type}`;
      const mesh = new THREE.Mesh(d.geometry, material);
      mesh.frustumCulled = false;
      mesh.name = `gear:${lookId}:${d.type}`;
      ctx.attach(d.bone, mesh);
    }
    if (!uniforms.length) return null;
    let level = 0.6;
    // st.charge: the owner's resource fraction (only known for the local player);
    // otherwise an idle level that rises in combat. Never feeds back into rules.
    return (st) => {
      const t = Number.isFinite(st?.t) ? st.t : 0;
      const known = Number.isFinite(st?.charge) && st.self;
      const want = known ? Math.min(1, Math.max(0, st.charge)) : st?.combat ? 0.85 : 0.6;
      level += (want - level) * Math.min(1, 0.08);
      const energy = st?.dead ? 0.05 : st?.combat || st?.casting ? 1 : 0.55;
      for (const x of uniforms) {
        x.u.t.value = t;
        if (x.type === 'fluid') {
          x.u.fill.value = (x.opts.fillMin ?? 0.2) + level * ((x.opts.fill ?? 0.9) - (x.opts.fillMin ?? 0.2));
          x.u.energy.value = energy;
        } else if (x.type === 'segments') x.u.level.value = level;
        else x.u.energy.value = energy;
      }
    };
  }

  function dispose() {
    for (const g of geoCache.values()) g.dispose();
    for (const m of matCache.values()) {
      m.map?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
    for (const b of lookCache.values()) {
      for (const s of b.statics) s.geometry.dispose();
      for (const d of b.dynamic) d.geometry.dispose();
    }
    geoCache.clear();
    matCache.clear();
    lookCache.clear();
  }

  return { prim, M, build, instantiate, dispose, get looks() { return lookCache.size; } };
}
