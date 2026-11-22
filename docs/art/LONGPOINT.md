# Longpoint V2 — heavy precision emitter

## Scope

Original nonfunctional exterior game art for the existing QL5 `longpoint_emitter` item. V2 retains the accepted silhouette direction while refining material layering, contour transitions, weathering and the fictional cyan instrument module. All coordinates are art-space values, not manufacturing dimensions; the prop has no working internals. Recoil is explicitly out of scope by owner decision. No combat balance, weapon condition, hit, acquisition, or progression rules are modified.

## Reproducible asset

`npm run assets:build -- longpoint` registers the GLB through the existing asset build. The dedicated source, `tools/assets/longpoint.mjs`, generates deterministic geometry, original 512 × 512 base-colour, metalness/roughness and normal maps, vertex colours and tangents. It validates the decoded GLB before writing the compressed version. The shipped GLB has 18,468 triangles, 46 primitives, 12 PBR materials and 3 textures; 1,995,696 bytes with Meshopt compression. SHA-256 `d79c6d91ae44e294f3e90280c270144cfb7d96d62cc2e48bc65b47440a22b600`. Separate support-leg pivots retain the reversible inspection pose. The default held representation uses the folded pose.

## Presentation integration

The existing item remains mechanically unchanged. `publicWeaponVisual` exposes only the fixed `longpoint` cosmetic token for an owned/equipped Longpoint on classes whose normal auto-attack is a ranged bolt. Metadata is invalidated only when the public token changes. Melee classes preserve existing presentation. The client clones the shared rigid asset and fits its two decorative wrist anchors against the existing masculine/feminine humanoid skeletons; only arm rotations are overridden, with the underlying animation rotations saved and restored. It suppresses the prop during named ability actions, air/death states and unreachable fits rather than forcing a broken pose. Ranged auto-attack presentation is steady, with no recoil; ordinary class ability animations remain unchanged. Asset absence or invalid rig/anchor state retains existing class presentation. No new network command or private inventory/condition fields are introduced.

The existing rich combat VFX and legacy bolt fallback obtain their origin from the visible prop's `EffectAnchor` for ordinary ranged auto-attacks only. Named abilities continue to use the prior chest origin. No parallel VFX engine or damage behavior is added. The inspection route `/client/preview.html?items=longpoint:transport,longpoint:deployed,longpoint-look:brine_surveyor&cols=3&cell=640` supports asset and held-presentation review.

## Validation record — 19 November 2026

- Standalone and normal asset pipeline builds succeeded and produced identical SHA-256. Decoded glTF validation: 0 errors, 0 warnings. Informational notices relate to unused UV/tangent attributes on untextured materials and empty named anchors.
- Full Node suite: 338 tests passed, zero failures/skips. Focused suite: 15 passed, including existing condition/progression tests, decoding, pose reversal, bind rig fitting/restoration, 128 sampled locomotion frames on the two shipped body hierarchies, public metadata, actual WebSocket replication/equip removal, and existing rich VFX origin selection. Modified JS syntax checks passed.
- Browser attempt: `ERR_BLOCKED_BY_ADMINISTRATOR` before local navigation completed. No real engine render, screen-space clipping, realistic hand/finger appearance, browser equip/unequip or GPU performance PASS is claimed. A dedicated two-client Playwright test and pinned GitHub Actions workflow are included for this gate. The screenshot sheet is an orthographic software raster of the actual exported mesh, not an in-game or PBR renderer capture.
- The regression suite used the available recovered Spindle snapshot, not a complete clone of the latest remote main. Every targeted source insertion in the integration script was checked against remote main `f0a6527da27a68afae79b7cac1a665a5123703d0`; the integration installer refuses missing or ambiguous anchors and existing additions, and preserves unrelated source and manifest entries. The exact latest branch still requires its own CI and independent visual acceptance before merge.

## Review boundaries

Visual quality is materially improved relative to V1 but the requested World of Warcraft minimum / Ashes of Creation aspiration cannot be certified without the actual game review. Finger pose, outfit clipping, pose transitions, and the effect's alignment in gameplay remain review items. LOD and GPU/draw-call budget are unmeasured; avoid asserting scalability from triangle count alone. No remote publication or merge occurred in the recovery environment. This is an integration candidate, not a released feature.

## Upstream reconciliation

The published candidate is reconciled with `e4454cf71f4576cd9447e621b7e4766a02c8dd24`. Fabrication presentation takes exclusive precedence over the held weapon; both cosmetic arm overlays restore their saved rotations before the base animation is sampled. Appearance changes still rebuild the current player model using the latest metadata, including visual identity. Unrelated upstream changes and the exact candidate GLB are retained. This merge candidate requires the hosted checks; earlier local results are not a substitute.

## Owner black finish (2026-11-22)
All runtime instances of the original rifle use the same blackened finish, including model inspection, held and stowed presentation. Named opaque materials receive a black/charcoal PBR colour and restrained reflectance variation; optical and emissive surfaces retain their original colour. The original geometry, textures, embedded donor material data, anchors and baked GLB hash remain unchanged. This is an intentional runtime material variant, not a replacement or rebake of the original source GLB.
