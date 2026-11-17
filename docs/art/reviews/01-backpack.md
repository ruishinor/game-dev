# 01 — Modular expedition backpack generator

References IV–VI; EQP-005 / EQP-028. Static equipment, +Z toward wearer. Four configurations, 0–4 reservoirs. Existing straps remain separate for body-conforming fit. No gameplay changes.

Simulated roundtable (not independent reviewers):
- Art: chamfered ceramic face, dark chassis, ochre rails and sparse indicators; variant modules rather than recolour alone.
- Modelling: capped topology; separate straps to avoid baked fit/clipping.
- Runtime: material batches, no alpha or rig, bounded reservoir count.
- UX: rear details support third-person reading; no class restrictions implied.
- Adversarial: duplicate byte equality, reservoir limits, invalid input, finite GLB accessors and triangle cap tested. No animation-fit evidence.
- Retrospective: first neutral preview revealed fully occluded illuminated reservoirs. Replaced solid casing by exposed core with protective axial ribs and metal end collars; added screen detail. Second neutral preview generated; not WebGL or final art acceptance.

Executed structural checks:
- backpack_research: 1216 triangles, 8 materials, 123404 bytes.
- backpack_kinetic: 1284 triangles, 9 materials, 130720 bytes.
- backpack_biotech: 1104 triangles, 9 materials, 113432 bytes.
- backpack_utility: 1072 triangles, 7 materials, 108728 bytes.
