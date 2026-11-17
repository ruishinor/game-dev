# 09 — Kinetic and resonance effect library

Four executable render-only variants: charge indicator, directional impact, resonance pulses, survey cone. Bounded beam/ring/point primitives using the shared Three renderer; deterministic elapsed time, caller-owned duration and charge, reduced-motion alternatives. Survey is visual measurement, not actual sensing.

Simulated roundtable:
- Art: distinct amber transfer, violet resonance and cyan observation; sparse geometry rather than full-screen effects.
- Technical art: oriented basis with vertical-axis fallback, stable object IDs and no per-frame GPU geometry creation.
- Runtime: bounded counts and positive radii; no random particle accumulation or physics changes.
- UX: charge remains an indicator, impact is not an authoritative hit, scan has a directional cone. Reduced motion removes fragments and moving markers.
- Adversarial: vertical/oblique/forward axes, charge endpoints, expiration, invalid input and determinism tested; no actual AOE size or damage claims.
- Retrospective: rejected full particle simulation; selected small deterministic shapes that fit mobile-oriented architecture. Actual WebGL appearance still unverified.

Executed: 336 sampled frame validations; max 8 objects; repeat data equality. Actual Three lifecycle tests added, not yet executed here.