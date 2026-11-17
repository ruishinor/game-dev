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
## Visual revision v2
Charge gains a nested core and six fixed transfer ticks, impact a compression front and fading wake, resonance a datum and sampled points, survey a defined aperture, additional target plane marks and inner perimeter. Art: distinguish measurement, charge and impulse through spatial structure. Technical: reuses stable bounded resources, no shader or simulation dependencies. UX: retains reduced-motion static indicators and direction; no gameplay timing changes. Adversarial: 336 boundary/direction/charge/motion frame checks, max 14 objects, deterministic output; Three lifecycle and actual appearance checked separately by hosted tests. Retrospective: still an abstract engineered effect vocabulary, not cinematic particles, and no gameplay readability acceptance.
