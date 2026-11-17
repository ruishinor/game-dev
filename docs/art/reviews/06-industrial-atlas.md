# 06 — Industrial material atlas

Original eight-tile procedural PBR set: ceramic, ochre paint, graphite steel, bare alloy, technical fabric, rubber, concrete, polymer. 512×256 RGB maps: base colour, tangent-space normal and packed occlusion/roughness/metallic. Six-pixel wrapped gutters and pixel-centred UV transforms; use bounded atlas sampling and manage mip levels to avoid cross-tile bleed. The generated normal map is a shallow stylized relief, not scanned material.

Simulated roundtable:
- Art: warm dusty neutral palette, localized wear and distinguishable material families; no high-frequency grunge overload.
- Technical art: metallic values distinguish coating from metal; packed ORM and linear/sRGB metadata; tile gutters. Base colour does not bake directional lighting.
- Runtime: shared maps and compact dimensions. PNGs are uncompressed internally; compression, mip behaviour and visual material fit are pending real runtime profiling.
- UX: avoid relying on material colour for gameplay states; atlas is decorative.
- Adversarial: no copied third-party textures added; existing free sources remain available through established pipeline. Determinism, pixel dimensions, variation, wrapped gutters and invalid input tested.
- Retrospective: chose generated material atlas instead of inaccessible external downloads. Poly Haven/Quaternius source assets already in project are not included in these generated files; this deliverable does not claim imported PBR scans or in-game integration.

## Visual revision v2
Reduced uniform wear and made surface structure material-specific: woven fabric, molded polymer, rubber ribs, directional alloy brushing, sparse scratches, ceramic/paint chips and concrete pores. Preserved dimensions, eight tile IDs, gutter layout and packed map semantics. Art: distinguish surfaces without excessive grunge. Technical: preserve atlas UVs and colour-space contract. Runtime: no growth in texture dimensions. UX: decorative board remains nonsemantic. Adversarial: repeat bytes and gutter matches verified. Retrospective: still procedural 128-pixel tiles, not scanned or baked hero textures; actual PBR sphere/scene comparison remains needed. No live atlas binding added.
