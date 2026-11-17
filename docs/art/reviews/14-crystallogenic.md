# 14 — Crystallogenic colony generator

Reference VI BIO-015 / R-17. Seeded mineral–biological colony: ground, mature, wall-attached and pipe-wrap surfaces. Mineral facets, irregular opaque organic nodules, branching conductive substrate. Ground +Y, wall +Z, pipe along Z; pipe geometry is not included. Material opacity is deliberate prototype simplification, not the transparent mineral treatment in the source images.

Simulated roundtable:
- Art: combined mineral needles with muted biological substrate; sparse violet detail, not an ubiquitous glowing-crystal biome.
- Modelling: orientations and attachment plane explicit; overlapping lobes and branching rods for stable procedural composition. No biological growth simulation.
- Runtime: static batched meshes, seed/density bounds, repeatable variants and no alpha overdraw; repeated placements still need instancing and measured GPU budget.
- UX: discoverable colony silhouette distinct from ordinary rocks, no implied resource harvesting or damage.
- Adversarial: tested minimum/maximum density, different seeds, identical seed bytes, finite GLB, triangle cap, positive extents and surface bounds. Pipe interior/fit should be checked on actual pipes; no complex mesh collision.
- Retrospective: prioritized organic-mineral attachment geometry over speculative volumetric translucency. Neutral software preview generated; not actual R-17 environment or final art.
- colony_ground: 2158 triangles, 5 material batches, 211440 bytes.
- colony_mature: 3444 triangles, 5 material batches, 334896 bytes.
- colony_wall: 2158 triangles, 5 material batches, 211444 bytes.
- colony_pipe: 1408 triangles, 4 material batches, 138576 bytes.
