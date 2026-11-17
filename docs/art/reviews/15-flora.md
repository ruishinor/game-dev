# 15 — Adaptive Nodules and resonant fungi

Reference III and V (Adaptive Nodules and BIO-014). Two seeded flora families, each with juvenile/small and mature model. Nodules have localized amber bioactive cores and enclosing organic lobes; fungi have broad violet-grey caps, narrow stems and gill geometry. Ground origin. Opaque geometry; no harvesting, simulation, loot or gameplay attached.

Simulated roundtable:
- Art: two distinct silhouettes (upright pods versus shallow flattened caps); restrained emission on small biological surfaces rather than full plants.
- Modelling: seeded stem directions, branching supports and grouped surface roots, open lobe arrangement rather than a closed opaque shell. Ground placement tested structurally.
- Runtime: material batching and capped counts; repeated flora should be instanced or use lower-detail variants, not unique geometry per plant at runtime.
- UX: forms remain distinct without colour; interaction discovery needs separately authored cues and server rules.
- Adversarial: min/max counts, deterministic same seed, differing seed output, invalid count, finite GLB, extent and triangle budgets checked. Fungal cap and organic surfaces are faceted prototypes, no transparency or foliage simulation.
- Retrospective: applied prior visual review lesson; distinguish biology with morphology and limited emission. Neutral model previews generated for each mature family, not in-game or mobile evidence.
- adaptive_nodules_small: 1964 triangles, 5 material batches, 192804 bytes.
- adaptive_nodules_mature: 3192 triangles, 5 material batches, 310696 bytes.
- resonant_fungi_small: 1716 triangles, 5 material batches, 168992 bytes.
- resonant_fungi_mature: 2964 triangles, 5 material batches, 288804 bytes.
