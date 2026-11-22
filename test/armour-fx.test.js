// Live armour effects (client/src/armour-fx.js): one shared channel material
// per wearer, bounded halos and embers on the wearer's bones, quality and
// reduced-motion handling, combat surge, and a clean dispose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachArmourFxEnv, createArmourFx, CHANNEL_MATERIAL } from '../client/src/armour-fx.js';

function rig() {
  const bones = Object.fromEntries(['spine_03', 'spine_02', 'lowerarm_l'].map((n) => { const b = new THREE.Bone(); b.name = n; return [n, b]; }));
  const fx = [0, 1].map(() => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: CHANNEL_MATERIAL })));
  const anchors = [
    { kind: 'core', bone: bones.spine_03, position: new THREE.Vector3(0, 0.1, 0.12) },
    { kind: 'vent', bone: bones.spine_02, position: new THREE.Vector3(0.15, 0, 0) },
    { kind: 'core_s', bone: bones.lowerarm_l, position: new THREE.Vector3(0.1, 0.02, 0) },
  ];
  return { bones, fx, anchors };
}

test('channel meshes share one animated material; the shader reads the flow UV', () => {
  const { fx, anchors } = rig();
  const h = createArmourFx(fx, anchors);
  assert.equal(fx[0].material, fx[1].material);
  assert.equal(fx[0].material.toneMapped, false);
  const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <uv_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  fx[0].material.onBeforeCompile(sh);
  assert.match(sh.vertexShader, /vFlow = uv;/);
  assert.match(sh.fragmentShader, /flowD = vFlow\.x/);
  for (const k of ['uTime', 'uLevel', 'uSurge', 'uSurgeAge', 'uMotion']) assert.ok(sh.uniforms[k], k);
  h.dispose();
});

test('halos and embers hang on the wearer bones and respect quality and reduced motion', () => {
  const { bones, fx, anchors } = rig();
  let quality = 2, reduced = false;
  attachArmourFxEnv({ quality: () => quality, reducedMotion: () => reduced, intensity: () => 1 });
  const h = createArmourFx(fx, anchors);
  const sprites = Object.values(bones).flatMap((b) => b.children.filter((c) => c.isSprite));
  const embers = Object.values(bones).flatMap((b) => b.children.filter((c) => c.isPoints));
  assert.equal(sprites.length, 3);
  assert.equal(embers.length, 2, 'core and vent shed embers; the small vambrace core does not');
  h.update(0.016, { combat: true, cameraDistance: 4 });
  assert.ok(sprites.every((s) => s.visible) && embers.every((e) => e.visible));
  reduced = true;
  h.surge('attack');
  h.update(0.016, { cameraDistance: 4 });
  assert.ok(embers.every((e) => !e.visible), 'reduced motion drops embers');
  assert.equal(fx[0].material.userData.surge ?? 0, 0);
  quality = 0; reduced = false;
  h.update(0.016, { cameraDistance: 4 });
  assert.ok(sprites.some(s => s.visible), 'low quality keeps the white-hot Cinderlock reactor');
  assert.ok(sprites.filter(s => s.visible).length === 1, 'low quality shows only the existing core');
  assert.ok(embers.every((e) => !e.visible), 'quality 0 still drops all particle emissions');
  quality = 1;
  h.update(0.016, { cameraDistance: 4 });
  assert.equal(embers.filter(e => e.visible).length, 1, 'standard quality keeps only the bounded core ember emitter');
  assert.ok(sprites.find(s => s.visible && s.material.color.getHex() === 0xffe7ce), 'Cinderlock core has its distinct white-hot identity');
  quality = 2;
  h.update(0.016, { cameraDistance: 40 });
  assert.ok(embers.every((e) => !e.visible), 'no embers at distance');
  h.dispose();
  assert.equal(Object.values(bones).flatMap((b) => b.children).length, 0, 'dispose removes every halo and emitter');
  assert.equal(fx[0].material.name, CHANNEL_MATERIAL);
  assert.ok(fx[0].material.isMeshStandardMaterial, 'dispose restores the source material');
  attachArmourFxEnv({ quality: () => 2, reducedMotion: () => false, intensity: () => 1 });
});

test('anchors are bounded per wearer', () => {
  const { bones, fx } = rig();
  const many = Array.from({ length: 40 }, () => ({ kind: 'spark', bone: bones.spine_03, position: new THREE.Vector3() }));
  const h = createArmourFx(fx, many);
  assert.ok(bones.spine_03.children.filter((c) => c.isSprite).length <= 14);
  h.dispose();
});

