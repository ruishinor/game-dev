# Attunement — Asset production investment plan (2026-11-17)

Archival note: faithful text-only consolidation of the preceding Top 5 investment answer. Interactive demonstrations, images, charts and prose layout are not preserved verbatim. The six prior specifications are a separate source archive; do not treat this plan as their replacement.

## Ranked priorities
| Rank | Package | Qualitative score /100 | Complexity |
|---|---|---:|---|
| 1 | Modular character equipment and augmentation | 98 | Low–medium |
| 2 | Attunement, glyph and combat VFX | 96 | Low–medium |
| 3 | Modular industrial environment kit | 93 | Low–medium |
| 4 | Mechanical and symbiotic companions | 89 | Medium |
| 5 | Alien flora and mineral–biological formations | 87 | Low–medium |

These scores are qualitative, not measured. Evaluate visual impact, reuse, applicability to the playable game, production effort, AI feasibility and integration cost. Retain the existing humanoid rigs and animations. Reuse conventional architecture, vegetation, rocks, props and materials. Deprioritize complete exoskeletons, custom humanoid anatomy, entire cities, interactive vehicles, giant animated creatures and real-time biological simulation.

## Packages
1. Modular character equipment: expedition backpack, dorsal carrier, kinetic capacitor, glyph gauntlet, shoulder armour, culture reservoir, cranial interface, pouches, visor, armour/fabric materials, insignia, tattoos, cartridges. Generate editable modular geometry, use rigid bone attachments, share material palettes and test both body shapes.
2. Glyph and combat effects: Aegis, Hinge, Span, Lattice, glyph symbols, kinetic charge, resonance, restoration, companion links, environmental scanning and counterglyph variants. Parameterize geometry, duration and opacity; preserve authoritative gameplay timing and hit detection.
3. Industrial kit: reuse existing Quaternius walls, floors, columns, stairs, walkways, crates and pipes. Create resonance towers, containment vessels, workstations, generators, cables, canopies and signage; emphasize composition, materials and lighting. Reuse for Karsten, Meridian, Orion and Nexus; faction identity is provisional.
4. Companions: hovering core (Mender, survey drone, relay), articulated quadruped (recon, defence, cargo, research), organic core (symbiont, cultivated organism). Start with existing Mender; reserve complex anatomy for later.
5. Alien flora: seeded crystallogenic clusters, mineral–biological membranes, Adaptive Nodules, resonant fungi, tendrils and ground colonies; reuse trees and terrain. First candidate: Sporefield.

## Fifteen deliverables (ordered)
| ID | Asset | Method |
|---|---|---|
| 01 | Modular expedition backpack generator | Procedural 3D |
| 02 | Kinetic capacitor harness | Procedural 3D |
| 03 | Glyph projection gauntlet | Procedural 3D |
| 04 | Cranial neural interface | Procedural 3D |
| 05 | Biological culture reservoir | Procedural 3D |
| 06 | Industrial material atlas | Free PBR and procedural |
| 07 | Glyph symbol library | SVG |
| 08 | Aegis field generator | Three.js |
| 09 | Kinetic and resonance effect library | Three.js |
| 10 | Restorative and symbiotic effect library | Three.js |
| 11 | Redesigned Mender Symbiote | Hybrid GLB and procedural |
| 12 | Industrial resonance tower | Procedural 3D |
| 13 | Research and engineering workstation | Kitbashing |
| 14 | Crystallogenic colony generator | Procedural 3D |
| 15 | Adaptive Nodules and resonant fungi | Procedural 3D |

Proposed allocation: character equipment 30%, VFX 25%, industrial environment 20%, companions 15%, flora 10%. This is an effort heuristic, not a financial budget.

## Toolchain and reuse
Use existing Node/Three.js tooling first, Blender/Python for complex offline geometry, glTF Transform and meshoptimizer for delivery, SVG/Canvas for icons and screen textures, Material Maker or free PBR for materials, Krita/GIMP/Inkscape for editing. Quaternius animation packs, Sci-Fi MegaKit, Essentials and Nature MegaKit are already recorded in assets/sources.json. Poly Haven already supplies terrain. Additional sources: https://ambientcg.com/ and https://kenney.nl/assets ; https://opengameart.org/ for gaps. Mixamo optional; image-to-3D tools (Meshy, Tripo, TRELLIS) optional prototypes only, not dependencies. Prefer CC0; record sources and integrity using existing ledger. No wholesale pipeline replacement.

Pipeline: reference library -> procedural recipe or imported model -> material assignment -> GLB export -> optimization and validation -> preview/contact sheet -> in-game validation and profiling. Use existing assets:fetch, assets:build, assets:preview, capture and profile scripts. Build deterministic configurable asset families, not one-off models. Reuse conventional assets, create distinctive assets, automate repeatable work.

## Review, acceptance and scope (added for execution)
- Work from current feature head, isolated branch; do not rewrite existing gameplay.
- Sequential checkpoints: art direction, modelling/rigging, runtime/performance, gameplay/UX, adversarial failure modes, retrospective; record evidence and limitations per deliverable. These are simulated review perspectives, not independent human reviews.
- Verify actual geometry/format, attachment transforms, deterministic output, finite values, bounds, material/texture behaviour and disposal as relevant. Visual approval requires render evidence and in-game validation; software-rendered/headless results are not mobile performance evidence.
- Avoid calling source-only work finished, claiming unrun tests passed, or implying a push when the repository head has not advanced.
- Design: mature science-fantasy, industrial brutalism, visible engineering, weathered grounded materials, human adaptation, restrained extraordinary effects; no generic ornate fantasy or ubiquitous neon.
