# Asset pipeline

Reference-driven 3D asset production for Attunement. It is CPU-only, runs Blender as a Python module (`bpy`) for authoring, rendering and export, and is independent of the game runtime.

Each asset has a tracked configuration in `assets/<id>/asset.json` and an untracked workspace in `.asset-cache/pipeline/<id>/`. Stages record SHA-256 hashes of their inputs, parameters and outputs in `state.json` and are skipped when nothing has changed, so a failed or edited stage reruns alone. Source material is never written to. Unpublished references belong in git-ignored paths such as `/art-source/`.

## Owner GLB archive — first-class production-pipeline inputs

The owner-supplied 138-model archive is registered as asset `glb_archive`. **All** donor GLBs are available for reconstruction, refinement, composition and fitting in this pipeline; there is no per-model approval queue or preliminary exclusion because a model is low-poly.

From `tools/asset-pipeline`:

```bash
python -m asset_pipeline inspect --asset glb_archive
python -m asset_pipeline all --asset glb_archive
```

`inventory` validates the archive, hashes and structures of every donor. `ingest` extracts all 138 GLBs into the pipeline workspace at `.asset-cache/pipeline/glb_archive/imports/`, with a stable `imports.json` index mapping original paths to individual source inputs and hashes. Downstream geometry/material/rig/animation builders can consume those inputs directly. The original ZIP is not altered. This stage is intentionally independent of the optional Blender toolchain and of browser hosting.

**Asset-pipeline inclusion happens immediately.** Review, renderer checks and optimization apply to playable outputs during ordinary implementation, not to whether a developer may process the source. The `glb-source-quality` report helps prioritize rework; missing texture channels or low triangle count do not disqualify the source from the pipeline. Keep runtime delivery legal with respect to third-party distribution rights and technically non-regressive.

## Setup

Python 3.13 (the `bpy` wheel requires it), ffmpeg, and Node (`npm ci` at the repository root, for glTF Transform and Playwright).

```bash
uv venv -p 3.13 .venv-pipeline
VIRTUAL_ENV=.venv-pipeline uv pip install -r tools/asset-pipeline/requirements.txt
```

PowerShell:

```powershell
py -3.13 -m venv .venv-pipeline
.venv-pipeline\Scripts\pip install -r tools/asset-pipeline/requirements.txt
```

The environment is about 1.5 GB. No GPU is needed. COLMAP's dense PatchMatch stereo needs CUDA and is not used: dense geometry comes from OpenCV semi-global stereo with TSDF fusion (`dense.py`).

## Commands

Run from `tools/asset-pipeline` with the pipeline's Python:

```bash
python -m asset_pipeline list
python -m asset_pipeline inspect --asset benchmark_rockarch    # tools, inputs, stage status
python -m asset_pipeline all --asset benchmark_rockarch        # every stage, cached
python -m asset_pipeline recon_sfm --asset benchmark_rockarch --force
python -m asset_pipeline all --asset <id> --from build         # resume from a stage
python -m unittest discover -s tests -v                        # unit tests (no Blender needed)
```

## Stages

`controlled-benchmark` (Experiment A, `benchmark.py`):

| Stage | What it does |
|---|---|
| `capture` | Blender builds a deterministic test object and renders 56 views. `capture/` (images, cameras) is separate from `ground_truth/`, which only `evaluate` reads |
| `segment` | Foreground masks from a border background model. Enclosed holes are never filled |
| `recon_known` | A1: pairwise rectified SGBM stereo, depth agreement filter, TSDF fusion inside the silhouette hull, marching cubes |
| `video`, `extract`, `segment_frames` | Hold-out views excluded, the rest encoded as H.264, then frames extracted and selected (blur and duplicate rejection, contact sheet) |
| `sfm` | A2: pycolmap SIFT, exhaustive matching, incremental mapping on the frames alone, then undistortion |
| `recon_sfm` | A2: dense reconstruction with the estimated cameras |
| `texture` | Visibility-tested multi-view colour reprojection onto a UV atlas, with confidence map and coverage |
| `evaluate` | Surface accuracy and completeness, F-score, per-part completeness (exterior surface only), hold-out silhouette IoU and PSNR, camera error after similarity alignment |

