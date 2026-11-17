# 12 — Industrial resonance tower

Reference V, EQP-016 / Karsten A-07: 2.71 m static cylindrical installation, three radial ground-contact supports, protective core cage, amber operation indication, portable power unit and short cable. Three states (deployed, folded, disabled); folded is a compact static geometry variation, not an animation or physics-valid collapsed apparatus.

Simulated roundtable:
- Art: recognizable industrial survey/stabilization equipment, amber core surrounded by matte ochre and structural steel.
- Modelling: three legs rather than unsupported silhouette, steel lower pistons, broad foot pads, explicit mast and open core. Origin grounded; no buried support in the test.
- Runtime: material batching, no transparency; folded/deployed swaps are future interaction art, not live simulation.
- UX: inactive power cue uses subdued material and should also gain status text if interactive; actual operation is intentionally unspecified.
- Adversarial: ground clearance, height cap, deterministic GLB, finite geometry, folded footprint and invalid state tested. Folded state still visually stylized; no stability, collision or deployment clearance simulation.
- Retrospective: applied backpack lesson; no opaque cylinder concealing the illuminated core. Neutral preview generated; no real in-game verification.
- resonance_tower_deployed: 1668 triangles, 7 material batches, 166004 bytes.
- resonance_tower_folded: 1444 triangles, 5 material batches, 142960 bytes.
- resonance_tower_disabled: 1668 triangles, 7 material batches, 165928 bytes.

## Visual revision v2
Added pinned support joints, secondary braces, layered grounded shoes, protected emitter terminals, insulators, vents, field-service handles, heatsink and connectors. Embedded industrial PBR maps. Disabled/folded core and screens no longer emit. Concept/technical direction accepted by owner; visual quality outstanding. Simulated review: art—recognizable machine; modeling—real support and hinge cues, static pose only; rendering—bounded geometry and material maps; design—inactive state clearly distinguished; adversarial—ground datum, height, inactive materials, byte repeatability and triangle budget checked; retrospective—coordinate stabilization used to reduce cross-runtime floating-point drift. Hosted render and cross-runtime regeneration pending. No gameplay changes.
- resonance_tower_deployed: 4228 triangles, 18 maps, 638920 bytes.
- resonance_tower_folded: 3656 triangles, 18 maps, 582308 bytes.
- resonance_tower_disabled: 4228 triangles, 18 maps, 637224 bytes.
