import test from 'node:test';
import assert from 'node:assert/strict';
import { FEN_SITES, fenHeight } from '../shared/lumenfen.js';
import { createLumenfenSiteFx, LUMENFEN_SITE_FX_BUDGET } from '../client/src/lumenfen-site-fx.js';

const site = id => {
  const found = FEN_SITES.find(s => s.id === id);
  assert.ok(found, 'known Lumenfen landmark: ' + id);
  return found;
};
function fixture() {
  const calls = { bursts: [], beams: [] };
  const engine = {
    quality: 2, reducedMotion: false, calmFlashes: false,
    burst(o) { calls.bursts.push(o); return o.count; },
    beam(o) { calls.beams.push(o); return {}; },
  };
  return { engine, calls, fx: createLumenfenSiteFx(engine) };
}
const tick = (fx, focus, count = 90) => {
  for (let i = 0; i < count; i++) fx.update(0.1, focus);
};

test('site atmosphere is localized to six actual world landmarks, bounded and distinct', () => {
  for (const id of FEN_SITES.map(s => s.id)) {
    const { fx, calls } = fixture();
    const p = site(id);
    tick(fx, { x: p.x, z: p.z });
    assert.ok(calls.bursts.length >= 1 && calls.bursts.length <= 3,
      'site cadence should not emit continuously: ' + id);
    for (const b of calls.bursts) {
      assert.ok(b.count > 0 && b.count <= LUMENFEN_SITE_FX_BUDGET.maxParticlesPerBurst);
      assert.equal(b.blend, 'alpha');
      assert.ok(b.size[1] < 0.05 && b.alpha < 0.5, 'no white-ball large glow sprites');
      assert.ok(b.at.every(Number.isFinite));
      assert.ok(Math.hypot(b.at[0] - p.x, b.at[2] - p.z) < 9, 'emit at site machinery');
      assert.ok(b.at[1] > fenHeight(b.at[0], b.at[2]));
    }
    assert.equal(fx.stats().emissions[id], calls.bursts.length);
    fx.dispose();
  }
});

test('quality, accessibility, distance, frozen frames and disposal gate decorative VFX', () => {
  const { fx, calls, engine } = fixture();
  const p = site('glasswater-spring');
  const focus = { x: p.x, z: p.z };
  tick(fx, { x: 0, z: 0 });
  tick(fx, { x: p.x + 50, z: p.z });
  fx.update(NaN, focus);
  fx.update(-1, focus);
  assert.equal(calls.bursts.length, 0);
  engine.quality = 0;
  tick(fx, focus);
  engine.quality = 1;
  engine.reducedMotion = true;
  tick(fx, focus);
  assert.equal(calls.bursts.length, 0);
  engine.reducedMotion = false;
  tick(fx, focus);
  assert.ok(calls.bursts.length > 0, 'quality 1 must retain lower-cost effects');
  const count = calls.bursts.length;
  fx.dispose(); fx.dispose();
  tick(fx, focus);
  assert.equal(calls.bursts.length, count);
  assert.equal(fx.stats().disposed, true);
});

test('short-lived observatory resonance uses engine beams only at high detail and without calm flashes', () => {
  const p = site('root-crown-hollow');
  const focus = { x: p.x, z: p.z };
  const { fx, calls, engine } = fixture();
  tick(fx, focus);
  assert.equal(calls.beams.length, calls.bursts.length);
  assert.ok(calls.beams.length > 0);
  for (const b of calls.beams) {
    assert.ok(b.width <= 0.012 && b.life <= 0.28 && b.alpha <= 0.19);
    assert.ok(b.from.every(Number.isFinite) && b.to.every(Number.isFinite));
    assert.ok(Math.hypot(b.to[0] - b.from[0], b.to[2] - b.from[2]) < 2);
  }
  const before = calls.beams.length;
  engine.calmFlashes = true;
  tick(fx, focus);
  assert.equal(calls.beams.length, before, 'calm flashes removes decorative beam');
  engine.calmFlashes = false;
  engine.quality = 1;
  tick(fx, focus);
  assert.equal(calls.beams.length, before, 'quality 1 avoids extra shader ribbon');
  fx.dispose();
});

test('clamped dt prevents a suspended frame from causing an effect cascade', () => {
  const { fx, calls } = fixture();
  const p = site('tidal-weir');
  for (let i = 0; i < 18; i++) fx.update(7, { x: p.x, z: p.z });
  assert.ok(calls.bursts.length <= 1, 'a frame gap is not simulated as 126 seconds');
  fx.dispose();
});
