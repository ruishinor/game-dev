# Investigating synchronous WebGL render stalls

This probe is independent of the network-reconnection diagnostics in PR #269.
The owner-desktop 2026-11-22 capture showed several `renderer.render()` calls
lasting 2.6–8.1 seconds. Those measurements identify the synchronous call,
not the cause inside it (CPU traversal, compilation, uploads or GPU waits).

## Reproduce without changing the game's visual quality

Start the game and open `http://127.0.0.1:8080/?renderdiag=1`. The
instrumentation does not change rendering, movement, game state, graphics
quality, or network backpressure. Gameplay remains server-authoritative.

While reproducing the stalls, capture an Edge DevTools Performance recording.
Evaluate `window.__attune.state().renderDiagnostics` in the game page's
DevTools Console. The snapshot is read-only, retains at most 80 events and
contains no account tokens, character records or exact player coordinates.

Events describe:

- `slow-render`: synchronous `renderer.render(scene, camera)` duration,
  quality, stage, shader-program count before/after, draw calls/triangles,
  geometries/textures, actual backing resolution and device pixel ratio.
- `frame-gap`: gap between animation-frame callbacks, with page visibility.
  It is **not** automatically attributed to the preceding renderer call.
- `webgl-context-lost`/`webgl-context-restored`: corresponding canvas
  events. Observing these does not itself recover or reinitialize WebGL.

The WebGL `KHR_parallel_shader_compile` flag reports support only; it is
not proof that an individual shader did or did not compile asynchronously.
`performance.now()` measures elapsed synchronous call time, **not** GPU
execution time; WebGL work may complete after the call returns. Program count
growth is a correlation, not a definitive shader-compilation diagnosis.

## Comparison matrix

1. Default: `?renderdiag=1&qlock=1`.
2. Low quality: `?renderdiag=1&q=0&qlock=1` at the same viewport and camera.
3. Model/environment isolation: `?renderdiag=1&glb=none&qlock=1`.

The third mode changes more than GLB models and cannot isolate one specific
mesh. Restart between scenarios, retain the Edge Performance trace and compare
peak render-call durations and shader counts; do not rely on end-of-session FPS
alone. Never upload browser localStorage, authentication keys, character saves
or raw account/session payloads. The probe is intentionally opt-in, with no
continuous telemetry uploads.

Run `node --test test/render-stall-probe.test.js` for bounded instrumentation
unit coverage. This does **not** certify desktop GPU behaviour; reproduce on
the affected PC to identify the actual rendering mechanism before changing
materials, shader compilation, or graphics quality. Related: issue #294.

## Existing hardware profiler, now correlated with the probe

The existing `tools/profile.mjs` uses an **in-memory** guest character; no
saved account or production data is needed. At a desktop with an actual GPU,
set `ATTUNEMENT_GPU=1`, `ATTUNEMENT_HEADED=1`,
`ATTUNEMENT_SCENES=sanctum` and optionally `ATTUNEMENT_CHROMIUM` to
the local Edge executable, then run `npm run profile -- 2,0`.

The resulting `docs/evidence/profile-gpu.json` includes the separate render
probe metrics from live frames alongside the existing synced WebGL measurements
and per-scene performance data. Inspect `graphics.renderer` to confirm actual
hardware acceleration; a SwiftShader result does not validate desktop GPU
behaviour. The profiler's explicit `readPixels` test is deliberately
synchronizing/intrusive; do **not** confuse that measurement with the game's
normal live-frame `renderProbe` observations.
