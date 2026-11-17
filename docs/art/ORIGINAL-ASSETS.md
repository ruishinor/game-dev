# Original asset package — authoring prototypes

This branch adds 15 asset packages, 31 raw uncompressed GLB models, eight procedural PBR atlas tiles (three maps), 19 standalone glyph SVGs and a sprite, 13 procedural effects, an optional Mender visual rig, and an optional donor-workstation assembly. Each package has a simulated multi-perspective review under docs/art/reviews/. Neutral software previews are in docs/art/previews/. They are deliberately not the project's current live visual assets.

The production asset contract (client/assets/manifest.json, Meshopt-compressed GLB, existing provenance ledger) remains unchanged. Raw prototypes moved to client/art-assets/ so existing production tests are not weakened. This directory is served for authoring previews only; the gameplay path does not preload it.

## Rebuild / validate
- npm ci
- npm run assets:originals
- npm run assets:originals:check
- npm test

The original generator is dependency-free apart from Node's standard library. The existing Khronos validator and Sharp dev dependencies validate GLB structure and PNG/SVG decoding. The catalog includes exact per-file Git blob hashes, checked by regenerating the same binaries. No external asset downloads are necessary for this prototype batch. The existing Quaternius assets remain in the main pipeline; only the optional workstation kitbash uses them. The Mender prototype intentionally does not wrap the old donor model.

## Integration gate
Visual quality is faceted low-poly rather than concept-art fidelity. Bone placement and animated clipping, actual effects/telegraphs, materials, target devices, meshopt optimization and gameplay integration are not established by structural passes. Merge into a production release only after those tests and an art review. No game balance, server authority or progression changes made here.
