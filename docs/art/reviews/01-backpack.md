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

## Visual revision v2
Owner accepted the concept/technical direction, not visual fidelity. Rebuilt all four variants with separate service panels, exposed reservoir fittings, vent banks, rear hardware, and padded wearer-contact surfaces. Embedded original repeatable base colour, normal and packed ORM maps for non-emissive materials using metre UVs. No external scans or Blender hand unwrap. Rig-dependent shoulder straps intentionally remain separate. Art review: avoid covering both sides with generic armor; technical art: cap geometry, use real maps; adversarial: tested 0/4 reservoirs, deterministic output and structural GLB; retrospective: default preview previously faced the blank wearer side. Both angles inspected in neutral untextured software preview; actual PBR appearance and body fit pending browser/rig evidence. Not artistic approval.
- backpack_research: 3372 triangles, 18 embedded maps, 556808 bytes.
- backpack_kinetic: 3596 triangles, 21 embedded maps, 616824 bytes.
- backpack_biotech: 3312 triangles, 18 embedded maps, 551832 bytes.
- backpack_utility: 3292 triangles, 18 embedded maps, 548272 bytes.

Retrospective correction: narrowed lumbar pad to remove overlap with lower contact pads; regenerated all four variants and repeated structural checks.
