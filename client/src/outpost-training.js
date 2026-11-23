// Compact sheltered calibration range and exhibition armory. All structural
// objects are presentation; shared collision and server station anchors are
// defined independently. No dynamic lights, physics projectiles or loot.
import { EXPEDITION_OUTPOST as OP, OUTPOST_TRAINING as R } from '../../shared/severance-gate.js';

const SOURCES = Object.freeze([
  ['Field Pattern', '/client/weapon-assets/field.glb'],
  ['Tuned Pattern', '/client/weapon-assets/tuned.glb'],
  ['Dense Pattern', '/client/weapon-assets/dense.glb'],
  ['Longpoint', '/client/assets/longpoint.glb'],
]);

function material(T, color, metalness = .62, roughness = .46, glow = 0) {
  return new T.MeshStandardMaterial({
    color, metalness, roughness, emissive: glow ? color : 0x000000,
    emissiveIntensity: glow, envMapIntensity: .72,
  });
}
function box(T, group, mats, owned, w, h, d, x, y, z, name, ry = 0) {
  const geometry = new T.BoxGeometry(w, h, d);
  owned.push(geometry);
  const mesh = new T.Mesh(geometry, mats);
  mesh.name = 'outpost-training:' + name;
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = h > .16;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function buildObject(T, tag, height, radius, fn) {
  const group = new T.Group(); group.name = 'outpost-training:' + tag;
  const geos = [], mats = [];
  const m = (...args) => { const v = material(T, ...args); mats.push(v); return v; };
  fn(group, geos, m);
  return {
    group, height, radius, hover: .05,
    trigger(kind) {
      if (kind === 'hit') this.flash = 1;
    },
    flash: 0,
    update(dt) {
      this.flash = Math.max(0, this.flash - Math.min(Math.max(dt || 0, 0), .1) * 3.5);
      for (const o of group.children) if (o.userData?.reactive) o.material.emissiveIntensity = .3 + this.flash * 2.1;
    },
    dispose() { for (const g of geos) g.dispose(); for (const v of mats) v.dispose(); },
  };
}
export function makeRangeTarget(T) {
  return buildObject(T, 'target', 1.9, .55, (g, own, m) => {
    const frame = m(0x65543c, .61, .48), ceramic = m(0xd8c5a0, .2, .63),
      scoring = m(0x2d7778, .37, .38, .3), ochre = m(0xe6a852, .37, .48);
    box(T, g, frame, own, .2, 1.75, .11, .03, .94, 0, 'target-back');
    box(T, g, ceramic, own, .12, 1.10, .94, -.065, 1.30, 0, 'target-inset');
    const rim = new T.Mesh(new T.TorusGeometry(.38, .035, 9, 48), scoring);
    own.push(rim.geometry); rim.rotation.y = -Math.PI / 2; rim.position.set(-.145, 1.30, 0);
    rim.userData.reactive = true; g.add(rim);
    for (const radius of [.25, .13]) {
      const ring = new T.Mesh(new T.TorusGeometry(radius, .017, 7, 40), radius === .13 ? ochre : frame);
      own.push(ring.geometry); ring.rotation.y = -Math.PI / 2;
      ring.position.set(-.155, 1.30, 0); g.add(ring);
    }
    box(T, g, ochre, own, .06, .06, .06, -.18, 1.30, 0, 'target-aim-point');
    const foot = box(T, g, frame, own, .55, .13, .85, .06, .08, 0, 'target-plinth');
    foot.castShadow = false;
  });
}
export function makeRangeConsole(T) {
  return buildObject(T, 'console', 1.45, .6, (g, own, m) => {
    const base = m(0x5b554d, .64, .54), bronze = m(0xa78962, .65, .42),
      glass = m(0x3e9191, .25, .26, .45);
    box(T, g, base, own, .64, 1.02, .62, 0, .54, 0, 'console-column');
    box(T, g, bronze, own, .78, .14, .82, -.08, 1.09, 0, 'console-bezel', -.13);
    const screen = box(T, g, glass, own, .72, .025, .68, -.10, 1.17, 0, 'console-screen', -.13);
    screen.rotation.z = -.13; screen.userData.reactive = true;
    for (let i = 0; i < 5; i++) box(T, g, bronze, own, .06, .012, .11, -.37 + i * .13, 1.2, .18, 'console-control-' + i);
  });
}
export function makeArmoryAnchor(T) {
  return buildObject(T, 'armory-plate', 1.8, .8, (g, own, m) => {
    const metal = m(0x927954, .73, .37), light = m(0x62aaa4, .25, .29, .7);
    box(T, g, metal, own, .07, 1.35, 1.02, -.05, .98, 0, 'rack-interact-panel');
    for (let i = 0; i < 4; i++) box(T, g, light, own, .04, .025, .83, -.10, .53 + i * .29, 0, 'rack-status-' + i);
  });
}

export function buildOutpostTraining(T, { ground, loader } = {}) {
  const group = new T.Group(); group.name = 'severance-outpost:training';
  const owned = [], mats = [], models = [];
  const m = (...args) => { const v = material(T, ...args); mats.push(v); return v; };
  const steel = m(0x536069, .67, .49), bronze = m(0xb29568, .63, .43),
    fibre = m(0x393d3a, .1, .91), safety = m(0xc19352, .27, .51),
    light = m(0x63b4ae, .28, .35, .46);
  const at = (x, z) => ground(x, z);
  const back = R.backstop;
  box(T, group, steel, owned, back.hw * 2, 2.28, back.hd * 2, back.x, at(back.x, back.z) + 1.15, back.z, 'range-ballistic-backstop');
  for (const z of [back.z - 2.15, back.z + 2.15]) {
    box(T, group, bronze, owned, .31, 2.60, .15, back.x - .17, at(back.x, z) + 1.31, z, 'range-buttress');
  }
  for (let i = 0; i < 7; i++) {
    box(T, group, fibre, owned, .07, 1.95, .08, back.x - .26, at(back.x, back.z) + 1.20, back.z - 1.85 + i * .62, 'range-absorber-' + i);
  }
  for (const lane of R.lanes) {
    const midz = lane.z, gx = R.line.x;
    // The line is painted in the floor; the target is an interactive world
    // object, not a second scene prop and not a damageable enemy.
    box(T, group, safety, owned, .09, .012, .98, gx, at(gx, midz) + .04, midz, 'range-firing-line');
    box(T, group, light, owned, .04, .035, .84, gx - .16, at(gx, midz) + .045, midz, 'range-lane-indicator');
    for (let s = 0; s < 3; s++) {
      box(T, group, bronze, owned, .08, .012, .11, gx + .3 + s * .56, at(gx, midz) + .04, midz, 'range-distance-mark-' + s);
    }
  }
  // Rack in the rear north corner: an actual fixture, with four firearm
  // silhouettes loaded from the existing vetted, runtime-served GLBs. The
  // owner archive remains source input for independent higher-detail rebuilds.
  const rack = R.armory;
  const rackRoot = new T.Group();
  rackRoot.name = 'outpost-training:armory';
  rackRoot.position.set(rack.x, at(rack.x, rack.z), rack.z);
  group.add(rackRoot);
  box(T, rackRoot, steel, owned, 2.45, 2.38, .34, 0, 1.22, .06, 'armory-backing');
  for (const x of [-1.11, 1.11]) box(T, rackRoot, bronze, owned, .15, 2.55, .59, x, 1.32, -.10, 'armory-stile');
  for (let i = 0; i < SOURCES.length; i++) {
    const y = 2.14 - i * .49;
    box(T, rackRoot, fibre, owned, 2.13, .28, .41, 0, y, -.22, 'armory-recess-' + i);
    box(T, rackRoot, bronze, owned, 2.06, .035, .065, 0, y - .15, -.45, 'armory-cradle-' + i);
    box(T, rackRoot, light, owned, .16, .04, .055, .94, y + .11, -.45, 'armory-readout-' + i);
  }
  let status = 'idle', ready = 0;
  function load() {
    if (status !== 'idle' || !loader) return;
    status = 'loading';
    Promise.allSettled(SOURCES.map(async ([name, url], i) => {
      const gltf = await loader.loadAsync(url);
      if (status === 'disposed') return;
      const asset = gltf.scene.clone(true);
      const bounds = new T.Box3().setFromObject(asset);
      const dim = bounds.getSize(new T.Vector3());
      const centre = bounds.getCenter(new T.Vector3());
      if (![dim.x, dim.y, dim.z].every(v => Number.isFinite(v) && v > .0001)) return;
      const max = Math.max(dim.x, dim.y, dim.z);
      const holder = new T.Group(); holder.name = 'outpost-training:weapon-' + name.toLowerCase().replaceAll(' ', '-');
      // Keep the asset's own scale and transform inside an independent fitted
      // pivot. Translating the source before subsequently scaling that source
      // would move any off-origin donor away from the centre of its rack slot.
      const fitted = new T.Group();
      asset.position.sub(centre);
      fitted.add(asset);
      // Balanced neutral showroom finish; preserve distinct existing weapon
      // geometry and textures rather than overwriting authored material maps.
      asset.traverse(n => {
        if (!n.isMesh) return;
        n.material = Array.isArray(n.material) ? n.material.map(v => v.clone()) : n.material?.clone();
        for (const v of [].concat(n.material || [])) {
          if (!v?.isMeshStandardMaterial) continue;
          v.metalness = Math.max(.45, v.metalness);
          v.roughness = Math.min(.72, Math.max(.3, v.roughness));
          v.envMapIntensity = Math.max(.7, v.envMapIntensity || 0);
          mats.push(v);
        }
        n.castShadow = true; n.receiveShadow = true;
      });
      const scale = Math.min(1.72 / max, .30 / Math.max(dim.y, .01));
      fitted.scale.setScalar(scale);
      holder.add(fitted);
      holder.position.set(0, 2.14 - i * .49, -.40);
      // Weapon noses face the public aisle, clear of the locker backboard.
      rackRoot.add(holder);
      models.push(holder);
      ready++;
    })).then(results => {
      if (status !== 'disposed') status = results.every(x => x.status === 'fulfilled') ? 'ready' : 'partial';
    });
  }
  return {
    group,
    update(_dt, _t, eye) {
      if (eye && Math.hypot(eye.x - OP.x, eye.z - OP.z) < 55) load();
    },
    stats() { return { status, sourceWeapons: SOURCES.length, loadedWeapons: ready, lights: 0, lanes: R.lanes.length }; },
    dispose() {
      status = 'disposed';
      group.removeFromParent();
      // Imported geometries are shared with the GLB loader cache; only dispose
      // meshes and textures owned by this presentation fixture.
      for (const geo of owned) geo.dispose();
      for (const v of mats) v.dispose();
    },
  };
}

// F-key routing while standing on the marked line: other nearby outpost
// services may physically be closer than a target, but target practice is
// unambiguous here. Pure presentation choice; the server revalidates intent.
export function nearestPracticeTarget(entities, selfId, you, range = 5) {
  const self = entities.get(selfId);
  if (!self || self.dead || !Number.isFinite(you?.x) || !Number.isFinite(you?.z) || !(range > 0)) return null;
  if (you.x < R.line.x - 1.6 || you.x > R.line.x + .15 ||
      Math.abs(you.z - R.line.z) > 2.15) return null;
  let closest = null, best = range;
  for (const ent of entities.values()) {
    if (ent.meta?.c !== 'outpost_range_target' || ent.meta.k !== 'o') continue;
    const row = ent.row;
    if (!Number.isFinite(row?.x) || !Number.isFinite(row?.z)) continue;
    const d = Math.hypot(row.x - you.x, row.z - you.z);
    if (d < best || (d === best && (!closest || ent.id < closest.id))) { closest = ent; best = d; }
  }
  return closest;
}
