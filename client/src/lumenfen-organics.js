// Lumenfen-specific, deterministic instanced geometry and PBR surface detail.
// Decorative only: no collision, hitboxes, animation authority or runtime assets.
const TAU = Math.PI * 2;

function geometry(T, vertices, indices, colors = null) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Tapered, irregular branching wood. Its ribs and nonuniform profile remain
// visible at close camera distance; all instances retain the old placements.
export function fenStemGeometry(T, root = false) {
  const v = [], ix = [], sides = 18, rings = 10;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, y = t - .5;
    const taper = root ? 1.13 - .78 * t : 1.20 - .56 * t;
    for (let i = 0; i < sides; i++) {
      const a = i * TAU / sides;
      const flutes = 1 + .085 * Math.sin(a * 7 + t * 3.2) + .035 * Math.cos(a * 13 - t * 4);
      const twist = root ? .10 * t * t : .028 * Math.sin(t * 8 + a * 2);
      v.push(
        Math.cos(a) * taper * flutes * .62 + twist,
        y,
        Math.sin(a) * taper * flutes * .62 + (root ? .09 * t : 0)
      );
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    const a = j * sides + i, b = j * sides + (i + 1) % sides;
    const c = a + sides, d = b + sides;
    ix.push(a, b, c, b, d, c);
  }
  return geometry(T, v, ix);
}

// Real folded laminae and branch gaps instead of icosahedral crowns and cones.
// Geometry is centred on the existing instanced coordinates; double-sided
// foliage is lit by the main scene, not by extra local point lights.
export function fenFoliageGeometry(T, habit = 'oak') {
  const v = [], ix = [], col = [];
  function frond(start, end, width, phase, shade) {
    const n = 9, base = v.length / 3;
    const dx = end[0] - start[0], dz = end[2] - start[2];
    const d = Math.hypot(dx, dz) || 1;
    const sideX = -dz / d, sideZ = dx / d;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const breadth = width * Math.pow(Math.sin(Math.PI * t), .7)
        * (1 + .065 * Math.sin(k * 2.9 + phase));
      const bow = Math.sin(Math.PI * t) * .11;
      const x = start[0] + dx * t + Math.sin(t * Math.PI * 2 + phase) * .025;
      const y = start[1] + (end[1] - start[1]) * t + bow;
      const z = start[2] + dz * t;
      // A raised midrib with separately folded left/right halves.
      for (const [s, ridge] of [[-1, -.06], [0, .075], [1, -.06]]) {
        v.push(x + sideX * breadth * s, y + ridge * Math.sin(Math.PI * t), z + sideZ * breadth * s);
        const tint = shade * (s === 0 ? 1.08 : .94) * (1 - .10 * t);
        col.push(Math.min(1, tint * .88), Math.min(1, tint), Math.min(1, tint * .86));
      }
    }
    for (let k = 0; k < n; k++) {
      const a = base + k * 3, b = a + 3;
      ix.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const count = habit === 'cage' ? 9 : habit === 'willow' ? 13 : 16;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + (habit === 'oak' ? .22 : 0);
    const layer = i % 4;
    const r = habit === 'cage' ? .16 : habit === 'willow' ? .24 : .16;
    const origin = [Math.cos(a) * r, habit === 'cage' ? -.43 : .13 + .11 * (layer - 1), Math.sin(a) * r];
    const extent = habit === 'cage' ? .37 : habit === 'willow' ? .56 : .80;
    const dest = [
      Math.cos(a + .23) * extent,
      habit === 'cage' ? .48 - .05 * layer : habit === 'willow' ? -.5 + .05 * layer : .05 + .18 * Math.sin(a * 2),
      Math.sin(a + .23) * extent
    ];
    frond(origin, dest, habit === 'willow' ? .12 : habit === 'cage' ? .14 : .23,
      i * .89, .78 + (i % 5) * .045);
  }
  return geometry(T, v, ix, col);
}

// Textured wet hide and bark from the existing standard/physical PBR lighting.
// The grain is stable in model space and does not introduce a new draw pass.
export function fenSurfaceDetail(material, family = 'bark') {
  const freq = family === 'hide' ? 38 : family === 'stone' ? 18 : 27;
  const contrast = family === 'hide' ? .14 : family === 'stone' ? .18 : .22;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFenLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFenLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFenLocal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' +
        'vec3 fenCell = floor(vFenLocal * ' + freq.toFixed(1) + ');\n' +
        'float fenGrain = fract(sin(dot(fenCell, vec3(127.1,311.7,74.7))) * 43758.5453);\n' +
        'float fenVein = sin(vFenLocal.y * 49.0 + vFenLocal.x * 21.0 + 2.0 * sin(vFenLocal.z * 15.0));\n' +
        'float fenPatina = (fenGrain - .5) * ' + contrast.toFixed(3) + ' + fenVein * .035;\n' +
        'diffuseColor.rgb *= 1.0 + fenPatina;');
  };
  material.customProgramCacheKey = () => 'fen-surface-v2-' + family;
  material.needsUpdate = true;
  return material;
}

// A shared VFX-engine-style animated surface shader: GPU water movement is
// decoupled from server geography; only colour highlights change over time.
export function fenWaterShimmer(material) {
  const time = { value: 0 };
  material.userData.fenWaterTime = time;
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior?.(shader, renderer);
    shader.uniforms.fenWaterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFenWater;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFenWater = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFenWater;\nuniform float fenWaterTime;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' +
        'float fenW = sin(vFenWater.x * 1.43 + fenWaterTime * .68 + sin(vFenWater.y * .71))' +
        ' * sin(vFenWater.y * 1.18 - fenWaterTime * .53);\n' +
        'float fenFine = sin(vFenWater.x * 5.1 - fenWaterTime * .45) * sin(vFenWater.y * 4.4 + fenWaterTime * .38);\n' +
        'diffuseColor.rgb *= 1.0 + fenW * .12 + fenFine * .035;\n');
  };
  material.customProgramCacheKey = () => 'fen-water-shimmer-v2';
  material.needsUpdate = true;
  return material;
}
