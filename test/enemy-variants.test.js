import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyEnemyVariant, ENEMY_VARIANTS } from '../client/src/enemy-variants.js';
import { makeGame } from './helpers.js';

function rig() {
  const group = new THREE.Group();
  const base = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 2), base);
  body.position.y = 0.8;
  group.add(body);
  const spine = new THREE.Bone(); spine.name = 'Spine2'; spine.position.y = 1.1; group.add(spine);
  let ticks = 0;
  return { base, model: { group, update() { ticks++; }, dispose() {}, get ticks() { return ticks; } } };
}

test('regional variants: cloned materials with an ember vein layer, crystal growths on the spine, disposable', () => {
  assert.deepEqual([...ENEMY_VARIANTS].sort(), ['ash', 'foundry']);
  for (const vx of ENEMY_VARIANTS) {
    const { base, model } = rig();
    const m = applyEnemyVariant(THREE, model, vx);
    const body = m.group.children[0];
    assert.notEqual(body.material, base, 'shared asset materials are never modified');
    assert.notEqual(body.material.color.getHex(), base.color.getHex());
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    body.material.onBeforeCompile(sh);
    assert.match(sh.vertexShader, /vVein = transformed/);
    assert.match(sh.fragmentShader, /totalEmissiveRadiance \+= uVeinColor/);
    const growth = m.group.getObjectByName('enemy-variant:' + vx);
    assert.ok(growth && growth.parent.isBone, 'growths ride the spine bone');
    m.update(0.5, {});
    assert.equal(sh.uniforms.uVeinTime.value, 0.5);
    m.dispose();
    assert.equal(m.group.getObjectByName('enemy-variant:' + vx), undefined);
  }
  const { model } = rig();
  assert.equal(applyEnemyVariant(THREE, model, 'bogus'), model);
  assert.equal(model.group.getObjectByName('enemy-variant:bogus'), undefined);
});

test('the server tags Expanse patrols and Foundry enemies with their variant; Reach enemies stay plain', () => {
  const g = makeGame();
  g.openExpanse();
  const patrol = g.enemies.find((e) => e.severancePatrol);
  assert.equal(g.metaFor(patrol).vx, 'ash');
  const reach = g.enemies.find((e) => !e.severancePatrol);
  assert.equal(g.metaFor(reach).vx, undefined);
});
