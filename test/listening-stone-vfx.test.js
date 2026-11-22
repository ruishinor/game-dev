import test from 'node:test';
import assert from 'node:assert/strict';
import { STONE_VFX_BUDGET, listeningStonePresentation } from '../client/src/listening-stone-presentation.js';

test('Listening Stone: graphics quality limits costs but does not imply reduced motion', () => {
  const low = listeningStonePresentation({ wake: 1, cast: 1, effectsQuality: 0 });
  const medium = listeningStonePresentation({ wake: 1, cast: 1, effectsQuality: 1 });
  const high = listeningStonePresentation({ wake: 1, cast: 1, effectsQuality: 2 });
  assert.deepEqual([low.waveCount, medium.waveCount, high.waveCount], [1, 2, 3]);
  assert.deepEqual([low.moteCount, medium.moteCount, high.moteCount], [28, 48, 70]);
  assert.equal(low.ringSpeed, high.ringSpeed, 'graphics quality may not silently slow the Stone');
  assert.deepEqual(STONE_VFX_BUDGET, { waves: 3, motes: 70, lights: 1 });
});
test('Listening Stone: explicit reduced motion suppresses traveling waves at all presets', () => {
  for (const effectsQuality of [0, 1, 2]) {
    const normal = listeningStonePresentation({ wake: 1, cast: 1, effectsQuality });
    const calm = listeningStonePresentation({ wake: 1, cast: 1, effectsQuality, reducedMotion: true });
    assert.ok(normal.waveCount > 0);
    assert.equal(calm.waveCount, 0);
    assert.ok(calm.ringSpeed < normal.ringSpeed);
    assert.ok(calm.moteSpeed < normal.moteSpeed);
  }
});
test('Listening Stone: casting builds a stronger bounded continuous-motion profile', () => {
  const idle = listeningStonePresentation({ wake: 1, cast: 0 });
  const active = listeningStonePresentation({ wake: 1, cast: 1 });
  assert.ok(active.ringSpeed > idle.ringSpeed);
  assert.ok(active.orbitSpeed > idle.orbitSpeed);
  assert.ok(active.medallionSpeed > idle.medallionSpeed);
  assert.ok(active.lampIntensity > idle.lampIntensity);
  assert.ok(active.beamOpacity > idle.beamOpacity);
  assert.ok(active.waveInterval < idle.waveInterval);
  assert.ok(active.waveInterval > 0.9);
  assert.ok(active.lampIntensity <= 48, 'one local light may not flood the hollow');
  assert.ok(active.beamOpacity <= 0.3, 'sky beam remains translucent');
});
test('Listening Stone: malformed state cannot exceed budgets or produce invalid motion', () => {
  for (const state of [{wake:Infinity,cast:NaN,effectsQuality:99},{wake:-2,cast:5,effectsQuality:-1},{}, {wake:1,cast:1,reducedMotion:true,effectsQuality:0}]) {
    const p = listeningStonePresentation(state);
    for (const key of ['energy','ringSpeed','orbitSpeed','medallionSpeed','moteSpeed','waveInterval','lampIntensity','beamOpacity'])
      assert.ok(Number.isFinite(p[key]),key);
    assert.ok(p.waveCount >= 0 && p.waveCount <= STONE_VFX_BUDGET.waves);
    assert.ok(p.moteCount >= 0 && p.moteCount <= STONE_VFX_BUDGET.motes);
    assert.ok(p.lampIntensity <= 48);
  }
});
