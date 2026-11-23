import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderStallProbe } from '../client/src/render-stall-probe.js';

function fixture() {
  let time = 0;
  const reports = [];
  const canvas = new EventTarget();
  canvas.width = 1920;
  canvas.height = 1080;
  const renderer = {
    info: {
      programs: [{}],
      render: { calls: 55, triangles: 78000 },
      memory: { geometries: 120, textures: 36 },
    },
    capabilities: { isWebGL2: true },
    getPixelRatio: () => 1.5,
    getContext: () => ({ getExtension: (name) => name === 'KHR_parallel_shader_compile' ? {} : null }),
  };
  const probe = createRenderStallProbe({
    enabled: true, renderer, canvas,
    now: () => time,
    report: (event) => reports.push(event),
    maxEvents: 3,
  });
  return { probe, renderer, canvas, reports, advance(ms) { time += ms; } };
}

test('records synchronous render cost and bounded metrics without player details', () => {
  const f = fixture();
  let returned;
  returned = f.probe.measure('world', 2, () => {
    f.renderer.info.programs.push({});
    f.advance(8113.4);
    return 'render-result';
  });
  assert.equal(returned, 'render-result');
  const s = f.probe.get();
  assert.equal(s.stats.renders, 1);
  assert.equal(s.stats.slowRenders, 1);
  assert.equal(s.stats.maxRenderMs, 8113.4);
  assert.equal(s.events[0].kind, 'slow-render');
  assert.equal(s.events[0].programsAdded, 1);
  assert.equal(s.events[0].drawCalls, 55);
  assert.equal(s.events[0].triangles, 78000);
  assert.equal(s.events[0].canvasWidth, 1920);
  assert.equal(s.context.parallelShaderCompile, true);
  assert.equal(f.reports.length, 1);
  f.probe.dispose();
});

test('distinguishes slow scheduling gaps, hidden tabs and WebGL context events', () => {
  const f = fixture();
  f.probe.frameGap(8283.4, 2, true);
  f.advance(2000);
  f.probe.measure('world', 1, () => f.advance(10));
  f.advance(2000);
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  f.advance(2000);
  f.canvas.dispatchEvent(new Event('webglcontextrestored'));
  const s = f.probe.get();
  assert.equal(s.stats.longFrameGaps, 1);
  assert.equal(s.stats.maxFrameGapMs, 8283.4);
  assert.equal(s.stats.maxRenderMs, 10);
  assert.equal(s.stats.contextLosses, 1);
  assert.equal(s.stats.contextRestores, 1);
  assert.equal(s.events.length, 3, 'history remains bounded');
  assert.ok(s.events.some((event) => event.kind === 'webgl-context-lost'));
  f.probe.dispose();
  f.advance(2000);
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(f.probe.get().stats.contextLosses, 1, 'listeners detached');
});

test('disabled probe passes through without touching the GL context or draw callback', () => {
  const renderer = {
    getContext: () => { throw new Error('Should not inspect context'); },
  };
  const probe = createRenderStallProbe({ enabled: false, renderer });
  assert.equal(probe.measure('world', 2, () => 42), 42);
  probe.frameGap(8000, 2);
  assert.equal(probe.get().events.length, 0);
  assert.equal(probe.get().stats.renders, 0);
});

test('render exceptions propagate while recording their elapsed time', () => {
  const f = fixture();
  assert.throws(
    () => f.probe.measure('world', 2, () => {
      f.advance(500);
      throw new Error('WebGL failure');
    }),
    /WebGL failure/,
  );
  assert.equal(f.probe.get().stats.slowRenders, 1);
  f.probe.dispose();
});
