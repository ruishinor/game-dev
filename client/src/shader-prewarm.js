import { snapshotShaderPrograms, describeNewShaderPrograms } from './shader-program-signatures.js';

// Opt-in experiment for first-use WebGL program stalls. Does not modify materials.
export function createShaderPrewarmer({
  renderer, scene, camera, enabled = false, timeoutMs = 20000,
  now = () => performance.now(), onEvent = () => {},
} = {}) {
  if (!renderer || !scene || !camera) throw new TypeError('Shader prewarmer requires renderer, scene and camera');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Timeout must be positive');
  const events = [];
  const programs = () => renderer.info?.programs?.length ?? null;
  let queue = Promise.resolve(), active = false, timedOut = false;
  function record(event) {
    events.push(event);
    if (events.length > 8) events.shift();
    try { onEvent(event); } catch { /* diagnostics never break gameplay */ }
    return event;
  }
  async function compile(stage) {
    if (!enabled || timedOut || typeof renderer.compileAsync !== 'function')
      return { stage, status: timedOut ? 'skipped-after-timeout' : 'disabled' };
    const started = now(), before = programs();
    const shaderProgramsBefore = snapshotShaderPrograms(renderer);
    let timer;
    active = true;
    let result;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => renderer.compileAsync(scene, camera)).then(() => ({ status: 'completed' })),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs); }),
      ]);
    } catch (error) {
      result = { status: 'failed', error: String(error?.message || error).slice(0, 200) };
    } finally {
      clearTimeout(timer);
      active = false;
    }
    if (result.status === 'timeout') timedOut = true; // Cannot abort in-flight driver work; do not start another compile.
    return record({
      stage, ...result, elapsedMs: Math.round((now() - started) * 10) / 10,
      programsBefore: before, programsAfter: programs(),
      newShaderPrograms: describeNewShaderPrograms(shaderProgramsBefore, renderer.info?.programs),
    });
  }
  return {
    enabled: !!enabled,
    warm(stage) {
      const run = queue.then(() => compile(stage));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
    get() { return { enabled: !!enabled, active, timedOut, events: events.slice() }; },
  };
}
