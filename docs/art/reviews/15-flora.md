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

## Visual revision v2
Rebuilt nodules with gently tapered curved stems, individually curved closed petals around restrained warm cores and surface runners. Fungi use closed asymmetric wavy caps with raised underside gills, natural stem curvature and restrained emission. Both species have material-specific PBR maps; no transparent foliage or biological simulation. Simulated perspectives: art emphasizes different silhouettes rather than colour alone; modeling uses closed meshes and signed-volume winding; technical retains seeded IDs, ground origin and existing cap; adversarial checks both count extremes, actual committed geometry bounds and repeated output bytes; retrospective compares neutral previews before WebGL review. No artistic approval implied.
- adaptive_nodules_small: 2556 triangles, 12 embedded maps, 400596 bytes.
- adaptive_nodules_mature: 4120 triangles, 12 embedded maps, 550752 bytes.
- resonant_fungi_small: 3296 triangles, 15 embedded maps, 510128 bytes.
- resonant_fungi_mature: 5636 triangles, 15 embedded maps, 734772 bytes.

Retrospective correction: software preview exposed inverted cap ring faces. Aligned top/bottom ring winding with central faces and increased rim thickness. Added a regression check for paired directed edges and positive enclosed volume across every custom Mender, colony and flora mesh. Corrected cap preview inspected; no claim of final fidelity.
