# 07 — Glyph symbol library

19 original reusable SVG icons and one SVG sprite. 64×64 coordinate system, 3-unit stroke, rounded joins, currentColor. Includes Aegis, transformation, environment, link and counterglyph groups. Labels and semantic meaning live in metadata; decorative SVG is not sole input to game mechanics.

Simulated roundtable:
- Art: engineered diagrammatic motifs; topology reflects direction, distribution, connection and sacrifice.
- Technical art: vector geometry, no filters or external dependencies. Shared sprite and individual icons for flexible UI.
- Runtime: no runtime VFX or asset downloads required to display baked SVG; currentColor chooses semantic UI palette. Browser SVG import not tested.
- UX: distinguish by geometry, not only colour. Use labels/tooltips; small-icon legibility still needs real HUD testing.
- Adversarial: validated all coordinates and circle extents, unique IDs and shape data, lookup rejection, generated sprite membership. Counterglyph slash is an icon convention, not a gameplay disable action.
- Retrospective: chose a compact vector vocabulary instead of ornate runes; lower information density than the concept boards. Neutral sampled-line preview is not final accessibility or visual acceptance.

## Visual revision v2
Retained all 19 identifiers, labels and geometry-led visual language. Increased stroke weight modestly and used bevel joins; revised Aegis, Span, Persist, Phase, Bond and Unstrike motifs to clarify structure and differentiation. Art: industrial diagram rather than ornamental rune. UX: avoid colour-only information and unnecessary micro-detail. Runtime: same vector/sprite contract. Adversarial: checked shape bounds, unchanged IDs and previous Git blob hashes before calculating updated ones. Retrospective: no claim of HUD-scale readability without real raster/browser comparison. Original neutral preview remains a historical baseline, not current artwork.