`reference-driven-creature` (`creature.py`, first used for `assets/stillpoint`, an unreleased prototype committed at the owner's request; see its `outputs/README.md`): `ingest`, `segment`, `feasibility`, `measure`, `build`, `fit`, `game_ready`, `export`, `validate`, `preview`, `render`. The `feasibility` stage decides between photogrammetry and reference-constrained modelling from evidence (SIFT/RANSAC across views plus a real pycolmap attempt). It does not assume either.

## Experiment A baseline

Synthetic object, 49 reconstruction views and 7 hold-out views at 800×600, bounding-box diagonal 2.06 m. Measured by `evaluate`:

| | A1 known cameras | A2 cameras from SfM on video frames |
|---|---|---|
| Registered | known | 49 / 49, reprojection 0.33 px |
| Camera error after alignment | — | 1.3 mm position, 0.035° rotation, focal 0.09% |
| Surface error, median / mean | 3.3 / 11.6 mm | 3.8 / 16.1 mm |
| F-score at 1% / 2% of diagonal | 0.873 / 0.924 | 0.836 / 0.912 |
| Hold-out silhouette IoU | 0.983 | 0.984 |
| Hold-out PSNR (unlit reprojection vs photo) | 25.9 dB | 25.2 dB |
| Surface with source colour (texture) | 75% | 66% |

Limitations, all measured: undersides no camera sees are closed by the hull, not observed. TSDF output has topological noise (genus 171 for A1). Gaussian smoothing of the field reduces it (σ 1.2 voxel: genus 14) but costs hold-out IoU (0.983 → 0.962), so it is off by default. Reprojected colour keeps the capture lighting; it is not albedo.

## Runtime preview

`client/pipeline-preview.html` loads GLBs listed in `client/pipeline-assets/manifest.json` with the game's three.js loader. It plays their clips and moves the model at each clip's declared speed over a 0.5 m grid, so foot sliding is visible. `client/pipeline-assets/` is git-ignored: candidate outputs stay local until the owner decides to publish them (see `AGENTS.md`).

## Imported mechanical humanoids (`imported-mechanical-humanoid`)

The second asset family on this pipeline: it productionises an *existing*,
accepted humanoid mesh instead of reconstructing one. First user:
`assets/halo_construct` (the owner-accepted Halo Construct GLB, read-only).
Production record, decisions and measurements: `docs/art/HALO-CONSTRUCT-NPC.md`.

```sh
python -m asset_pipeline all --asset halo_construct          # ~15 min on 2 CPU cores, mostly Blender renders
python -m asset_pipeline rig --asset halo_construct --force  # one stage
node tools/assets/build.mjs halo_construct                   # manifest entry (verifies the published hash)
```

| Stage | What it does | New / reused |
|---|---|---|
| inspect | verifies the configured source SHA-256, records structure, extracts the atlas | new (`humanoid_analysis.load_source`) |
| baseline | lit / clay / wire renders of the untouched source, 10 views | reused `blender/render_evidence.py` |
| analyze | slab clustering (arms, legs, torso), joint pivots from the dark coupling bands, flattening of baked-in accessories onto a fitted body envelope | new `humanoid_analysis.py` |
| clean | voxel remesh to one manifold, two-pass protected decimation (ring, hands, feet keep 2× density), compact UVs, bakes: colour (sentinel-marked misses), mirrored donor colour, normals, AO, position | new `blender/humanoid_build.py` (op `clean`); bake helpers follow `game_ready.py` |
| materials | UV-space synthesis: authored crop top and shorts, ivory shell cleanup, mechanism kept dark, inferred ORM and optics emission | new `humanoid_materials.py` |
| wardrobe | security and vendor pieces lofted from dense body samples; Blender thickness, bevels, procedural PBR baked to one atlas per outfit | new `humanoid_wardrobe.py`, `blender/humanoid_build.py` (op `wardrobe`) |
| rig | the project humanoid skeleton (same joint names and rest rotations) fitted to the landmarks; coupling-band skin weights; ring variant; clips (reference + authored `Guard_Watch_Loop`); GLB assembly | new `humanoid_rig.py`, `gltf_io.py`, `js/extract-rig.mjs` |
| export | WebP + Meshopt + Khronos validator | reused `js/optimize.mjs` |
| validate | bind reproduction, rigid-shell strain, ground contact, garment penetration, ring aperture — per clip | new |
| evidence | role/pose renders of the exact optimised GLB (`js/decompress.mjs` undoes Meshopt for Blender only) | new `blender/humanoid_evidence.py` reusing `render_evidence` lighting/modes |
| publish | runtime GLB to `client/assets/`, committed reports, editable `.blend` files, compact evidence | new |

Shared infrastructure reused unchanged: `workspace.py` stage caching and
`run_blender` isolation, `blender/common.py`, `blender/render_evidence.py`,
`js/optimize.mjs`. Changed for every workflow: stage keys now also hash the
shared modules (`workspace.py`, `blender/common.py`) and the installed
toolchain versions, so editing shared code or upgrading `bpy` reruns cached
stages (it previously did not). `portable()` keeps absolute paths out of
committed reports.

What this route does **not** do: reconstruct anything; recover true PBR
channels from the source (they are inferred per material class); or make the
pipeline universal. The landmark finder assumes an upright, arms-down
humanoid with visible dark couplings at the joints; the flattening envelope
can move points up to ~7 mm within ~6 cm of a large removed accessory (unit
test `test_flatten_protrusions_is_continuous_and_local`).

## Body-fitted armour (`body-fitted-armour`)

The third asset family: wearable armour modelled against the project's own
runtime bodies (`client/assets/humanoid_m.glb`, `humanoid_f.glb`), skinned to
their shared 67-joint skeleton, with inventory icons rendered in Cycles from
the exported asset. First user: `assets/armour_chest` (the three live chest
items). Production record, decisions, measurements and the roadmap:
`docs/art/ARMOUR-3D.md`.

```sh
python -m asset_pipeline all --asset armour_chest        # ~20 min on 2 CPU cores (Blender bakes and renders)
node tools/assets/build.mjs armour_chest_m armour_chest_f  # manifest entries (verify the published hashes)
```

| Stage | What it does | New / reused |
|---|---|---|
| inspect | verifies the body hashes, dequantizes them (`js/dequantize.mjs`), extracts skeletons and validation clips | new; reuses `js/extract-rig.mjs` |
| design | lofts every item over each body from convex torso cross-sections (body + worn-under shells, since the body is hollow under them), relaxes sheets, pushes them clear along the surface normal and carries the vest's push to the layers above it | new `armour_design.py`; reuses `humanoid_wardrobe` helpers |
| build | thickness, bevels, procedural PBR from the vector-art palette, one baked atlas per item (base colour, roughness, metallic, normal, emissive) | reused `blender/humanoid_build.py` op `wardrobe`, generalised (route palettes, emission, mottle, 3D orientation, even-offset switch) |
| rig | torso-borne weights from the body surface (no leg or forearm influence, capped upper arm), rigid/band modes for plates; one GLB per body | new; reuses `gltf_io.GlbWriter`, `humanoid_rig.pack_weights` |
| export | WebP + Meshopt + Khronos validator (fails on errors) | reused `js/optimize.mjs` |
| validate | clearance from the skinned body + shells and edge strain against the body's own strain, over seven clips × 8 frames | new |
| icons | Cycles renders of each item from the exported GLB -> transparent WebP icons | new `blender/armour_render.py` reusing `render_evidence` lighting |
| evidence | worn renders on both bodies | new (same script) |
| publish | runtime GLBs, icons and the generated `client/src/item-renders.js`, compact reports, editable `.blend` sources, JPEG evidence | new |

**Hard-surface sets** (`assets/armour_vanguard_set`, `"builder": "hardsurface"`): the
design stage authors plates in limb/torso parameter space (`armour_cinderlock.py`:
faceted sections, plateau/ridge/lip profiles, grooves, vent holes, bolts, anchor soles);
the build stage (`blender/armour_hardsurface.py`) solidifies, cuts exact boolean grooves,
dissolves coplanar faces, bevels with hardened normals, adds emissive inlay strips with
flow UVs and bakes edge wear, cavity, AO and a detail normal per item. The rig stage
writes a second `item__fx` channel mesh, FX anchor nodes (`fxa--item--kind--n`) and
`extras.hides` (body shells the piece replaces). `ARMOUR_PREVIEW=1` builds quarter-size
textures with 4 bake samples for fast look iteration (separate cache key; never publish it).
