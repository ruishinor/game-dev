# 07 — Glyph symbol library

19 original reusable SVG icons and one SVG sprite. 64×64 coordinate system, 3-unit stroke, rounded joins, currentColor. Includes Aegis, transformation, environment, link and counterglyph groups. Labels and semantic meaning live in metadata; decorative SVG is not sole input to game mechanics.

Simulated roundtable:
- Art: engineered diagrammatic motifs; topology reflects direction, distribution, connection and sacrifice.
- Technical art: vector geometry, no filters or external dependencies. Shared sprite and individual icons for flexible UI.
- Runtime: no runtime VFX or asset downloads required to display baked SVG; currentColor chooses semantic UI palette. Browser SVG import not tested.
- UX: distinguish by geometry, not only colour. Use labels/tooltips; small-icon legibility still needs real HUD testing.
- Adversarial: validated all coordinates and circle extents, unique IDs and shape data, lookup rejection, generated sprite membership. Counterglyph slash is an icon convention, not a gameplay disable action.
- Retrospective: chose a compact vector vocabulary instead of ornate runes; lower information density than the concept boards. Neutral sampled-line preview is not final accessibility or visual acceptance.
