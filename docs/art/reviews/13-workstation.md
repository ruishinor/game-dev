# 13 — Research and engineering workstations

Reference VI EQP-025 / EQP-026 / EQP-027. Two complete standalone stations plus separate tabletop modules. Research includes sample containers and projection surface; engineering includes workholding fixture and diagnostic unit. Optional kitbash uses existing sanctum Prop_Desk_Medium and Prop_Crate3 (manifest dimensions inspected: desk 2.844×0.94×1.029 m, crate 1 m cube). No new third-party downloads. Actual donor GLBs were not renderable in this authoring tool; composed donor integration is unverified. Full original standalones work without donors.

Simulated roundtable:
- Art: noncombat functionality clearly signalled by instruments and sample storage; industrial structural supports rather than ornamental props.
- Modelling: separate tabletop add-ons and complete fallback; ground origin and deliberate physical surfaces.
- Runtime: reuse existing cached donor geometry, optional crate, caller-owned resources; no live scan or hologram simulation.
- UX: +Z operator side, clear physical work area; UI interaction ranges not defined.
- Adversarial: extent, finite GLBs, deterministic bytes and invalid configuration checked. Added actual Three tests for desk-top alignment, crate spacing and missing donor; not executed here.
- Retrospective: fallback geometry avoids a dependency on unverified donor fit. Neutral software preview of original research workstation only.
- research_workstation: 1696 triangles, 9 material batches, 170368 bytes.
- research_tabletop_module: 1192 triangles, 9 material batches, 121996 bytes.
- engineering_workstation: 1260 triangles, 8 material batches, 127584 bytes.
- engineering_tabletop_module: 756 triangles, 7 material batches, 78428 bytes.

## Visual revision v2
Rebuilt complete stations and tabletop modules with structural pedestal frames, replaceable service cabinets, reinforced working deck, diagnostic console, physical fixture or specimen racks, connectors and cables. Embedded PBR material maps with repeated metre UVs. Art: repair/research equipment rather than furniture. Technical: retained mounting height, tabletop origin and operator orientation. Adversarial: first recipe rejected invalid bevel dimensions; corrected and validated all four GLBs against bounds and 9000-triangle cap, deterministic byte equality. Retrospective: neutral preview only, no actual texture lighting or final art approval. Donor integration pending.
- research_workstation: 3832 triangles, 12 embedded maps, 525636 bytes.
- research_tabletop_module: 2516 triangles, 12 embedded maps, 399216 bytes.
- engineering_workstation: 3672 triangles, 15 embedded maps, 547916 bytes.
- engineering_tabletop_module: 2356 triangles, 15 embedded maps, 421500 bytes.
