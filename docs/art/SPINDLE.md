# Spindle — production and integration record

## Scope and provenance

Spindle is an original rigid rolling precision machine, commissioned by the player through the Companion Sheet at Lattice Sanctum. The owner accepted the supplied model, material direction and demonstrated gameplay on 2026-11-19. Recovery preserved the authored near model without further creative iteration. The owner-supplied concept/reference boards and local review images are deliberately excluded from the public development repository.

The procedural production sources are `tools/assets/spindle.mjs`, `tools/assets/lib/spindle-geometry.mjs`, `tools/assets/lib/spindle-surfaces.mjs` and `tools/assets/lib/spindle-lod.mjs`. They generate original geometry and materials; no external art pack is required for this asset. Rebuild with `npm run assets:build -- spindle`. The shipped runtime GLB and manifest are versioned. The build fails if the distance scene is absent or not simpler than the default scene.

## Runtime asset

| Property | Full detail | Distance detail |
| --- | ---: | ---: |
| Triangles | 33,796 | 9,494 |
| Rigid mesh nodes | 7 | 7 |
| Materials | 1 shared | 1 shared |
| Texture atlas | two 640 × 640 WebP images | shared with full detail |

The GLB is 715,160 bytes (previous single-scene GLB: 590,324 bytes). SHA-256: `627f2a0396e9de2fc1d4b1d2bfd6ee6ae2f3053610ca2356534a7af1ce23c383`. The asset includes `EXT_meshopt_compression`, `EXT_texture_webp` and `KHR_mesh_quantization`. Full-detail node transforms, decoded indices and attributes, texture bytes and bounds were compared against the archived single-scene GLB and are identical. The distance scene simplifies only the roll and housing assemblies, retaining the same articulation hierarchy and sharing the remaining five meshes and material. Triangle submission for one visible model is reduced by 71.9% before shadow/pass overhead; frame-rate and GPU-memory impact have not been measured for the final asset.

`Assets.loadBundle` caches the default scene and optional `Distance` scene once. `createModel` clones the two rigid hierarchies per Spindle; their immutable GPU resources stay shared. `createSpindle` maintains the same signed wheel phase and shoulder/elbow/wrist/jaw pose across both. The near scene is selected until camera distance reaches 22 m; it returns at 18 m. These thresholds are initial presentation defaults, not optimized hardware measurements. Only one scene is visible at a time. A missing/incomplete optional distance scene retains full detail; an unavailable primary GLB retains the procedural fallback. Portraits remain near-detail. Ordinary GLB viewers see the default scene without game-specific LOD logic.

## Gameplay and trust boundary

Commissioning is a server-authorized opt-in in Sanctum while alive and out of combat. The authenticated owner can summon, dismiss, rename, follow, stay and request inspection; eligibility, placement and persisted companion state are server-side. Switching companions requires successful clearance/eligibility before the previous unit is removed. Inspection is a one-shot diagnostic of the owner's equipped weapon; uninterrupted proximity is required, combat or invalid position interrupts it, and the report is sent only to the owner. No repair, condition change, reward or resource mutation is performed by inspection. Public encounter presentation includes current companion metadata, movement/mode and action. It does not require disclosure of the owner's private loadout or inspection result. LOD, signed rotation and articulated poses are presentation only and do not alter server movement, inspection range, ownership or collision. The public development repository itself is not a confidentiality boundary.

## Recovery validation (2026-11-19)

- Reconciled the archive against remote `main` commit `326bd9b1b4335e083861c46feabdb72d42b99ef3` (tree `1a577d3c606df56cf1ac8702966a2519f1427de8`); reconstructing the base tree with its original changed-blob hashes produced that exact tree SHA. Unrelated tracked files are preserved.
- `npm run assets:build -- spindle`: successful. Manifest size, SHA prefix and triangle counts are regression-tested. Meshopt decoding and validation of the decoded GLB returned 0 errors and 0 warnings; two informational non-power-of-two texture notices remain.
- `npm test`: 333 passed, 0 failed, 0 skipped (Node v22.16.0). Focused Spindle/Survey Strider suite: 13 passed, 0 failed. Tests cover articulation sweep, signed travel, LOD hysteresis and phase continuity, actual GLB mesh/material sharing, ownership, persistent switching/naming, private read-only diagnostics, ground movement, Survey Strider behavior and multiplayer WebSocket replication. Syntax checks passed for modified client and browser-test files.
- Prior Codex transcript reports a successful two-player Chromium gameplay flow; that is historical evidence, not a rerun against this commit. Both final browser suites were attempted but the execution environment's Chromium refused access to localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`) before gameplay. The final Spindle browser test now additionally checks that the real camera switches visible geometry to 9,494 triangles and restores 33,796, then exercises the existing two-player flow. CI browser validation is still required, including Survey Strider; no browser or rendering PASS is claimed here.
- Original studio and gameplay review captures remain local. Representative captures and new machine-readable recovery logs are preserved separately from the public Git commit. Screenshots from Codex precede the final LOD build; no new screenshot or GPU profiling sample is claimed.

The recovered commit is a delivery candidate, not a merged release. Push the exact commit to an isolated branch, reconcile any subsequent upstream changes, and require successful GitHub Actions (Node and ground-companion browser suites) and no material unresolved concerns before merging. Hardware profiling and direct visual LOD inspection remain follow-up validation items; rollback is possible by removing the optional distance scene/runtime selection without touching gameplay authority.
