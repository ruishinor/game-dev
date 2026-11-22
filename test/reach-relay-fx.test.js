import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROPS } from '../shared/world.js';
import { buildRelayTower } from '../client/src/relay-tower.js';
import { RELAY_FX_BUDGET, createReachRelayFx } from '../client/src/reach-relay-fx.js';

function fixture() {
  const prop = PROPS.find(p => p.type === 'relaytower');
  assert.ok(prop);
  const tower = buildRelayTower(THREE, prop);
  tower.group.position.set(prop.x, 0, prop.z);
  const calls = { arcs: [], bursts: [] };
  const vfx = {
    quality: 2, reducedMotion: false,
    lightning(o) { calls.arcs.push(o); return { done: false }; },
    burst(o) { calls.bursts.push(o); return o.count; },
  };
  const fx = createReachRelayFx(THREE, tower.group, vfx);
  const focus = { x: prop.x, z: prop.z };
  return { prop, tower, vfx, fx, calls, focus };
}

test('Relay fault is localized to real cabinet contacts and strictly bounded', () => {
  const { tower, fx, calls, focus } = fixture();
  for (let i = 0; i < 25; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 1);
  assert.equal(calls.bursts.length, 1);
  assert.equal(calls.arcs[0].branches, 0);
  assert.ok(calls.bursts[0].count <= RELAY_FX_BUDGET.sparks);
  const [from, to] = [calls.arcs[0].from, calls.arcs[0].to];
  for (const point of [from, to]) {
    assert.ok(point.every(Number.isFinite));
    assert.ok(Math.hypot(point[0]-focus.x, point[2]-focus.z) < 2);
    assert.ok(point[1] > 0.5 && point[1] < 2);
  }
  for (let i = 0; i < 30; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 1, 'no per-frame discharge spam');
  assert.equal(fx.stats().activations, 1);
  fx.dispose(); fx.dispose(); tower.dispose();
});

test('Relay fault respects distance, low-quality, reduced motion and disposal', () => {
  const { tower, fx, vfx, calls, focus } = fixture();
  for (let i = 0; i < 30; i++) fx.update(.1, { x: focus.x+100, z: focus.z });
  assert.equal(calls.arcs.length, 0);
  vfx.quality = 0;
  for (let i = 0; i < 30; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 0);
  vfx.quality = 2; vfx.reducedMotion = true;
  for (let i = 0; i < 30; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 0);
  vfx.reducedMotion = false;
  for (let i = 0; i < 25; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 1);
  fx.dispose();
  for (let i = 0; i < 100; i++) fx.update(.1, focus);
  assert.equal(calls.arcs.length, 1);
  tower.dispose();
});
