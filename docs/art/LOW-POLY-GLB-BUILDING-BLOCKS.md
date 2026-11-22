# Low-poly GLB building blocks — source-only acceptance policy

**Owner direction (2026-11-22):** The owner supplied and authorized this archive of 138 low-poly `.glb` files for retention in Attunement's development repository as **development starting material**, not approved finished art. The models **must be materially upscaled and developed into higher-quality Attunement assets before use**. They are **not acceptable as-is** in gameplay, environments, characters, weapons, UI, or player-visible inventories.

## Archive identification and status

- Supplied archive: `glb-low-poly-models-building-blocks.zip`
- SHA-256: `a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43`
- Inspected contents: 138 structurally valid GLB files, approximately 301 MiB uncompressed; seven pairs have identical SHA-256 hashes.
- Source-only repository location: `assets/source-archives/glb-low-poly-models-building-blocks.zip` (original intact ZIP, merged by PR #237 on 2026-11-22). This is development source, **not** a runtime manifest asset or permission to serve its derivatives. Do not mislabel unknown third-party licenses as CC0.
- Retain working donor extracts in ignored development locations; do not serve the raw ZIP or its untouched donors to game clients. The owner's development-repository authorization does not automatically approve redistribution in the public runtime.

## Mandatory promotion gate for any derived asset

1. **Record source lineage when promoting a derivative.** Identify the underlying model and available creator/provider, acquisition, and attribution; use the existing asset source ledgers. The owner's authorization covers storage of this development archive; it does not turn the models into CC0 or make them approved production assets.
2. **Raise visual quality substantially, not cosmetically.** Rework geometry, silhouettes, proportions, surface detail, textures/material definition, UVs, shading, and scene integration as needed. Improve rigs, animation, sockets, scale, and collision when relevant. Merely increasing polygon count, image resolution, or applying a post-process filter does not satisfy the requirement.
3. **Use the project's established VFX engines when appropriate.** Integrate effect families for energy, electrical discharge, resonance, glyphs, ambience, impact, or interaction in a way that supports the asset. VFX are one possible part of the upscale, **not a substitute for poor source geometry or materials**. Respect authoritative gameplay timing and existing rendering/performance conventions.
4. **Evaluate Attunement-specific art direction.** Avoid shipping generic low-poly placeholders, visibly flat primitives, poor inventory renders, or mismatched silhouettes. Follow existing approved weapon, armour, character, environment, and UI visual references rather than treating the archive as final design authority.
5. **Validate the derivative in context.** Inspect real in-game renders and animation/attachment behaviour, lighting, material response, scale, collision, LOD and performance. Include evidence for relevant desktop resolutions (1280×800, 1920×1080, 2560×1440) and TV-scale UI when applicable. Check the actual equipped weapon/model and its rendered inventory icon separately. Do not claim visual approval from a loader test alone.
6. **Promote deliberately.** Only an individually approved derivative should enter the production asset pipeline and runtime manifest. Preserve existing accepted assets, record the source lineage, and avoid automatic or wholesale import of the archive.

**Default classification: REFERENCE / DEVELOPMENT BLOCK ONLY — NOT PRODUCTION-READY.**

Run `node tools/assets/glb-source-quality.mjs > glb-source-quality.json` to inspect all 138 donors' geometry counts, normal/UV coverage, PBR texture bindings, skin/animation metadata and duplicate hashes without extracting any asset into the game. Its metrics are structural screening signals only, **not a visual-grade determination, rights clearance or production approval**. The dedicated CI workflow publishes a JSON audit artifact without including donor bytes.

The owner has authorized the archive's development-source retention. The raw ZIP is now present in the public development repository, but no particular donor is thereby approved, materially upgraded, or licensed for distribution to players.
