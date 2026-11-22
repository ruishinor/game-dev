# Low-poly GLB building blocks — production-pipeline integration policy

**Owner clarification (2026-11-22):** All 138 source `.glb` files are eligible, immediately, as inputs to the **production asset pipeline**. Do not quarantine them away from the pipeline, require case-by-case owner permission to start development, or block asset construction based solely on an unreviewed/low-poly label. Improve geometry, materials, fit and effects as needed within the ordinary implementation cycle. **Pipeline ingestion is not the same as automatic gameplay publication.**

## Archive identification and status

- Supplied archive: `glb-low-poly-models-building-blocks.zip`
- SHA-256: `a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43`
- Inspected contents: 138 structurally valid GLB files, approximately 301 MiB uncompressed; seven pairs have identical SHA-256 hashes.
- Source-only repository location: `assets/source-archives/glb-low-poly-models-building-blocks.zip` (original intact ZIP, merged by PR #237 on 2026-11-22). This is development source, the registered input of `tools/asset-pipeline/assets/glb_archive/asset.json`; staged donors are available to the pipeline without automatically being served to browsers. Do not mislabel unknown third-party licenses as CC0.
- Run `cd tools/asset-pipeline && python -m asset_pipeline all --asset glb_archive` to index and ingest all 138 donors in `.asset-cache/pipeline/glb_archive/imports/`; use the resulting `imports.json` for source selection and further Blender/glTF work. Do not keep these donors out of the pipeline. The ZIP itself does not need a browser HTTP mount.

## Normal engineering and release checks — no separate development permission gate

1. **Capture available source lineage automatically.** Record the underlying donor, source hash and any available creator/provider, acquisition, license and attribution in the output ledger. Missing provenance is a legal uncertainty to resolve for redistribution, not a prohibition on ingestion, evaluation, repair or production-pipeline work. Do not invent CC0 rights.
2. **Iterate on actual visual quality.** Use source GLBs directly as development building blocks, then adapt geometry, silhouettes, proportions, surface detail, textures/material definition, UVs, shading and scene integration as warranted. Improve rigs, animation, sockets, scale and collision as needed. Do not claim a source is high-fidelity simply because polygon count increased.
3. **Use the project's established VFX engines when appropriate.** Integrate effect families for energy, electrical discharge, resonance, glyphs, ambience, impact, or interaction in a way that supports the asset. VFX are one possible part of the upscale, **not a substitute for poor source geometry or materials**. Respect authoritative gameplay timing and existing rendering/performance conventions.
4. **Evaluate in the game, not at the entry gate.** Build and preview actual compositions. Improve generic low-poly placeholders, flat primitives, poor inventory renders and mismatched silhouettes through iteration. Preserve the game's existing accepted weapon, armour, environment and UI references.
5. **Run targeted technical and visual validation as part of implementation.** Check actual in-game renders, animation/attachments, lighting, material response, scale, collision, LOD and GPU cost at supported desktop resolutions. Verify equipped models and inventory icons separately where applicable. A successful GLB load is not evidence of visual quality; review the result and correct defects instead of postponing pipeline development.
6. **Integrate efficiently.** All 138 donors belong in the production asset pipeline now. Promote constructed outputs into the runtime manifest when they are technically usable, non-regressive and permitted for redistribution; keep batch jobs and PRs independently mergeable. Do not introduce arbitrary signoff steps. Preserve accepted assets and authoritative gameplay.

**Default classification: PRODUCTION-PIPELINE INPUT — NOT AUTOMATICALLY A FINAL GAME ASSET.**

Run `node tools/assets/glb-source-quality.mjs > glb-source-quality.json` to inspect all 138 donors' geometry counts, normal/UV coverage, PBR texture bindings, skin/animation metadata and duplicate hashes without extracting any asset into the game. Its metrics are structural screening signals to prioritize reconstruction, **not a reason to exclude donors from the production asset pipeline**. The dedicated CI workflow publishes a JSON audit artifact; the native pipeline ingests donor bytes into its working asset cache for downstream transformation.

The owner has authorized both archive retention and use of every donor as a pipeline input. The original ZIP is present in the public development repository. Actual runtime distribution must still comply with applicable third-party rights and technical checks.
