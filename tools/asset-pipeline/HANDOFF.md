# Asset pipeline handoff (2026-11-19)

Read [AGENTS.md](../../AGENTS.md) first. This covers `tools/asset-pipeline/`, the controlled benchmark and the Stillpoint prototype. The report with all evidence renders is a private page the owner holds. Every figure below can be regenerated with the commands here.

## State

| Area | State |
|---|---|
| Pipeline (`asset_pipeline/`) | Working, CPU-only, Blender 5.3 as a Python module. Stages are resumable and cached on input, parameter and output hashes. 12 unit tests, run in CI (`asset-pipeline.yml`). |
| Experiment A, `benchmark_rockarch` | Validated. Images-only reconstruction of a synthetic object: median surface error 3.3 mm with known cameras, 3.8 mm with cameras estimated by SfM from video frames (49/49 registered, 0.035° rotation error). Hold-out silhouette IoU 0.98. See `README.md`. |
| Stillpoint, `assets/stillpoint` | Reference-constrained Blender model (not photogrammetry; the art registered 0/6 views). Rigged with 6 clips, baked, exported: `outputs/stillpoint.glb`, 4.91 MB, 40,228 triangles, glTF-valid. **Not wired into the game.** Visual gate: not passed: 77/100 against an 85 target (74 before the 2026-11-19 visual pass). Weakest: materials 71, brim geology 76, silhouette 76. Author's own scoring, not an independent review. |
| Runtime preview | `npm run preview:pipeline`, then open the printed address. Loads committed pipeline GLBs in the game's three.js runtime with root motion over a 0.5 m grid. |

## Run it

```bash
uv venv -p 3.13 .venv-pipeline && VIRTUAL_ENV=.venv-pipeline uv pip install -r tools/asset-pipeline/requirements.txt
npm ci
cd tools/asset-pipeline
../../.venv-pipeline/bin/python -m asset_pipeline inspect --asset stillpoint
../../.venv-pipeline/bin/python -m asset_pipeline all --asset benchmark_rockarch      # ~10 min
../../.venv-pipeline/bin/python -m asset_pipeline all --asset stillpoint              # ~30 min, 20 of them evidence renders
../../.venv-pipeline/bin/python -m unittest discover -s tests -v
```

Stillpoint needs its original references in the git-ignored `art-source/stillpoint/source/`. Their names and SHA-256 hashes are in `assets/stillpoint/outputs/asset-manifest.json`; the owner holds the files. To iterate on the model alone, run `all --from build`. After a rebuild, copy `.asset-cache/pipeline/stillpoint/export/stillpoint.glb`, the rigged and source `.blend` files and the JSON reports into `assets/stillpoint/outputs/` (see that folder's README).

## Stillpoint: what is and isn't solved

Solved and measured:
- Plate layout follows the painted fractures.
- Lineup-derived scale.
- Four legs from the top view.
- Rigid rig.
- No planted-foot sliding (Walk 0 mm; other clips ≤ 0.6 mm per frame, checked by the `validate` stage).
- Bake misses filled from a fallback bake (2.0% of covered texels).
- Runtime loads with no console errors.

Open, in priority order:
1. **Art pass.** It still needs the art's thick, sloping brim slabs (sculpted, not procedural), richer weathering and moss, and a side texture projected from fitted cameras instead of procedural stone.
2. **Diagonal hatching on the leg blocks.** It comes from the stretched-noise ochre streak mapping, which should follow each block's own axis.
3. **Real-GPU performance.** All runtime checks used SwiftShader. Measure 40k triangles × N instances on a desktop GPU, and consider an LOD below 10k for ambient populations.
4. **Before placing it in the world:** an owner art sign-off; in-game scale against characters (body 3.0 m, dorsal top 1.9 m, measured from the lookbook lineup with a 1.75 m human); and a decision on which locomotion speed the runtime drives (Walk declares 0.40 m/s, Turn 22°/s).
5. **For the next creature:** ask for a turntable video or a consistent orthographic set. With those, the reconstruction stages (Mode A or B) apply directly.

## Pitfalls already hit (and fixed)

- The bake's darkest reference colour is painted shadow. Using it as albedo made the runtime asset near-black.
- IK at full leg extension makes feet hover and slide. Keep peak extension below 0.99 (`validate` reports it).
- Smart UV Project on noisy or faceted meshes floods the atlas with tiny islands. Use an 80° angle limit with concave `pack_islands`.
- Selected-to-active bakes miss where reduction moved the surface; hence the fallback fill.
- OpenCV 5 `stereoRectify` rejects `None` distortion.
- `fillPoly` over many triangles uses even-odd filling and cancels overlaps; use one `fillConvexPoly` per triangle.
- glTF Transform logs to stdout; the optimiser writes its report to a file.
- Evidence renders: hide the ground plane for below-horizon cameras, and disable the Wireframe modifier's even offset (it spikes).
