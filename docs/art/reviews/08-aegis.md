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

## Visual revision v2
Replaced flat Aegis body surfaces (base, Hinge, Span, Lattice) with an additive depth-tested field shader, hex-like structural cells, restrained edge and Fresnel response, and a caller-time pulse disabled in reduced motion. Span has explicit source and destination posts/nodes and an optional traveling signal. Relay unchanged. No collision or authoritative effects changed. Review: show boundary topology, avoid opaque panels; shader resource ownership stays within existing effect pool; reduced motion disables traveling accents; preview uses stronger fill and equipment-facing default. Adversarial sample checks: 210 frames, max 10 objects; shader compilation and GLB PBR rendering still require hosted run. Sloped Span panel remains approximate. No final art approval.

## Visual revision v3
Span now has a shallow bowed field, an upward crown, and a continuous segmented perimeter derived from the same surface function, including sloped anchors. Vertical fallback retained. Shader wave avoids undefined negative-base GLSL pow. Reduced motion omits the traveling signal. Added exact geometry/edge alignment tests and a bounded sampler sweep (840 frames, maximum 40 objects). Browser verification pending at commit. No changes to combat semantics.
