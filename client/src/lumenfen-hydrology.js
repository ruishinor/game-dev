// Geometry-only hydrology at the two constructed Lumenfen waterworks.
// These surfaces are cosmetic: travel, terrain, collision and water/loot authority
// remain in shared/server modules. No extra texture downloads or light sources.
const RING_SIDES = 64;
const CHANNEL_STEPS = 24;
const CHANNEL_CROSS_STEPS = 10;

function colour(T, hex) {
  const c = new T.Color(hex);
  return [c.r, c.g, c.b];
}

function ringSurface(T, root, name, rings, site, height, material, sediment = false) {
  const vertices = [], indices = [], colours = [];
  const base = height(site.x, site.z);
  for (let j = 0; j < rings.length; j++) {
    const radial = rings[j];
    for (let i = 0; i < RING_SIDES; i++) {
      const angle = 2 * Math.PI * i / RING_SIDES;
      const ripple = 1 + .065 * Math.sin(angle * 5 + .8)
        + .026 * Math.cos(angle * 11 - .3);
      const x = Math.cos(angle) * 8 * radial * ripple;
      const z = Math.sin(angle) * 5.3 * radial * ripple;
      const landY = height(site.x + x, site.z + z) - base;
      // The middle of the spring reads as a shallow mirror. Towards the
      // shore the sheet meets the *actual* deterministic bank instead of
      // hanging over lower ground or vanishing into higher ground.
      const mirrorY = .105 + .014 * Math.sin(angle * 3 + radial * 8) * radial;
      const shoreBlend = Math.max(0, Math.min(1, (radial - .65) / .35));
      const y = sediment ? landY + .035
        : mirrorY * (1 - shoreBlend) + (landY + .045) * shoreBlend;
      vertices.push(x, y, z);
      colours.push(...colour(T, sediment
        ? (j === rings.length - 1 ? 0x435447 : 0x687260)
        : (j > 2 ? 0x76a897 : 0x416b69)));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < RING_SIDES; i++) {
      const a = j * RING_SIDES + i;
      const b = j * RING_SIDES + (i + 1) % RING_SIDES;
      const c = (j + 1) * RING_SIDES + i;
      const d = (j + 1) * RING_SIDES + (i + 1) % RING_SIDES;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = sediment;
  root.add(mesh);
  return mesh;
}

function channelSurface(T, root, name, site, height, material,
  zStart, zEnd, xCenter = 0, halfWidth = 4.85, bank = false) {
  const vertices = [], colours = [], indices = [];
  const base = height(site.x, site.z);
  const columns = CHANNEL_CROSS_STEPS + 1;
  for (let iz = 0; iz <= CHANNEL_STEPS; iz++) {
    const t = iz / CHANNEL_STEPS;
    const z = zStart + (zEnd - zStart) * t;
    const width = halfWidth * (1 + .065 * Math.sin(t * Math.PI * 2 + .55));
    for (let ix = 0; ix <= CHANNEL_CROSS_STEPS; ix++) {
      const across = (ix / CHANNEL_CROSS_STEPS) * 2 - 1;
      // Sediment bands wrap outside the stream. Water occupies the core only.
      const outward = bank ? across * (1 + Math.abs(across) * .21) : across;
      const x = xCenter + width * outward
        + .13 * Math.sin(t * 7 + across * 2);
      const landY = height(site.x + x, site.z + z) - base;
      const y = landY + (bank ? .023 : .073)
        + (bank ? 0 : .009 * Math.sin(t * 16 + across * 5));
      vertices.push(x, y, z);
      colours.push(...colour(T, bank
        ? (Math.abs(across) > .7 ? 0x42584b : 0x677362)
        : (Math.abs(across) > .7 ? 0x5e938b : 0x326c70)));
    }
  }
  for (let iz = 0; iz < CHANNEL_STEPS; iz++) {
    for (let ix = 0; ix < CHANNEL_CROSS_STEPS; ix++) {
      const a = iz * columns + ix, b = a + 1;
      const c = a + columns, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = bank;
  root.add(mesh);
  return mesh;
}

// Called once per constructed landmark. Materials are shared and owned by
// buildLumenfenSites; all unique geometries are disposed in its scene traversal.
export function addLumenfenSiteHydrology(T, root, site, height, materials) {
  if (site.id === 'glasswater-spring') {
    ringSurface(T, root, 'lumenfen:spring:water',
      [.012, .22, .44, .66, .84, 1], site, height, materials.water);
    ringSurface(T, root, 'lumenfen:spring:sediment-bank',
      [.96, 1.06, 1.16], site, height, materials.sediment, true);
    return { waterSurfaces: 1, shoreSurfaces: 1 };
  }
  if (site.id === 'tidal-weir') {
    // Leave the authoritative central sluice colliders and wheel completely
    // untouched. The divided watercourse reads as headpond and tailrace.
    channelSurface(T, root, 'lumenfen:weir:headpond-water',
      site, height, materials.water, -13, -3.15);
    channelSurface(T, root, 'lumenfen:weir:tailrace-water',
      site, height, materials.water, 3.15, 13);
    channelSurface(T, root, 'lumenfen:weir:headpond-bank',
      site, height, materials.sediment, -13, -3.15, 0, 4.85, true);
    channelSurface(T, root, 'lumenfen:weir:tailrace-bank',
      site, height, materials.sediment, 3.15, 13, 0, 4.85, true);
    // This small side race touches the existing turning bucket wheel at x=8.
    channelSurface(T, root, 'lumenfen:weir:wheel-race',
      site, height, materials.water, -3.1, 3.1, 8, .85);
    return { waterSurfaces: 3, shoreSurfaces: 2 };
  }
  return { waterSurfaces: 0, shoreSurfaces: 0 };
}
