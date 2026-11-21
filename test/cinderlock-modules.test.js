import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARMOUR_ASSETS, ARMOUR_MODULE_ASSETS, modulesOf, publicArmourVisual, CINDERLOCK_FULL } from '../shared/armour-visual.js';
import { ITEMS } from '../shared/content.js';
import { wearArmour, armourBundle, armourLodFor, ARMOUR_LOD_DISTANCE } from '../client/src/armour-visual.js';
import { glowHalfWidth, glowGain } from '../client/src/armour-fx.js';
import { makeChar } from './helpers.js';

test('items wear their Cinderlock modules; modules are never items', () => {
  assert.deepEqual(modulesOf('vanguard_field_set_chest'), ['vanguard_field_set_chest', 'cinderlock_arms']);
  assert.deepEqual(modulesOf('vanguard_field_set_greaves'), ['cinderlock_legs', 'vanguard_field_set_greaves']);
  assert.deepEqual(modulesOf('vanguard_field_set_gloves'), ['vanguard_field_set_gloves']);
  assert.deepEqual(modulesOf('cinderlock_arms'), ['cinderlock_arms']);
  for (const bad of ['__proto__', 'constructor', 'relay_carbine', '../x']) assert.deepEqual(modulesOf(bad), []);
  for (const id of Object.keys(ARMOUR_MODULE_ASSETS)) {
    assert.equal(ITEMS[id], undefined, `${id} is not an item`);
    assert.equal(Object.hasOwn(ARMOUR_ASSETS, id), false);
  }
  assert.equal(armourBundle('humanoid_f', 'cinderlock_legs'), 'armour_vanguard_set_f');
  assert.equal(armourBundle('humanoid_m', '__proto__'), null);
  // a forged loadout naming a module (or a module in an item slot) yields nothing
  const char = makeChar('vanguard', { inventory: ['cinderlock_arms', 'vanguard_field_set_boots'], equipped: { chest: 'cinderlock_arms', boots: 'vanguard_field_set_boots' } });
  assert.deepEqual(publicArmourVisual(char), { boots: 'vanguard_field_set_boots' });
  assert.deepEqual(Object.values(CINDERLOCK_FULL).sort(), Object.keys(ARMOUR_ASSETS).filter((k) => ARMOUR_ASSETS[k] === 'armour_vanguard_set').sort());
});

test('distance levels switch with hysteresis', () => {
  const [a, b] = ARMOUR_LOD_DISTANCE;
  assert.equal(armourLodFor(5), 0);
  assert.equal(armourLodFor(a + 2), 1);
  assert.equal(armourLodFor(a - 1, 1), 1, 'stays at LOD1 just inside the edge');
  assert.equal(armourLodFor(a - 2, 1), 0);
  assert.equal(armourLodFor(b + 2), 2);
  assert.equal(armourLodFor(NaN, 1), 1);
});

test('a worn item binds its modules, shows LOD0 and switches to the far levels', () => {
  const bone = () => { const x = new THREE.Bone(); x.name = 'pelvis'; return x; };
  const skinned = (name, bones, mat = new THREE.MeshStandardMaterial()) => {
    const m = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
    m.name = name;
    m.bind(new THREE.Skeleton(bones));
    return m;
  };
  const inst = new THREE.Group();
  const ib = bone();
  inst.add(ib, skinned('body', [ib]));
  const far = new THREE.MeshStandardMaterial({ name: 'armour_cinderlock_upper_far' });
  const src = new THREE.Group();
  const sb = bone();
  src.add(sb);
  for (const n of ['vanguard_field_set_chest', 'cinderlock_arms']) {
    src.add(skinned(n, [sb]), skinned(n + '__lod1', [sb], far), skinned(n + '__lod2', [sb], far), skinned(n + '__fx', [sb]),
      skinned(n + '__glow', [sb], new THREE.MeshStandardMaterial({ name: 'CL_Glow' })));
  }
  src.add(skinned('vanguard_field_set_gloves', [sb]));
  const anchor = new THREE.Object3D();
  anchor.name = 'fxa--cinderlock_arms--spark--0';
  sb.add(anchor);
  const h = wearArmour({ instance: () => src }, inst, 'humanoid_m', 'vanguard_field_set_chest');
  const names = h.meshes.map((m) => m.name).sort();
  assert.deepEqual(names, ['cinderlock_arms', 'cinderlock_arms__fx', 'cinderlock_arms__glow', 'cinderlock_arms__lod1', 'cinderlock_arms__lod2',
    'vanguard_field_set_chest', 'vanguard_field_set_chest__fx', 'vanguard_field_set_chest__glow', 'vanguard_field_set_chest__lod1', 'vanguard_field_set_chest__lod2']);
  const shown = () => h.meshes.filter((m) => m.visible).map((m) => m.name).sort();
  assert.deepEqual(shown(), ['cinderlock_arms', 'cinderlock_arms__fx', 'cinderlock_arms__glow', 'vanguard_field_set_chest', 'vanguard_field_set_chest__fx', 'vanguard_field_set_chest__glow']);
  assert.ok(far.emissiveIntensity > 1, 'far channels glow as HDR emissive');
  const glow = h.meshes.find((m) => m.name.endsWith('__glow'));
  assert.equal(glow.material.name, 'CL_Glow');
  assert.equal(glow.material.blending, THREE.AdditiveBlending, 'the glow adds light');
  assert.equal(glow.castShadow, false);
  h.setDistance(ARMOUR_LOD_DISTANCE[0] + 5);
  assert.deepEqual(shown(), ['cinderlock_arms__glow', 'cinderlock_arms__lod1', 'vanguard_field_set_chest__glow', 'vanguard_field_set_chest__lod1'],
    'channel strips stay on LOD0; the glow carries the lines at every distance');
  h.setDistance(ARMOUR_LOD_DISTANCE[1] + 5);
  assert.deepEqual(shown(), ['cinderlock_arms__glow', 'cinderlock_arms__lod2', 'vanguard_field_set_chest__glow', 'vanguard_field_set_chest__lod2']);
  h.setDistance(1);
  assert.equal(h.lod, 0);
  assert.ok(h.fx, 'channel effects and the arms anchor');
  h.dispose();
});

test('the channel glow widens and brightens with distance, within bounds', () => {
  let last = 0;
  for (const d of [0, 2, 5, 10, 20, 40, 80]) {
    const w = glowHalfWidth(d);
    assert.ok(w >= last && w >= 0.006 && w <= 0.045, `half-width ${w} at ${d} m`);
    last = w;
  }
  // a band about 3 px wide at 10 m on a 720 px, 60 degree view (1 px ~ 1.6 cm)
  assert.ok(glowHalfWidth(10) * 2 > 0.04);
  assert.ok(glowGain(1) < 0.4 && glowGain(20) === 1, 'faint up close, full at range');
  assert.ok(glowHalfWidth(NaN) > 0 && glowGain(undefined) > 0);
});
