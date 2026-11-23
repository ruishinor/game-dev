import test from 'node:test';
import assert from 'node:assert/strict';
import { createShaderPrewarmer } from '../client/src/shader-prewarm.js';

function fixture(opts = {}) {
  const scene = {}, camera = {}, events = [];
  const renderer = { info: { programs: [{}] }, compileAsync: async () => { renderer.info.programs.push({}); } };
  const warmer = createShaderPrewarmer({ renderer, scene, camera, enabled: true, onEvent: event => events.push(event), ...opts });
  return { renderer, warmer, events };
}

test('precompiles once without drawing or mutating scene', async () => {
  const f = fixture();
  const result = await f.warmer.warm('title');
  assert.equal(result.status, 'completed');
  assert.equal(result.programsBefore, 1);
  assert.equal(result.programsAfter, 2);
  assert.equal(f.events.length, 1);
});
test('opt-out has no GPU calls', async () => {
  const f = fixture({ enabled: false });
  f.renderer.compileAsync = () => { throw Error('Must not compile'); };
  assert.equal((await f.warmer.warm('world')).status, 'disabled');
  assert.equal(f.warmer.get().events.length, 0);
});
test('hanging shader preparation times out and skips further overlapping compiles', async () => {
  const f = fixture({ timeoutMs: 15 });
  f.renderer.compileAsync = () => new Promise(() => {});
  assert.equal((await f.warmer.warm('title')).status, 'timeout');
  assert.equal((await f.warmer.warm('world')).status, 'skipped-after-timeout');
  assert.equal(f.warmer.get().active, false);
});
test('compile failure does not poison next stage', async () => {
  const f = fixture(); let calls = 0;
  f.renderer.compileAsync = async () => { if (++calls === 1) throw Error('Failure'); };
  const [first, second] = await Promise.all([f.warmer.warm('title'), f.warmer.warm('world')]);
  assert.equal(first.status, 'failed');
  assert.equal(second.status, 'completed');
});
test('recorded history retains at most 8 events', async () => {
  const f = fixture();
  for (let i = 0; i < 15; i++) await f.warmer.warm('title');
  assert.equal(f.warmer.get().events.length, 8);
});
