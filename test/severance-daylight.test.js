import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseTimeOfDay, todSegment, createTimeOfDay, TOD, TOD_KEYS } from '../client/src/severance-daylight.js';
import { buildSeverancePocket } from '../client/src/severance-pocket.js';
import { SEVERANCE_POCKET, SEVERANCE_GATE } from '../shared/severance-gate.js';

test('preview request parsing: keys, positions, loop; anything else is off', () => {
  assert.deepEqual(parseTimeOfDay(''), { mode: 'off' });
  assert.deepEqual(parseTimeOfDay('?tod=noon'), { mode: 'off' });
  assert.deepEqual(parseTimeOfDay('?tod=night'), { mode: 'hold', t: 0.5, period: 28 });
  assert.deepEqual(parseTimeOfDay('?tod=day'), { mode: 'hold', t: 0, period: 28 });
  assert.deepEqual(parseTimeOfDay('?tod=0.3'), { mode: 'hold', t: 0.3, period: 28 });
  assert.deepEqual(parseTimeOfDay('?tod=loop&todperiod=30'), { mode: 'loop', t: 0, period: 30 });
  assert.equal(parseTimeOfDay('?tod=1.5').mode, 'off');
});

test('the loop runs day -> dusk -> night -> dawn -> day with eased, continuous blends', () => {
  assert.deepEqual(todSegment(0), { from: 'day', to: 'dusk', k: 0 });
  assert.equal(todSegment(0.25).from, 'dusk');
  assert.equal(todSegment(0.5).from, 'night');
  assert.equal(todSegment(0.75).from, 'dawn');
  assert.equal(todSegment(0.999).to, 'day');
  assert.equal(todSegment(1).from, 'day');
  // continuity across a key boundary
  const a = todSegment(0.25 - 1e-6), b = todSegment(0.25);
  assert.ok(a.to === b.from && a.k > 0.999 && b.k < 1e-3);
  for (const k of TOD_KEYS) {
    assert.ok(TOD[k].sunI > 0 && TOD[k].hemiI > 0, k);
    assert.ok(TOD[k].spill >= 1, 'the warm portal spill is never dimmed by time of day');
  }
  assert.equal(TOD.night.stars, 1);
  assert.equal(TOD.day.stars, 0);
});

function rig() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x4c4868, 60, 260);
  const sky = new THREE.Group();
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.ShaderMaterial({ uniforms: { top: { value: new THREE.Color(0x070b22) }, mid: { value: new THREE.Color(0x253367) }, low: { value: new THREE.Color(0xc77b8c) } } }));
  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ transparent: true, opacity: 0.85 }));
  sky.add(skyMesh, stars);
  const ambient = new THREE.HemisphereLight(0xb0bcff, 0x5c4c6a, 1.55);
  const sun = new THREE.DirectionalLight(0xffd9b4, 2.9);
  const dir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  scene.add(sky, ambient, sun);
  return { scene, sky, skyMesh, stars, ambient, sun, dir };
}
const snap = (r) => JSON.stringify({ fog: [r.scene.fog.color.getHex(), r.scene.fog.near, r.scene.fog.far], sky: ['top', 'mid', 'low'].map((k) => r.skyMesh.material.uniforms[k].value.getHex()), pos: r.sky.position.toArray(), stars: r.stars.material.opacity,
  sun: [r.sun.color.getHex(), r.sun.intensity], dir: r.dir.toArray(), hemi: [r.ambient.color.getHex(), r.ambient.groundColor.getHex(), r.ambient.intensity] });

