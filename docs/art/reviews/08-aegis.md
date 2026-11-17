# 08 — Aegis field generator

Executable Three.js effect renderer and pure frame samplers: base dome, directional Hinge, shared Span, Lattice and Relay. Render-only; no shield/hit detection changes. Options: radius, duration, yaw, origin, anchor, reduced motion. Caller owns timing and authoritative effects.

Simulated roundtable:
- Art: transparent low-opacity surfaces and bright perimeter geometry reveal shape without opaque magical domes.
- Technical art: sample pure frame data; sphere/hemisphere/ring/panel/beam GPU resources allocated by stable ID and reused.
- Runtime: bounded 64-item pool; explicit disposal; no gameplay callbacks; reduced-motion suppresses arcs/pulse.
- UX: distinct geometry, not colour alone; vertical Span uses a link fallback instead of undefined horizontal normal. Telegraph readability in actual encounters remains pending.
- Adversarial: invalid vectors, zero anchor distance, expiration, non-finite radius, duplicate IDs and geometry changes guarded. Sloped Span visual panel is horizontal-axis aligned and approximates uneven ground; not collision geometry.
- Retrospective: removed free-running shader time and dynamic hit assumptions, kept deterministic caller time. Actual Three lifecycle tests are committed but not yet run in the repository environment. No WebGL preview evidence.

Executed in authoring runtime: 210 sample frame validations across five variants, three anchor configurations, both motion settings and boundary times; max 10 objects per sample. Three actual resource test requires npm dependencies/hosted CI.
