// Additional Phase Annex machinery, using instanced, presentation-only forms.
// Every raised fixture is either above y=5 or mounted on the existing walls;
// walk lanes, hit tests, server-owned barriers and travel remain unchanged.
export function createAnnexChamberDetail(T, annex, rooms) {
  const group = new T.Group();
  group.name = 'annex:architectural-detail';
  const geometries = [], materials = [], batches = [];
  const make = (color, metalness, roughness, glow = 0, power = 0) => {
    const m = new T.MeshStandardMaterial({
      color, metalness, roughness, emissive: glow, emissiveIntensity: power,
    });
    materials.push(m);
    return m;
  };
  const metal = make(0x596a76, .77, .43);
  const recess = make(0x101921, .22, .87);
  const ceramic = make(0xb2b6b4, .28, .54);
  const arrival = make(0x72cbd6, .20, .31, 0x57b8d0, 1.15);
  const relay = make(0xdfaf6d, .33, .39, 0xb47d39, 1.12);
  const nullLens = make(0xb5a3ed, .28, .29, 0x795dbe, 1.06);
  const signal = [arrival, relay, nullLens];

  // A box instance is one draw call for all matching wall/ceiling fittings.
  const box = (name, material, pieces, parent = group) => {
    if (!pieces.length) return;
    const geo = new T.BoxGeometry(1, 1, 1);
    const mesh = new T.InstancedMesh(geo, material, pieces.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const proxy = new T.Object3D();
    pieces.forEach(([x, y, z, w, h, d, yaw = 0], i) => {
      proxy.position.set(x, y, z);
      proxy.rotation.set(0, yaw, 0);
      proxy.scale.set(w, h, d);
      proxy.updateMatrix();
      mesh.setMatrixAt(i, proxy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
    geometries.push(geo);
    batches.push(mesh);
    return mesh;
  };
  const torus = (name, radius, thickness, color, x, y, z, tilt = 0, parent = group) => {
    const geo = new T.TorusGeometry(radius, thickness, 10, 56);
    const ring = new T.Mesh(geo, color);
    ring.name = name;
    ring.position.set(x, y, z);
    ring.rotation.x = tilt;
    ring.castShadow = false;
    parent.add(ring);
    geometries.push(geo);
  };
  const path = [
    [0, 23, 6, 13.7], [6, 11.1, 6, 6], [6, 6, -6, -6.7],
    [-6, -10.5, -6, -15.5], [-6, -15.5, 0, -28],
  ];
  const waymarks = [];
  for (const [x0, z0, x1, z1] of path) {
    const dx = x1 - x0, dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    const count = Math.max(2, Math.floor(length / 1.6));
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      waymarks.push([x0 + dx * t, .07, z0 + dz * t, .10, .018,
        Math.min(1.04, length / count * .64), Math.atan2(dx, dz)]);
    }
  }
  box('annex:route-recessed-waymarks', arrival, waymarks);

  rooms.forEach((room, index) => {
    const part = new T.Group();
    part.name = 'annex:detail:' + room.name.toLowerCase().replaceAll(' ', '-');
    group.add(part);
    const edges = [], backing = [], lights = [], ribs = [], teeth = [];
    for (const side of [-1, 1]) {
      for (let z = room.near + 3.5; z < room.far - 1.5; z += 4.8) {
        // Decorative housing lies above head height, against an existing wall.
        // Nothing here presents a solid waist-height obstacle without a collider.
        const x = side * (annex.hw - .20);
        backing.push([x, 3.52, z, .24, 2.30, 2.65]);
        edges.push([x - side * .14, 3.53, z - 1.24, .15, 2.37, .12]);
        edges.push([x - side * .14, 3.53, z + 1.24, .15, 2.37, .12]);
        edges.push([x - side * .14, 4.66, z, .15, .13, 2.61]);
        for (const offset of [-.78, -.39, 0, .39, .78])
          teeth.push([x - side * .155, 3.58, z + offset, .07, 1.36, .09]);
        lights.push([x - side * .195, 4.46, z, .06, .055, 1.68]);
      }
      const trunkZ = room.center;
      ribs.push([side * 12.9, 6.75, trunkZ, .35, .38, room.far - room.near - 2.5]);
      for (let z = room.near + 2.8; z < room.far - 2; z += 4.5) {
        ribs.push([side * 10.7, 6.45, z, 3.15, .22, .18]);
        lights.push([side * 10.7, 6.27, z, 2.3, .035, .08]);
      }
    }
    box('annex:detail:machinery-backing:' + index, recess, backing, part);
    box('annex:detail:mounting-frames:' + index, metal, edges, part);
    box('annex:detail:vent-fins:' + index, ceramic, teeth, part);
    box('annex:detail:ceiling-raceway:' + index, metal, ribs, part);
    box('annex:detail:inspection-lights:' + index, signal[index], lights, part);

    if (index === 0) {
      // Arrival: measured survey arrays, not a duplicate portal membrane.
      const scanners = [], rails = [];
      for (const side of [-1, 1]) {
        rails.push([side * 5.9, 6.15, 20.0, .22, .34, 12.0]);
        for (const z of [16.2, 19.5, 22.8])
          scanners.push([side * 5.9, 5.72, z, 2.55, .34, .16]);
      }
      box('annex:arrival-survey-rails', metal, rails, part);
      box('annex:arrival-survey-paddles', arrival, scanners, part);
      torus('annex:arrival-survey-dial', .72, .075, arrival,
        0, 6.42, 19, Math.PI / 2, part);
    } else if (index === 1) {
      // Relay: an overhead three-channel distribution spine. Its weight is
      // carried above the authoritative offset doorways.
      const housings = [], busbars = [], hangers = [];
      for (const z of [-5.3, -1, 3.3, 7.6]) {
        housings.push([0, 6.92, z, 8.4, .65, 1.65]);
        for (const x of [-2.9, 0, 2.9]) {
          busbars.push([x, 6.50, z, .26, .10, 1.5]);
          hangers.push([x, 7.55, z, .15, 1.0, .15]);
        }
      }
      box('annex:relay-power-distribution', recess, housings, part);
      box('annex:relay-live-busbars', relay, busbars, part);
      box('annex:relay-suspended-brackets', ceramic, hangers, part);
    } else {
      // Null: a suspended containment instrument over the cache approach.
      // It is horizontal and has no vertical membrane or travel cue.
      const braces = [];
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        braces.push([Math.sin(a) * 3.2, 6.35, -25.6 + Math.cos(a) * 3.2,
          .18, .28, .74, a]);
      }
      box('annex:null-containment-retainers', ceramic, braces, part);
      torus('annex:null-oculus-outer', 3.2, .10, metal,
        0, 6.36, -25.6, Math.PI / 2, part);
      torus('annex:null-oculus-sensor', 2.82, .046, nullLens,
        0, 6.34, -25.6, Math.PI / 2, part);
      torus('annex:null-cache-overhead-index', .78, .075, nullLens,
        0, 6.31, -30, Math.PI / 2, part);
    }
  });
  const stats = { batches: batches.length,
    instances: batches.reduce((n, b) => n + b.count, 0),
    distinctRooms: rooms.length, colliderChanges: 0 };
  return {
    group, stats,
    update(t = 0, reducedMotion = false) {
      const wave = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.3);
      arrival.emissiveIntensity = 1.15 * wave;
      relay.emissiveIntensity = 1.12 * wave;
      nullLens.emissiveIntensity = 1.06 * wave;
    },
    dispose() {
      group.removeFromParent();
      for (const geo of geometries) geo.dispose();
      for (const material of materials) material.dispose();
      for (const batch of batches) batch.dispose?.();
    },
  };
}
