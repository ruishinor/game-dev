## Bounded attribution of late shader programs

Opt-in render-stall and shader-prewarm diagnostics also record a bounded
`newShaderPrograms` summary for each slow render and compile stage.
It groups new Three.js WebGLProgram objects by their reported program family
and retains up to 16 opaque FNV-1a cache-key fingerprints. Neither raw
cache keys, shader sources, player coordinates nor account/session details
are emitted. Families and signatures are diagnostic correlation, not evidence
of exactly which GPU driver step was slow.

This is intended to explain why the owner Radeon 780M still created 37/45
additional WebGL programs during 5.9s/9.0s world render stalls after
`renderer.compileAsync` completed. Browser rendering remains unchanged.

Related hardware A/B evidence: issue #294, PR #299.