test('controller: off by default, applies only inside, restores the scene exactly', () => {
  const r = rig();
  let scale = 1;
  const tod = createTimeOfDay(THREE, { ...r, landmark: { setLightScale: (k) => { scale = k; } } });
  const before = snap(r);
  tod.update(0.1, true, SEVERANCE_POCKET);
  assert.equal(snap(r), before, 'preview off: nothing changes');
  tod.configure({ key: 'night' });
  tod.update(0.1, false, SEVERANCE_POCKET);
  assert.equal(snap(r), before, 'outside the Expanse: nothing changes');
  tod.update(0.1, true, SEVERANCE_POCKET);
  assert.notEqual(snap(r), before);
  assert.equal(r.stars.material.opacity, 0.9);
  assert.equal(r.sky.position.x, SEVERANCE_POCKET.x);
  assert.equal(scale, TOD.night.spill);
  assert.ok(r.sun.intensity < 1 && r.ambient.intensity < 1);
  assert.equal(tod.state.key, 'night');
  const toSun = r.sun.position.clone().sub(r.sun.target.position).normalize();
  assert.ok(toSun.distanceTo(new THREE.Vector3(...TOD.night.sunDir).normalize()) < 1e-6, 'the sun is re-aimed in the same frame');
  tod.update(0.1, false, SEVERANCE_POCKET);
  assert.equal(snap(r), before, 'leaving restores every lighting value');
  assert.equal(scale, 1);
  // a loop advances only with time, deterministically
  tod.configure({ mode: 'loop', t: 0, period: 20 });
  for (let i = 0; i < 50; i++) tod.update(0.1, true, SEVERANCE_POCKET);
  assert.ok(Math.abs(tod.state.t - 0.25) < 1e-9);
  assert.equal(tod.state.key, 'dusk');
  tod.update(0, true, SEVERANCE_POCKET);
  assert.ok(Math.abs(tod.state.t - 0.25) < 1e-9, 'a zero step does not move the loop');
  tod.configure({ mode: 'off' });
  assert.equal(snap(r), before);
});

test('pocket: time of day is independent of the gate phase, and a manual clock steps exactly', () => {
  const r = rig();
  const pocket = buildSeverancePocket(THREE, r.scene, { assets: null, ground: () => 0, rockGeo: () => new THREE.BoxGeometry(1, 1, 1), lighting: r });
  const eye = { x: SEVERANCE_GATE.x, y: 3, z: SEVERANCE_GATE.z - 40 };
  const reach = { x: 0, y: 3, z: 0 };
  pocket.update(0.1, 0, reach);
  const reachLook = snap(r);
  pocket.timeOfDay.configure({ key: 'night' });
  pocket.update(0.1, 0, eye);
  assert.equal(pocket.landmark.phase, 'dormant');
  const dormantNight = pocket.landmark.level;
  assert.ok(dormantNight < 0.2, 'a dormant gate stays dormant at night');
  pocket.landmark.setPhase('active');
  assert.equal(pocket.timeOfDay.state.key, 'night', 'gate phase does not change time of day');
  pocket.timeOfDay.configure({ key: 'day' });
  assert.equal(pocket.landmark.phase, 'active', 'time of day does not change the gate phase');
  // manual clock: live frames do not advance the presentation, steps do
  pocket.setManualClock(true);
  pocket.timeOfDay.configure({ mode: 'loop', t: 0, period: 28 });
  const t0 = pocket.landmark.state.time;
  for (let i = 0; i < 10; i++) pocket.update(0.1, 0, eye);
  assert.equal(pocket.landmark.state.time, t0);
  assert.equal(pocket.timeOfDay.state.t, 0);
  for (let i = 0; i < 70; i++) assert.ok(pocket.step(0.1));
  assert.ok(Math.abs(pocket.landmark.state.time - t0 - 7) < 1e-9);
  assert.ok(Math.abs(pocket.timeOfDay.state.t - 0.25) < 1e-9);
  assert.equal(pocket.landmark.state.discharges, 0, 'no random discharges in deterministic captures');
  pocket.setManualClock(false);
  // through the gate (the Annex is another region) and back
  pocket.update(0.1, 0, { x: 220, y: 2, z: 0 });
  assert.equal(snap(r), reachLook, 'the Annex sees the normal scene lighting');
  pocket.update(0.1, 0, eye);
  assert.notEqual(snap(r), reachLook);
  pocket.update(0.1, 0, reach);
  assert.equal(snap(r), reachLook, 'back in the Reach: normal lighting');
  pocket.landmark.dispose();
});
