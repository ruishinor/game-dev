// Distinct Phase Scar calibration instruments. Presentation only: the server
// still owns activation, timing, range and calibration. Keep the original
// 0.65m interaction/collision radius and ground contact at y=0.
// Both instruments share the approved rift's stone/metal/teal-violet language,
// without copying its accepted portal geometry or creating extra point lights.
export function buildPhaseInstrument(T, regulator) {
  const group = new T.Group();
  group.name = regulator ? 'rift:regulator' : 'rift:indexer';
  const std = (color, metalness, roughness, emissive = 0x000000, emissiveIntensity = 0) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
  const m = {
    basalt: std(0x303b3d, 0.10, 0.91),
    iron: std(0x55676b, 0.69, 0.39),
    dark: std(0x172d32, 0.53, 0.57),
    brass: std(0x9e8662, 0.74, 0.42),
    ceramic: std(0x9fb3ac, 0.22, 0.35),
    glass: std(0x648c95, 0.16, 0.23, 0x315e67, 0.6),
    traced: std(0x689a9d, 0.38, 0.3, 0x4baac2, 1),
    flux: std(0xa08cbd, 0.24, 0.26, 0x7851ba, 0.8),
  };
  const add = (geo, material, x = 0, y = 0, z = 0, name = '') => {
    const o = new T.Mesh(geo, material);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    if (name) o.name = name;
    group.add(o);
    return o;
  };
  const rod = (points, radius, material, name) => {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    return add(new T.TubeGeometry(curve, 24, radius, 6, false), material, 0, 0, 0, name);
  };
  const torus = (radius, tube, material, x, y, z, name) =>
    add(new T.TorusGeometry(radius, tube, 10, 40), material, x, y, z, name);
  const box = (w, h, d, material, x, y, z, name) =>
    add(new T.BoxGeometry(w, h, d), material, x, y, z, name);

  // Tiered sculptural plinth: bevelled cross section, recessed foot and
  // 32-sided profile rather than the original exposed octagonal cylinder.
  const profile = [
    [0, 0.018], [0.46, 0.018], [0.55, 0.035], [0.605, 0.09],
    [0.605, 0.135], [0.575, 0.168], [0.51, 0.182], [0.475, 0.24],
    [0.425, 0.258], [0, 0.258],
  ];
  add(new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r, h)), 32), m.basalt, 0, 0, 0, 'rift:instrument-sculpted-foot');
  add(new T.CylinderGeometry(0.485, 0.495, 0.045, 32), m.brass, 0, 0.196, 0);
  add(new T.CylinderGeometry(0.39, 0.46, 0.64, 16), m.dark, 0, 0.55, 0, 'rift:instrument-machined-core');
  add(new T.CylinderGeometry(0.415, 0.385, 0.07, 24), m.iron, 0, 0.89, 0);
  for (const y of [0.32, 0.57, 0.83]) {
    const band = add(new T.CylinderGeometry(0.415, 0.415, 0.022, 24, 1, true), m.brass, 0, y, 0);
    band.name = 'rift:instrument-conductor-seam';
  }

  // Welded ribs, brass couplings and anchored conduits establish real mass
  // and surface hierarchy; the footprint stays inside 0.65m.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const x = Math.sin(a) * 0.485, z = Math.cos(a) * 0.485;
    const foot = box(0.12, 0.075, 0.16, m.iron, x, 0.224, z);
    foot.rotation.y = a;
    const rivet = add(new T.CylinderGeometry(0.023, 0.023, 0.018, 12), m.brass, x, 0.273, z);
    rivet.name = 'rift:instrument-ground-bolt';
  }
  for (const sign of [-1, 1]) {
    box(0.105, 0.64, 0.15, m.iron, sign * 0.38, 0.54, 0.015);
    box(0.068, 0.41, 0.023, m.brass, sign * 0.445, 0.57, 0.05);
    rod([[sign * 0.34, 0.27, -0.27], [sign * 0.46, 0.51, -0.25], [sign * 0.36, 0.87, -0.14]], 0.035, m.dark);
    rod([[sign * 0.34, 0.30, -0.23], [sign * 0.43, 0.52, -0.22], [sign * 0.34, 0.81, -0.13]], 0.012, m.traced);
  }

  // Angled operating lectern: layered face, retained keyed-rune ticks, tactile
  // side handles and an inset glass lens instead of a flat floating box.
  const console = new T.Group();
  console.name = 'rift:instrument-lectern';
  console.position.set(0, 0.96, 0.12);
  console.rotation.x = -0.27;
  group.add(console);
  const panel = (w, h, d, material, z, name) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    o.position.z = z; o.name = name || ''; o.castShadow = true;
    console.add(o);
    return o;
  };
  panel(0.76, 0.36, 0.092, m.iron, 0, 'rift:instrument-bezel');
  panel(0.676, 0.283, 0.10, m.basalt, 0.049, 'rift:instrument-inset');
  panel(0.59, 0.21, 0.013, m.glass, 0.105, 'rift:instrument-glass');
  for (let i = 0; i < 9; i++) {
    const x = -0.244 + i * 0.061;
    const dash = new T.Mesh(new T.BoxGeometry(i % 2 ? 0.011 : 0.018, 0.063, 0.008), i < 5 ? m.traced : m.flux);
    dash.position.set(x, -0.025 + (i % 3) * 0.009, 0.114);
    dash.name = 'rift:instrument-etched-readout';
    console.add(dash);
  }
  // Readable analog calibration scale: a continuous dial and five positive
  // index teeth, set behind the protective bezel rather than floating text.
  const dial=new T.Mesh(new T.RingGeometry(0.043,0.057,24),m.brass);
  dial.position.set(0.304,0.055,0.119);
  dial.name='rift:instrument-calibration-dial';
  console.add(dial);
  const pointer=new T.Mesh(new T.BoxGeometry(0.011,0.065,0.012),m.traced);
  pointer.position.set(0.304,0.056,0.127);
  pointer.name='rift:instrument-calibration-pointer';
  console.add(pointer);
  for(let i=0;i<5;i++){
    const tooth=new T.Mesh(new T.BoxGeometry(0.009,0.036+(i%2)*.012,0.009),i%2?m.flux:m.ceramic);
    tooth.position.set(-.304+i*.026,.088,0.119);
    tooth.name='rift:instrument-reference-tooth';
    console.add(tooth);
  }
  for (const sign of [-1, 1]) {
    const handle = box(0.055, 0.21, 0.29, m.brass, sign * 0.45, 0.94, 0.13);
    handle.rotation.x = -0.27;
  }

  // Separate identities: Indexer samples an axial needle through suspended
  // calibration hoops; Regulator locks a crystal between counterphase rotors.
  const rotors = [];
  if (regulator) {
    const cradle = box(0.58, 0.15, 0.41, m.iron, 0, 1.18, -0.13, 'rift:regulator-cradle');
    cradle.rotation.x = -0.14;
    add(new T.IcosahedronGeometry(0.18, 2), m.glass, 0, 1.3, -0.08, 'rift:regulator-resonance-core');
    for (const [r, y, z, sign] of [[0.258, 1.3, 0.10, 1], [0.204, 1.3, 0.14, -1]]) {
      const rotor = new T.Group();
      rotor.name = 'rift:regulator-counterphase-rotor';
      rotor.position.set(0, y, z);
      const hoop = new T.Mesh(new T.TorusGeometry(r, 0.029, 10, 48), sign === 1 ? m.brass : m.iron);
      rotor.add(hoop);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const tick = new T.Mesh(new T.BoxGeometry(0.018, 0.056, 0.025), i % 3 ? m.ceramic : m.flux);
        tick.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.015);
        tick.rotation.z = -a;
        rotor.add(tick);
      }
      group.add(rotor);
      rotors.push({ rotor, sign });
    }
    for (const sign of [-1, 1]) {
      rod([[sign * 0.27, 0.98, -0.13], [sign * 0.32, 1.18, -0.20], [sign * 0.21, 1.44, -0.12]], 0.042, m.iron);
      add(new T.SphereGeometry(0.046, 12, 8), m.traced, sign * 0.21, 1.44, -0.12);
    }
  } else {
    add(new T.CylinderGeometry(0.11, 0.19, 0.17, 24), m.brass, 0, 1.13, -0.15, 'rift:indexer-sensor-cradle');
    const needle = add(new T.CylinderGeometry(0.016, 0.062, 0.37, 24), m.ceramic, 0, 1.43, -0.15, 'rift:indexer-crystal-needle');
    needle.castShadow = false;
    add(new T.IcosahedronGeometry(0.07, 2), m.glass, 0, 1.58, -0.15, 'rift:indexer-sensor-tip');
    for (const [r, y] of [[0.235, 1.35], [0.172, 1.48]]) {
      const hoop = torus(r, 0.021, m.brass, 0, y, -0.15, 'rift:indexer-calibration-ring');
      hoop.rotation.x = Math.PI / 2 - 0.12;
      rotors.push({ rotor: hoop, sign: r > 0.2 ? 1 : -1 });
    }
    for (const sign of [-1, 1]) {
      rod([[sign * 0.28, 1.04, -0.12], [sign * 0.30, 1.28, -0.15], [sign * 0.13, 1.44, -0.15]], 0.029, m.iron);
    }
  }

  // No world lights, collision mutation or server requests. Explicit reduced
  // motion freezes orientation; low-quality still retains static readable art.
  let spin = 0;
  return {
    group, height: 1.7, radius: 0.65, hover: 0,
    update(dt, st = {}) {
      const state = st.riftPhase || 'dormant';
      const charge = state === 'unstable' ? 1 : state === 'stabilized' ? 0.7 : state === 'opening' ? 0.52 : 0.2;
      m.glass.emissiveIntensity = 0.25 + charge * 1.75;
      m.traced.emissiveIntensity = 0.25 + charge * 1.65;
      m.flux.emissiveIntensity = 0.18 + charge * 1.25;
      if (!st.reducedMotion && st.effectsQuality !== 0 && Number.isFinite(dt) && dt > 0) {
        spin = (spin + Math.min(dt, 0.1) * (0.12 + charge * 0.42)) % (Math.PI * 2);
        for (const { rotor, sign } of rotors) {
          if (regulator) rotor.rotation.z = spin * sign;
          else rotor.rotation.y = spin * sign * 0.65;
        }
      }
    },
    dispose() {
      const geometries = new Set(), materials = new Set();
      group.traverse(o => {
        if (!o.isMesh) return;
        geometries.add(o.geometry);
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
