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

## Revision after preview inspection
The first mature render read as tall mineral spikes on separate rounded bases. Revised three non-pipe variants with more uneven height and outward lean, broader basal lobes and flattened inter-node membrane clusters. Pipe geometry is unchanged. The second neutral preview was generated and the same structural checks repeated. The result remains an opaque faceted prototype; richer perforated membranes, translucency and material integration remain later work.
- colony_ground: 2734 triangles, 266736 bytes.
- colony_mature: 4380 triangles, 424756 bytes.
- colony_wall: 2734 triangles, 266740 bytes.

## Visual revision v3 — connected substrate
Source: R-17 attached reference. Replace disconnected stems and uniformly tapering crystals with smooth swept roots, paired arching strands outlining actual empty windows, and unequal multi-ring mineral facets. Mature and ground/wall variants use a connected mat; pipe variant retains an open cylindrical attachment. Added opt-in original striated mineral and organic PBR maps, no transparency or external donor. Art: recognizable biological/mineral hybrid, less like collectible gems. Technical: static meshes under 9,000 triangles, no simulation or interaction change. Adversarial: initial high-density recipe exceeded the triangle cap; rejected before publication and reduced secondary tessellation. Deterministic exact repeated bytes for all four outputs; min/max density mesh checks; nominal pipe radial clearance measured at every vertex of the committed pipe model. Retrospective: neutral previews inspected; actual WebGL screenshots and final artistic fidelity remain distinct gates. No artistic approval claimed.
- colony_ground: 2960 triangles, 15 embedded maps, 477016 bytes.
- colony_mature: 4824 triangles, 15 embedded maps, 655960 bytes.
- colony_wall: 2960 triangles, 15 embedded maps, 477028 bytes.
- colony_pipe: 2380 triangles, 12 embedded maps, 382844 bytes.
