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
  const stats = {
    renders: 0,
    slowRenders: 0,
    longFrameGaps: 0,
    maxRenderMs: 0,
    totalRenderMs: 0,
    maxFrameGapMs: 0,
    contextLosses: 0,
    contextRestores: 0,
  };
  const round = (value) => Math.round(value * 10) / 10;
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
    try {
      return draw();
    } finally {
      const duration = round(Math.max(0, now() - began));
      stats.renders++;
      stats.totalRenderMs = round(stats.totalRenderMs + duration);
      stats.maxRenderMs = Math.max(stats.maxRenderMs, duration);
      if (duration >= slowRenderMs) {
        stats.slowRenders++;
        const metrics = safeMetrics();
        record('slow-render', {
          stage, quality, beganAtMs: round(began), renderMs: duration,
          programsBefore,
          programsAdded: programsBefore === null || metrics.programs === null
            ? null : metrics.programs - programsBefore,
          ...metrics,
        });
      }
    }
  }

  function frameGap(gapMs, quality, hidden = false) {
    if (!enabled || !Number.isFinite(gapMs) || gapMs < 0) return;
    stats.maxFrameGapMs = Math.max(stats.maxFrameGapMs, round(gapMs));
    if (gapMs >= slowGapMs) {
      stats.longFrameGaps++;
      record('frame-gap', { gapMs: round(gapMs), quality, hidden: !!hidden });
    }
  }

  const onLost = () => {
    stats.contextLosses++;
    record('webgl-context-lost');
  };
  const onRestored = () => {
    stats.contextRestores++;
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
    };
  }
  function dispose() {
    if (!enabled) return;
    canvas?.removeEventListener?.('webglcontextlost', onLost);
    canvas?.removeEventListener?.('webglcontextrestored', onRestored);
  }

  return { enabled, measure, frameGap, get, dispose };
}
