# Low-poly GLB building blocks — source-only holding policy

**Owner direction (2026-11-22):** An owner-supplied archive of 138 low-poly `.glb` files is intended as **development starting material**, not approved finished art. The models **must be materially upscaled and developed into higher-quality Attunement assets before use**. They are **not acceptable as-is** in gameplay, environments, characters, weapons, UI, or player-visible inventories.

## Archive identification and status

- Supplied archive: `glb-low-poly-models-building-blocks.zip`
- SHA-256: `a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43`
- Inspected contents: 138 structurally valid GLB files, approximately 301 MiB uncompressed; seven pairs have identical SHA-256 hashes.
- **Git status: the raw archive and its GLB contents are NOT checked into this repository.** They are pending a documented rights/provenance review and a suitable distribution decision. This repository is public. The GLB metadata does not include license declarations; generator strings are not evidence of redistribution rights.
- Hold any local copy under the existing ignored `reference-library/` or `assets/source/` paths. Never force-add source material to public Git without the applicable source-owner, license, attribution, and publication checks. A private holding location is not a runtime asset directory.

## Mandatory promotion gate for any derived asset

1. **Review provenance and rights.** Record the specific source model, creator/provider, acquisition, applicable license or owner authorization, attribution, and restrictions before publishing any original or derivative. Use `assets/sources.json` for eligible third-party build sources, or the existing `assets/owner-sources.json` ledger for expressly owner-authorized, non-CC0 material. Do not invent a CC0 license.
2. **Raise visual quality substantially, not cosmetically.** Rework geometry, silhouettes, proportions, surface detail, textures/material definition, UVs, shading, and scene integration as needed. Improve rigs, animation, sockets, scale, and collision when relevant. Merely increasing polygon count, image resolution, or applying a post-process filter does not satisfy the requirement.
3. **Use the project's established VFX engines when appropriate.** Integrate effect families for energy, electrical discharge, resonance, glyphs, ambience, impact, or interaction in a way that supports the asset. VFX are one possible part of the upscale, **not a substitute for poor source geometry or materials**. Respect authoritative gameplay timing and existing rendering/performance conventions.
4. **Evaluate Attunement-specific art direction.** Avoid shipping generic low-poly placeholders, visibly flat primitives, poor inventory renders, or mismatched silhouettes. Follow existing approved weapon, armour, character, environment, and UI visual references rather than treating the archive as final design authority.
5. **Validate the derivative in context.** Inspect real in-game renders and animation/attachment behaviour, lighting, material response, scale, collision, LOD and performance. Include evidence for relevant desktop resolutions (1280×800, 1920×1080, 2560×1440) and TV-scale UI when applicable. Check the actual equipped weapon/model and its rendered inventory icon separately. Do not claim visual approval from a loader test alone.
6. **Promote deliberately.** Only an individually approved derivative should enter the production asset pipeline and runtime manifest. Preserve existing accepted assets, record the source lineage, and avoid automatic or wholesale import of the archive.

**Default classification: REFERENCE / DEVELOPMENT BLOCK ONLY — NOT PRODUCTION-READY.**

This policy is a record of the intended use; it is **not** a representation that the archive has been published, imported, licensed, or graphically upgraded.