test('a worn piece hides the body shells it replaces, ref-counted across slots', async () => {
  const { wearArmour } = await import('../client/src/armour-visual.js');
  const skinned = (name, bones) => {
    const m = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    m.name = name;
    m.bind(new THREE.Skeleton(bones));
    return m;
  };
  const bone = () => { const b = new THREE.Bone(); b.name = 'pelvis'; return b; };
  const inst = new THREE.Group();
  const ib = bone();
  inst.add(ib);
  inst.add(skinned('body', [ib]));
  const shells = Object.fromEntries(['shell_coat', 'shell_forearms', 'shell_shorts'].map((n) => { const m = new THREE.Mesh(); m.name = n; inst.add(m); return [n, m]; }));
  const source = (item, hides) => {
    const g = new THREE.Group();
    const b = bone();
    g.add(b);
    const piece = skinned(item, [b]);
    piece.userData.hides = hides;
    g.add(piece);
    return g;
  };
  const srcs = {
    vanguard_field_set_chest: ['shell_coat', 'shell_forearms'],
    vanguard_field_set_gloves: ['shell_forearms'],
  };
  const wear = (item) => wearArmour({ instance: () => source(item, srcs[item]) }, inst, 'humanoid_m', item);
  const chest = wear('vanguard_field_set_chest');
  const gloves = wear('vanguard_field_set_gloves');
  assert.deepEqual(chest.hidden.sort(), ['shell_coat', 'shell_forearms']);
  assert.equal(shells.shell_coat.visible, false);
  assert.equal(shells.shell_forearms.visible, false);
  assert.equal(shells.shell_shorts.visible, true, 'shells not listed stay visible');
  chest.dispose();
  assert.equal(shells.shell_coat.visible, true, 'restored when its only wearer goes');
  assert.equal(shells.shell_forearms.visible, false, 'still hidden by the gloves');
  gloves.dispose();
  assert.equal(shells.shell_forearms.visible, true);
});

test('each family keeps its own energy language and answers its own class abilities through the shared engine', async () => {
  const { FAMILIES, familyOf, isChannelMaterial, isGlassMaterial } = await import('../client/src/armour-fx.js');
  assert.deepEqual(Object.keys(FAMILIES).sort(), ['CL', 'MY', 'SW', 'VG']);
  assert.equal(new Set(Object.values(FAMILIES).map((f) => f.mode)).size, 4, 'four distinct channel behaviours');
  assert.equal(FAMILIES.SW.particles, null, 'Strataweave sheds nothing');
  for (const k of ['CL', 'VG', 'MY', 'SW']) {
    assert.ok(isChannelMaterial(`${k}_Channel`) && familyOf(`${k}_Channel`) === k);
  }
  assert.ok(isGlassMaterial('VG_Glass') && !isGlassMaterial('armour_keeper_field_set_chest'));
  const bursts = [];
  const engine = { burst: (o) => { bursts.push(o); return 1; }, flash: () => null };
  attachArmourFxEnv({ quality: () => 2, reducedMotion: () => false, intensity: () => 1, vfx: () => engine });
  const bone = new THREE.Bone();
  const make = (fam) => createArmourFx([new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: `${fam}_Channel` }))],
    [{ kind: 'core', bone, position: new THREE.Vector3() }],
    [new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: `${fam}_Glass`, transparent: true }))]);
  const vg = make('VG');
  assert.equal(vg.family, 'VG');
  vg.surge('ability', 'lattice_relay');
  assert.ok(bursts.length > 0);
  for (let i = 0; i < 30; i++) vg.update(0.05, {});
  assert.ok(vg.sustain > 0.5, 'a barrier cast holds the prisms bright');
  for (let i = 0; i < 200; i++) vg.update(0.05, {});
  assert.ok(vg.sustain < 0.1, 'and lets them settle');
  const n = bursts.length;
  attachArmourFxEnv({ quality: () => 2, reducedMotion: () => true, intensity: () => 1, vfx: () => engine });
  vg.surge('ability', 'hinge_field');
  assert.equal(bursts.length, n, 'reduced motion adds no particles');
  vg.setComplete(true);
  vg.dispose();
  assert.equal(bone.children.length, 0);
  attachArmourFxEnv({ quality: () => 2, reducedMotion: () => false, intensity: () => 1, vfx: () => null });
});

test('complete Cinderlock Regalia has a brighter channel signature without changing other families', () => {
  const {fx,anchors}=rig(),h=createArmourFx(fx,anchors);
  const normal=h.material.onBeforeCompile;
  const mk=()=>({uniforms:{},vertexShader:'#include <common>\n#include <uv_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'});
  const shader=mk();
  normal(shader);
  const before=shader.uniforms.uBright.value;
  h.setComplete(true);
  assert.ok(shader.uniforms.uBright.value>before*1.3,'all-four Cinderlock channels brighten together');
  h.setComplete(false);
  assert.equal(shader.uniforms.uBright.value,before,'unequipping a piece cancels the set glow');
  h.dispose();
});
