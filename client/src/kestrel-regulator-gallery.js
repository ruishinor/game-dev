// The two Kestrel containment dynamos share a visible pressure regulation and
// relief gallery. Static, above-headroom presentation only: no false gameplay
// valves, new colliders, interactive targets, simulation or point lights.
export const KESTREL_REGULATOR_LIMITS = Object.freeze({
  bays: 2, pipeMeshes: 4, batchMeshes: 10, newLights: 0, colliderChanges: 0,
});

export function buildKestrelRegulatorGallery(T) {
  const group = new T.Group();
  group.name = 'kestrel:pressure-regulator-gallery';
  const geometries = new Set(), materials = new Set();
  const mat = (color, metalness, roughness, emissive = 0, emissiveIntensity = 0) => {
    const result = new T.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
    materials.add(result);
    return result;
  };
  const steel = mat(0x64747d, .77, .4);
  const brass = mat(0xa4895d, .68, .49);
  const housing = mat(0x25323b, .52, .68);
  const dial = mat(0xc0c2b4, .26, .65);
  const indicator = mat(0x80bdb5, .3, .48, 0x296b68, .55);
  // Share base geometry across bays. Each repeated part family is one draw
  // call regardless of its placement count.
  const box = new T.BoxGeometry(1, 1, 1);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 24);
  const ring = new T.TorusGeometry(1, .12, 8, 32);
  for (const geo of [box, cylinder, ring]) geometries.add(geo);
  const pose = new T.Object3D();
  function batch(name, geo, material, placements, shadows = true) {
    const mesh = new T.InstancedMesh(geo, material, placements.length);
    mesh.name = name;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    for (let i = 0; i < placements.length; i++) {
      const [x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0] = placements[i];
      pose.position.set(x, y, z);
      pose.scale.set(sx, sy, sz);
      pose.rotation.set(rx, ry, rz);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  function pipe(name, points, radius, material) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const geo = new T.TubeGeometry(curve, 32, radius, 10, false);
    const mesh = new T.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    geometries.add(geo);
    group.add(mesh);
  }
  const racks = [], guards = [], crossBraces = [], cases = [], faces = [];
  const rims = [], wheels = [], needles = [], signals = [], spokes = [];
  // Existing vessel centres are x=-4.1, z=+/-4; existing overhead manifold
  // feeds are x=-5.35, z=+/-4. Do not extend into the eastern approach.
  for (const z of [-4, 4]) {
    racks.push([-6.42, 4.28, z, .18, 1.26, 1.42]);
    crossBraces.push([-6.25, 4.88, z, .38, .10, 1.3]);
    for (const offset of [-.56, .56])
      guards.push([-6.22, 4.25, z + offset, .10, 1.15, .10]);
    // The dial is on the player-facing (+X) side of the wall-mounted rack.
    cases.push([-6.17, 4.22, z, .36, .17, .36, 0, 0, Math.PI / 2]);
    faces.push([-5.985, 4.22, z, .26, .025, .26, 0, 0, Math.PI / 2]);
    rims.push([-5.948, 4.22, z, .295, .295, .295, 0, Math.PI / 2]);
    needles.push([-5.917, 4.22, z + .08, .014, .025, .17]);
    wheels.push([-5.27, 4.19, z, .23, .23, .23, 0, Math.PI / 2]);
    spokes.push([-5.24, 4.19, z, .018, .035, .38]);
    spokes.push([-5.24, 4.19, z, .018, .38, .035]);
    for (const dz of [-.32, 0, .32])
      signals.push([-6.09, 4.68, z + dz, .025, .075, .14]);
    // A continuous inlet from the existing feed and an upward relief return.
    // Lowest pipe surface is above 3.6m; upper termination is below the roof.
    pipe('kestrel:regulator-pressure-inlet', [
      [-5.35, 3.72, z], [-5.35, 4.02, z], [-5.55, 4.17, z],
      [-6.17, 4.17, z],
    ], .09, steel);
    pipe('kestrel:regulator-roof-relief', [
      [-6.17, 4.17, z], [-6.35, 4.38, z],
      [-6.35, 5.16, z], [-6.39, 5.4, z],
    ], .075, brass);
  }
  batch('kestrel:regulator-bulkhead-racks', box, housing, racks);
  batch('kestrel:regulator-guard-rails', box, brass, guards);
  batch('kestrel:regulator-cross-braces', box, steel, crossBraces);
  batch('kestrel:regulator-dial-housings', cylinder, housing, cases);
  batch('kestrel:regulator-dial-faces', cylinder, dial, faces, false);
  batch('kestrel:regulator-dial-rims', ring, brass, rims, false);
  batch('kestrel:regulator-isolation-wheels', ring, steel, wheels);
  batch('kestrel:regulator-dial-needles', box, housing, needles, false);
  batch('kestrel:regulator-status-indicators', box, indicator, signals, false);
  batch('kestrel:regulator-isolation-spokes', box, brass, spokes);
  return {
    group,
    stats: { ...KESTREL_REGULATOR_LIMITS },
    dispose() {
      group.removeFromParent();
      for (const geo of geometries) geo.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
