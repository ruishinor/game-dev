import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGearKit, mergeGeometries } from '../client/src/gear-kit.js';
import { SIGNATURE_GEAR } from '../client/src/gear-recipes.js';

const BONES = new Set(['spine_03', 'Head', 'pelvis', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r']);
const shared = (r) => { if (r.isBufferGeometry) r.userData.shared = true; else r.isShared = true; return r; };
const ctx = () => { const attached = []; return { attached, attach(bone, obj) { attached.push({ bone, obj }); } }; };
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

test('gear: merge keeps every vertex and attribute', () => {
  const a = new THREE.BoxGeometry(1, 1, 1);
  const b = new THREE.CylinderGeometry(1, 1, 1, 8);
  const m = mergeGeometries(THREE, [a, b]);
  assert.equal(m.getAttribute('position').count, a.toNonIndexed().getAttribute('position').count + b.toNonIndexed().getAttribute('position').count);
  for (const k of ['normal', 'uv']) assert.equal(m.getAttribute(k).count, m.getAttribute('position').count);
});

test('gear: every signature look builds finite, bounded, budgeted geometry on known bones', () => {
  const kit = createGearKit(THREE, { shared });
  assert.deepEqual(Object.keys(SIGNATURE_GEAR).sort(), ['aegis_keeper', 'brine_surveyor', 'conductor', 'vanguard_plate']);
  for (const [look, recipe] of Object.entries(SIGNATURE_GEAR)) {
    const built = kit.build(look, recipe);
    let triangles = 0;
    for (const part of [...built.statics, ...built.dynamic]) {
      assert.ok(BONES.has(part.bone), `${look}: unknown bone ${part.bone}`);
      const p = part.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        assert.ok([x, y, z].every(Number.isFinite), `${look}: non-finite vertex`);
        // Within reach of a 1.8 m figure in bind pose (arms out to ~0.8 m).
        assert.ok(Math.abs(x) < 0.85 && y > 0.8 && y < 2.0 && Math.abs(z) < 0.45, `${look}: vertex out of bounds ${x},${y},${z}`);
      }
      triangles += tris(part.geometry);
    }
    assert.ok(triangles < 9000, `${look}: ${triangles} triangles`);
    assert.ok(built.statics.length + built.dynamic.length <= 22, `${look}: ${built.statics.length + built.dynamic.length} draw calls`);
    assert.ok(built.dynamic.some((d) => d.type === 'segments'), `${look}: no charge indicator`);
  }
});

test('gear: wearers share static geometry and materials; animated parts are per character', () => {
  const kit = createGearKit(THREE, { shared });
  const a = ctx();
  const b = ctx();
  const ua = kit.instantiate('conductor', SIGNATURE_GEAR.conductor, a);
  const ub = kit.instantiate('conductor', SIGNATURE_GEAR.conductor, b);
  assert.equal(a.attached.length, b.attached.length);
  for (let i = 0; i < a.attached.length; i++) {
    const [ma, mb] = [a.attached[i].obj, b.attached[i].obj];
    assert.equal(ma.geometry, mb.geometry);
    assert.ok(ma.geometry.userData.shared, 'geometry must be flagged shared so entity disposal skips it');
    if (ma.material.isShaderMaterial) assert.notEqual(ma.material, mb.material);
    else { assert.equal(ma.material, mb.material); assert.ok(ma.material.isShared); }
  }
  // Animated state follows the owner; a remote wearer never reads another's resource.
  const fluid = (c) => c.attached.find((x) => x.obj.name.endsWith(':fluid')).obj.material.uniforms;
  const seg = (c) => c.attached.find((x) => x.obj.name.endsWith(':segments')).obj.material.uniforms;
  for (let i = 0; i < 200; i++) { ua({ t: i / 30, charge: 1, self: true, combat: true }); ub({ t: i / 30, charge: 1, self: false }); }
  assert.ok(seg(a).level.value > 0.95);
  assert.ok(Math.abs(seg(b).level.value - 0.6) < 0.02);
  assert.ok(fluid(a).fill.value > fluid(b).fill.value);
  ua({ t: NaN, charge: NaN, self: true });
  assert.ok(Number.isFinite(seg(a).level.value) && Number.isFinite(fluid(a).t.value));
  kit.dispose();
  assert.equal(kit.looks, 0);
});

test('gear: deployable field rig stands on its own origin within budget', async () => {
  const { fieldRigDevice } = await import('../client/src/gear-recipes.js');
  const kit = createGearKit(THREE, { shared });
  const built = kit.build('field_rig', fieldRigDevice);
  let triangles = 0;
  for (const part of [...built.statics, ...built.dynamic]) {
    assert.equal(part.bone, 'root');
    const p = part.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(p.getX(i)) < 0.7 && Math.abs(p.getZ(i)) < 0.7 && p.getY(i) > -0.05 && p.getY(i) < 1.8, 'rig vertex out of bounds');
    }
    triangles += tris(part.geometry);
  }
  assert.ok(triangles < 6000, `${triangles}`);
  assert.ok(built.statics.length + built.dynamic.length <= 12);
});
