# Stillpoint — pipeline outputs (prototype, not live)

Committed at the owner's request (2026-11-19) so the work survives independently of the authoring session. This is unreleased companion material in a public repository by owner decision. It is **not** wired into the game, and it has **not** passed the visual quality gate (self-assessed 74/100 against an 85 target, with four criteria under 75). Do not promote it without a further art pass and owner approval.

| File | What it is |
|---|---|
| `stillpoint_source.blend` | Editable Blender source: 253 named parts, each with `part_class` and `bone` properties; the top-view reference crop is packed for its colour projection |
| `stillpoint_rigged.blend` | Runtime mesh (34,380 triangles), armature (root, body, upper and lower bone per leg), 6 baked clips as NLA tracks, baked maps packed |
| `stillpoint.glb` | Optimised runtime asset: 4.49 MB, WebP + meshopt, glTF-valid (0 errors). SHA-256 `fa107aa20c4f9bb1b5bbcad64085bebbc1730d1d2dc03364aeb406721d7c24d3` |
| `asset-manifest.json` | Reference inventory: source hashes, native crops, view classes and roles |
| `feasibility.json` | Why photogrammetry was ruled out: pycolmap registered 0 of 6 views; SIFT/RANSAC inliers at chance level |
| `constraints.json` | What was measured from the references: outline, 43 fracture plates, 70 crystal footprints, legs, lineup scale and heights, colour palette |
| `fit.json` | Best-fit-camera silhouette IoU per reference view (0.65–0.72; the references agree with each other at 0.58–0.79) |
| `game_ready.json`, `export.json`, `animation.json` | Rig and clip metadata, GLB contents and validator result, locomotion checks (no planted-foot sliding in Walk; ≤ 0.6 mm per frame elsewhere) |

## Method

Reference-constrained Blender modelling (Mode C) with Mode-B elements: measured layout and silhouettes, fitted approximate cameras, and orthographic top-view colour reprojection. **It is not a photogrammetric reconstruction.** Layout, scale and dorsal colour are measured from the references. Individual rock and crystal shapes, the PBR channels, joint heights and the gait are authored.

## Regenerate

The original references are not in the repository. Put them at the paths in `../asset.json` (`art-source/stillpoint/source/`, git-ignored); their SHA-256 hashes are in `asset-manifest.json`. Then, from `tools/asset-pipeline`:

```bash
python -m asset_pipeline all --asset stillpoint
```
