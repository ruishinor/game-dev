# Asset pipeline

Reference-driven 3D asset production for Attunement. It is CPU-only, runs Blender as a Python module (`bpy`) for authoring, rendering and export, and is independent of the game runtime.

Each asset has a tracked configuration in `assets/<id>/asset.json` and an untracked workspace in `.asset-cache/pipeline/<id>/`. Stages record SHA-256 hashes of their inputs, parameters and outputs in `state.json` and are skipped when nothing has changed, so a failed or edited stage reruns alone. Source material is never written to. Unpublished references belong in git-ignored paths such as `/art-source/`.

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
