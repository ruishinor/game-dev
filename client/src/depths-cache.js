// Depths Recovery Cache: archive-derived source GLB plus authored Foundry refit.
// Server interaction, rewards and recovery inventory are unchanged.
export const DEPTHS_CACHE_URL = '/client/assets/depths-recovery-cache.glb?v=059cafe1';

export function makeDepthsRecoveryCache(T, loader) {
  const group = new T.Group();
  group.name = 'foundry:depths-recovery-cache';
  const sources = new T.Group();
  sources.name = 'depths:source-059-loot-cache-legendary';
  group.add(sources);
  const owned = [], materials = [];
  const material = (color, metalness, roughness, emissive = 0x000000, intensity = 0) => {
    const m = new T.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: intensity });
    materials.push(m); return m;
  };
  const casing = material(0x28363b, .58, .49);
  const hardEdge = material(0x748489, .68, .35);
  const dark = material(0x121d23, .32, .72);
  const bronze = material(0xa47c4f, .64, .38);
  const gaskets = material(0x19282b, .1, .92);
  const energy = material(0x54b8ad, .12, .3, 0x49c8b8, 2.5);
  const visor = material(0x263d40, .38, .19, 0x237b77, .32);
  const addMesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(geo, mat);
    mesh.name = 'depths:refit';
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); owned.push(geo); return mesh;
  };
  // Chamfered base, contact feet and beveled outer frames. Unlike the previous
  // pair of BOX primitives, the GLB itself remains the actual central model.
  const outline = new T.Shape();
  for (const [i, [x, y]] of [[-.93, -.48], [.93, -.48], [1.01, -.38], [1.01, .38], [.93, .48], [-.93, .48], [-1.01, .38], [-1.01, -.38]].entries()) {
    if (!i) outline.moveTo(x, y); else outline.lineTo(x, y);
  }
  outline.closePath();
  const foundation = new T.ExtrudeGeometry(outline, { depth:.14, bevelEnabled:true, bevelSize:.045, bevelThickness:.025, bevelSegments:2, curveSegments:1 });
  foundation.rotateX(-Math.PI / 2);
  addMesh(foundation, casing, 0, .21, 0);
  for (const x of [-.72, .72]) for (const z of [-.3, .3]) {
    addMesh(new T.CylinderGeometry(.09, .12, .13, 10), dark, x, .065, z);
    addMesh(new T.CylinderGeometry(.048, .048, .019, 12), bronze, x, .17, z);
  }
  for (const side of [-1, 1]) {
    const x = side * .79;
    addMesh(new T.CylinderGeometry(.061, .061, .92, 10), hardEdge, x, .57, -.4, Math.PI / 2);
    for (const z of [-.34, .34]) {
      const guard = addMesh(new T.CylinderGeometry(.1, .12, .66, 8), casing, x, .52, z);
      guard.rotation.z = side * .10;
      addMesh(new T.CylinderGeometry(.037, .037, .028, 12), bronze, x + side * .006, .82, z);
    }
    addMesh(new T.BoxGeometry(.12, .07, .64), hardEdge, x, .87, 0);
  }
  for (const z of [-.49, .49]) {
    addMesh(new T.BoxGeometry(1.47, .07, .08), bronze, 0, .72, z);
    addMesh(new T.BoxGeometry(1.23, .018, .022), energy, 0, .735, z + (z > 0 ? .045 : -.045));
    for (const x of [-.52, 0, .52]) addMesh(new T.CylinderGeometry(.036, .036, .018, 12), hardEdge, x, .76, z, Math.PI / 2);
  }
  addMesh(new T.CylinderGeometry(.15, .15, .095, 20), hardEdge, 0, .57, .56, Math.PI / 2);
  addMesh(new T.TorusGeometry(.106, .026, 8, 24), bronze, 0, .57, .62);
  addMesh(new T.CylinderGeometry(.065, .065, .02, 16), visor, 0, .57, .622, Math.PI / 2);
  const signal = addMesh(new T.TorusGeometry(.078, .013, 7, 24), energy, 0, .57, .636);
  addMesh(new T.BoxGeometry(.51, .14, .035), dark, 0, .35, .56);
  for (let i = 0; i < 5; i++) addMesh(new T.BoxGeometry(.062, .028, .008), i === 0 ? bronze : energy, -.16 + i * .08, .35, .58);
  for (const x of [-.89, .89]) for (let i = 0; i < 4; i++) addMesh(new T.BoxGeometry(.042, .032, .095), gaskets, x, .43 + i * .09, -.22);

  let alive = true, fx = null, fxEngine = null;
  const sourceMeshes = [];
  const install = (gltf) => {
    if (!alive) return;
    const model = gltf.scene;
    const box = new T.Box3().setFromObject(model);
    const size = box.getSize(new T.Vector3());
    if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > .001)) throw new Error('Invalid source model dimensions');
    // The source model is nearly square. Refit its footprint to the long,
    // shallow Foundry recovery case so the visible GLB fills its armored mount.
    const sx = 1.55 / size.x, sy = Math.min(1.65, .72 / size.y), sz = .78 / size.z;
    const center = box.getCenter(new T.Vector3());
    model.scale.set(sx, sy, sz);
    model.position.set(-center.x * sx, .24 - box.min.y * sy, -center.z * sz);
    const palette = {
      gunmetal:[0x33464d, .52, .48], steel:[0xa3a9a3, .65, .34],
      rust:[0x745a43, .38, .74], rubber:[0x1c282b, .10, .91], ember:[0x78c9b8, .18, .38]
    };
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true; node.receiveShadow = true;
      const src = Array.isArray(node.material) ? node.material : [node.material];
      const enhanced = src.map(m => {
        const [color, metal, rough] = palette[m?.name] || [0x64757a, .42, .55];
        return material(color, metal, rough, m?.name === 'ember' ? 0x26a69b : 0, m?.name === 'ember' ? 1.5 : 0);
      });
      node.material = Array.isArray(node.material) ? enhanced : enhanced[0];
      sourceMeshes.push(node.geometry);
    });
    sources.add(model);
    group.userData.sourceLoaded = true;
  };
  if (loader) loader.loadAsync(DEPTHS_CACHE_URL).then(install).catch(err => {
    if (alive) console.error('[Depths Recovery Cache] archive-derived source model failed:', err);
  });
  return {
    kind:'glb-derived', group, height:1.12, radius:.9, hover:0,
    update(_dt, st = {}) {
      const pulse = st.reducedMotion ? .85 : .73 + .27 * Math.sin((st.t || 0) * 1.3);
      energy.emissiveIntensity = 2.1 * pulse;
      signal.scale.setScalar(1 + (pulse - .85) * .06);
      if (fxEngine !== st.cacheFx) { fx?.dispose(); fx = null; fxEngine = st.cacheFx || null; }
      if (fxEngine && Array.isArray(st.cacheAt)) {
        if (!fx?.alive) fx = fxEngine.area({ at:st.cacheAt, radius:.95, style:'survey', color:0x47aca3, alpha:.19, spin:st.reducedMotion ? 0 : .06 });
        else fx.set(st.cacheAt, .95);
      }
    },
    dispose() {
      alive = false; fx?.dispose(); fx = null;
      for (const geo of new Set([...owned, ...sourceMeshes])) geo.dispose();
      for (const m of new Set(materials)) m.dispose();
      group.clear();
    }
  };
}
