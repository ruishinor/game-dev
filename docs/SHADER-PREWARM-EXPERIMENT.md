# Controlled Radeon 780M shader-precompile experiment

Owner baseline: 2026-11-23, AMD Radeon 780M / ANGLE D3D11, 1280x800.
The severe measured synchronous render stalls correlate with large batches of
new shader programs: q0 title 4147.5 ms / +29 programs; q0 world 10419.1 ms
/ +41; q2 title 15504.1 ms / +38; q2 world 8439 ms / +43.
This is strong correlation, not exclusive proof of a shader compiler stall:
texture uploads, draw-list construction and driver synchronization can coexist.

Experimental mode ONLY: ?shaderwarmup=1 (default OFF). Calls Three.js
renderer.compileAsync(scene,camera) with the actual initialized title scene and
again on the first populated-world camera view, before corresponding visible
renders. Reports wall duration, added programs and completion/timeout state.
A 20-second soft timer releases the loading presentation; native GPU work
cannot be forcibly cancelled. Reconnect resets the generation guard.
Graphics quality, server state, gameplay balance and transport remain unchanged.

Compare using the existing bounded hardware profiler:
- ATTUNEMENT_GPU=1, ATTUNEMENT_HEADED=1, ATTUNEMENT_SCENES=sanctum,
  ATTUNEMENT_PROFILE_FRAMES=45, ATTUNEMENT_PROFILE_WARMUP=1
- npm run profile -- 0,2
- Check docs/evidence/profile-gpu.json results[].shaderWarmup (stage duration)
  alongside results[].renderProbe.events and .stats (actual render-call spikes).
- The existing baseline ZIP Attunement-GPU-Bounded-20261123-003433.zip used
  warmup OFF on the same machine.

Do not declare success just because the first-render stall moves into loading.
Accept only improved visible world-entry responsiveness and frame-time tails
with tolerable preparation time. This mode is not production-default until
confirmed by actual GPU A/B evidence. Related issue #294 and PR #295.
