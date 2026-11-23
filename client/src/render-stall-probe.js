import { snapshotShaderPrograms, describeNewShaderPrograms } from './shader-program-signatures.js';

// Opt-in, bounded browser render diagnostics. This measures synchronous
// renderer.render() wall time, not GPU execution time; it makes no claim that
// long calls are caused by a specific shader, model, or driver.
export function createRenderStallProbe({
  enabled = false,
  renderer,
  canvas,
  now = () => performance.now(),
  report = (event) => console.info('[attunement:render]', JSON.stringify(event)),
  slowRenderMs = 120,
  slowGapMs = 500,
  maxEvents = 80,
} = {}) {
  if (!renderer) throw new TypeError('Render probe requires a renderer.');
  const limit = Math.max(1, Math.min(200, Math.trunc(maxEvents) || 80));
  const events = [];
  const emptyStats = () => ({
    renders: 0,
    slowRenders: 0,
    longFrameGaps: 0,
    maxRenderMs: 0,
    totalRenderMs: 0,
    maxFrameGapMs: 0,
    contextLosses: 0,
    contextRestores: 0,
  });
  const stats = emptyStats();
  const round = (value) => Math.round(value * 10) / 10;
  // A separate diagnostic window prevents earlier startup stalls from being
  // incorrectly reported as the worst render in every subsequent scene.
  let activeWindow = { startedAtMs: enabled ? round(now()) : null, stats: emptyStats(), events: [] };
  function beginWindow() {
    if (!enabled) return false;
    activeWindow = { startedAtMs: round(now()), stats: emptyStats(), events: [] };
    return true;
  }
  let lastConsoleAt = -Infinity;
  let contextInfo = { isWebGL2: false, parallelShaderCompile: null };

  if (enabled) {
    try {
      const gl = renderer.getContext?.();
      contextInfo = {
        isWebGL2: !!renderer.capabilities?.isWebGL2,
        parallelShaderCompile: gl ? !!gl.getExtension('KHR_parallel_shader_compile') : null,
      };
    } catch {
      // Context inspection is diagnostic only; never prevent gameplay.
    }
  }

  const programCount = () => renderer.info?.programs?.length ?? null;
  function safeMetrics() {
    const info = renderer.info ?? {};
    const render = info.render ?? {};
    const memory = info.memory ?? {};
    return {
      programs: programCount(),
      drawCalls: render.calls ?? null,
      triangles: render.triangles ?? null,
      geometries: memory.geometries ?? null,
      textures: memory.textures ?? null,
      pixelRatio: renderer.getPixelRatio?.() ?? null,
      canvasWidth: canvas?.width ?? null,
      canvasHeight: canvas?.height ?? null,
    };
  }

  function record(kind, details = {}) {
    if (!enabled) return;
    const at = now();
    const event = { kind, atMs: round(at), atUnixMs: Date.now(), ...details };
    events.push(event);
    if (events.length > limit) events.shift();
    activeWindow.events.push(event);
    if (activeWindow.events.length > limit) activeWindow.events.shift();
    // A bounded history is available to the tester without console spam.
    if (at - lastConsoleAt >= 1500 || (details.renderMs ?? 0) >= 1000) {
      lastConsoleAt = at;
      report(event);
    }
  }

  function measure(stage, quality, draw) {
    if (!enabled) return draw();
    const began = now();
    const programsBefore = programCount();
    const shaderProgramsBefore = snapshotShaderPrograms(renderer);
    try {
      return draw();
    } finally {
      const duration = round(Math.max(0, now() - began));
      stats.renders++;
      activeWindow.stats.renders++;
      stats.totalRenderMs = round(stats.totalRenderMs + duration);
      activeWindow.stats.totalRenderMs = round(activeWindow.stats.totalRenderMs + duration);
      stats.maxRenderMs = Math.max(stats.maxRenderMs, duration);
      activeWindow.stats.maxRenderMs = Math.max(activeWindow.stats.maxRenderMs, duration);
      if (duration >= slowRenderMs) {
        stats.slowRenders++;
        activeWindow.stats.slowRenders++;
        const metrics = safeMetrics();
        const newShaderPrograms = describeNewShaderPrograms(shaderProgramsBefore, renderer.info?.programs);
        record('slow-render', {
          stage, quality, beganAtMs: round(began), renderMs: duration,
          programsBefore,
          programsAdded: newShaderPrograms?.count ?? (programsBefore === null || metrics.programs === null
            ? null : metrics.programs - programsBefore),
          newShaderPrograms,
          ...metrics,
        });
      }
    }
  }

  function frameGap(gapMs, quality, hidden = false) {
    if (!enabled || !Number.isFinite(gapMs) || gapMs < 0) return;
    stats.maxFrameGapMs = Math.max(stats.maxFrameGapMs, round(gapMs));
    activeWindow.stats.maxFrameGapMs = Math.max(activeWindow.stats.maxFrameGapMs, round(gapMs));
    if (gapMs >= slowGapMs) {
      stats.longFrameGaps++;
      activeWindow.stats.longFrameGaps++;
      record('frame-gap', { gapMs: round(gapMs), quality, hidden: !!hidden });
    }
  }

  const onLost = () => {
    stats.contextLosses++;
    activeWindow.stats.contextLosses++;
    record('webgl-context-lost');
  };
  const onRestored = () => {
    stats.contextRestores++;
    activeWindow.stats.contextRestores++;
    record('webgl-context-restored');
  };
  if (enabled) {
    canvas?.addEventListener?.('webglcontextlost', onLost);
    canvas?.addEventListener?.('webglcontextrestored', onRestored);
  }

  function get() {
    return {
      enabled,
      stats: { ...stats },
      context: { ...contextInfo },
      events: events.slice(),
      window: {
        startedAtMs: activeWindow.startedAtMs,
        stats: { ...activeWindow.stats },
        events: activeWindow.events.slice(),
      },
    };
  }
  function dispose() {
    if (!enabled) return;
    canvas?.removeEventListener?.('webglcontextlost', onLost);
    canvas?.removeEventListener?.('webglcontextrestored', onRestored);
  }

  return { enabled, measure, frameGap, beginWindow, get, dispose };
}
