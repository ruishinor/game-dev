# Cinderlock Regalia v2 and the Severance Soldier patrols — handoff (2026-11-20)

Owner request, 2026-11-20: build the Cinderlock Regalia (Kinetic Vanguard, rare/craftable) as game-ready 3D models for the **Severance Soldier patrol groups**, following the owner's concept sheet, five-figure turnaround and written production specification (six modules, LOD0 ≤ 28,000 triangles, two 2K atlases, PBR palette, crimson emissive channels, LOD1/LOD2, rigid plate weighting). Use the existing engines and pipeline rather than new ones. The owner reference images and the specification text are owner material and are **not** in the repository.

This is a work-in-progress checkpoint on branch `charlie/festive-thompson-a5h4f5`. Nothing in the game runtime has changed yet: the published `client/assets/armour_vanguard_set_{m,f}.glb`, icons and `tools/asset-pipeline/assets/armour_vanguard_set/outputs/` are still the previous four-piece build.

## Status

| Step | State |
|---|---|
| 1. Six modular designs in the existing `body-fitted-armour` hard-surface route | Done (design stage runs on both bodies) |
| 2. Budgeted high→low build, shared atlases, LOD1/LOD2, tangents | Done, verified in preview mode only |
| 3. Full-quality build, validate, icons, evidence, publish | Not started (evidence render was blocked by a missing `libEGL`; installed, rerun pending) |
| 4. Severance Soldier enemy, server-only patrol groups (squads with formation following) | Planned, not started |
| 5. Soldier presentation: humanoid + all six modules, distance LOD switching, channel FX, attack/special VFX through the shared engine | Planned, not started |
| 6. Tests, in-game captures, docs, review gate | Not started |

## What changed (pipeline only)

**Modules** (`asset_pipeline/armour_cinderlock.py`, keyed in `assets/armour_vanguard_set/asset.json`):

| Module (GLB node) | Worn through | Content |
|---|---|---|
| `vanguard_field_set_chest` — Reactor Cuirass | chest item | under-vest to the waist, hexagonal reactor window with fins, traced pectorals, three abdominal tiers, rib-cage vents, four vertebral spine segments between two heat-sink housings, collar with throat notch and nape guard |
| `cinderlock_arms` — deltoid caps and bicep guards | (new module) | ribbed undersuit sleeve, rigid "floating" deltoid cap with piping along its lower edge, outer bicep guard with a U trace and two tension straps |
| `vanguard_field_set_gloves` — Induction Gauntlets | gloves item | forearm liner, layered bracer, ulna shield with a ridge conduit through its core, buckled wrist cuff, dorsal plate with a conduit fan, a strip on every finger segment (3 per finger, 2 per thumb) |
| `cinderlock_legs` — tactical trousers, belt, thigh plates | (new module) | trouser seat from the shorts shell, lofted trouser legs, 5 cm belt with buckle and side pouches, hip tassets, outer-quadriceps plates with traced outlines, hip seam piping |
| `vanguard_field_set_greaves` — Impact Greaves | greaves item | hexagonal knee cop with outline and chevron (rigid thigh/calf blend), two-segment tibia blade with side conduits, hinged rear calf shell |
| `vanguard_field_set_boots` — Anchor Boots | boots item | liner, upper, angled instep strap with buckle, toe cap with bumper strip, heel counter accents, ankle collar, 4 cm lugged sole with recessed heel block and a toe-bumper channel |

New helpers: `Plate.trace()` (emissive channel inset along a plate's perimeter, closed or along a run of corners), `inset_poly`, `bar` (straps, buckles, fins), a waist map for the belt (the torso map stops at the pelvis).

**Builder** (`blender/armour_hardsurface.py`, new `main_groups` path, used when the config has `build.groups`):

1. Each atlas group (`cinderlock_upper`: cuirass, arms, gauntlets; `cinderlock_lower`: legs, greaves, boots) is built at full detail.
2. Each module is collapse-decimated to its budget **including its channel strips**, with the groove geometry under the inlays protected by a vertex group (verified: an inverted group keeps those vertices). Bolts are bake-only detail. Sheets copied from body shells are welded first (their UV-seam splits blocked decimation).
3. The modules of a group are unwrapped into one 2048² atlas and every map is baked high→low (selected to active, cage 6 mm, low hidden from rays): material id, wear/cavity fields, AO against the body, tangent-space normal, and an emissive mask of the channels.
4. Inlay vertices that the low surface now covers are lifted onto it.
5. LOD1 (50 %) and LOD2 (25 %) are decimated **per module** from LOD0 and share its UVs. MikkTSpace tangents are exported (`gltf_io.mesh(tangents=)`).

**Rig/GLB** (`armour.py`): one material per atlas, a `_far` material with the emissive map for the distance LODs, nodes `<module>`, `<module>__lod1`, `<module>__lod2`, `<module>__fx`. Renders exclude `__lod` nodes; icons cover only the four items.

**Config**: specification palette (plates `#232528` m 0.85 r 0.38; trim `#16171A` m 0.25 r 0.62; undersuit `#1C1D20` m 0 r 0.78), channel colour `#FF1E1E`, budgets, atlas groups, `hides` per module (boots now hide the shoe shell, trousers the shorts/thighs/belt shells), validation against hands only.

## Measured (preview build: quarter textures, 4 samples; both bodies)

| Module | Budget | LOD0 (mesh + strips) | LOD1 | LOD2 |
|---|---|---|---|---|
| Cuirass | 7,500 | 6,212 + 1,288 | 3,106 | 1,552 |
| Arms | 3,500 | 2,948 + 552 | 1,474 | 736 |
| Gauntlets | 4,500 | 3,908 + 592 | 1,954 | 976 |
| Legs | 5,000 | 4,592 + 408 | 2,296 | 1,148 |
| Greaves | 4,500 | 4,164 + 336 | 2,082 | 1,040 |
| Boots | 3,000 | 2,376 + 624 (m) / 2,452 + 548 (f) | ~1,200 | ~600 |
| **Set** | **28,000** | **28,000** | **~12,100** | **~6,050** |

High meshes: about 125k triangles per body. Khronos validator: 0 errors, 0 warnings for both GLBs (preview). The previous published set is about 120k triangles with no LODs.

## Resume

```bash
uv venv -p 3.13 .venv-pipeline && VIRTUAL_ENV=.venv-pipeline uv pip install -r tools/asset-pipeline/requirements.txt
npm ci
apt-get install -y libegl1 libgl1   # Blender's compositor (evidence glare) needs EGL in headless containers
cd tools/asset-pipeline
ARMOUR_PREVIEW=1 ../../.venv-pipeline/bin/python -m asset_pipeline all --asset armour_vanguard_set --from design   # fast look
../../.venv-pipeline/bin/python -m asset_pipeline all --asset armour_vanguard_set --from design                    # full quality
```

Note: `python -m asset_pipeline inspect` prints the overview; the `inspect` *stage* runs as part of `all`.

## Next, in order

1. Rerun evidence; review against the concept (silhouette, trace placement, crimson balance, pants/boot transitions, heel plate clearance inside the boot liner on both bodies). Then full-quality build and `validate` (the previous set failed the phase-1 limits with `strict: false`; report honestly).
2. Runtime: `shared/armour-visual.js` module map (chest → cuirass + arms, greaves → legs + greaves) so players keep pauldrons and thigh plates; `wearArmour` shows LOD0 and hides `__lod*`, with a distance switch and `_far` emissive intensity; update `test/armour-3d.test.js` for module nodes.
3. Severance Soldier enemy and squads (server-only routes; formation following; social assist; staggered specials), presentation through the humanoid + armour path, a special VFX recipe in `client/src/vfx/combat.js`, Node tests (walkable routes, safe zone, server-only), browser capture in the Expanse.
4. Publish GLBs/icons, manifest (`node tools/assets/build.mjs`), docs and the AGENTS.md review gate.

## Deviations from the specification (to confirm with the owner)

- **No extra bones.** The shared 67-joint runtime skeleton has no twist or socket bones; deltoid caps and knee cops are single rigid islands on a fixed blend of their two joints, which is what a half-rotation socket bone would do. Adding bones would require rebuilding both body GLBs and every clip.
- **No mirrored UVs.** Each side gets unique texels (asymmetric wear and AO); texel density is reported instead.
- **One GLB per body** with modules as separate skinned nodes (the runtime contract), rather than six files; `.fbx` is not produced.
- **Groin gusset piping** is not modelled; hip seams and thigh plate outlines are.
- **Loot/rewards for soldiers** are not changed: an owner decision (and not to be described in public documents).

## Review gate (AGENTS.md) — checkpoint

1. Authority: unchanged; no runtime or server code in this checkpoint.
2. Exposure: pipeline code and configuration only (public presentation assets); no routes, rewards or probabilities.
3. Abuse cases: none introduced; to be covered with the server work (forged equip of modules, server-only squad data).
4. Verification: pipeline unit tests 30/30; design and preview build/rig/export on both bodies; validator clean. Not yet: full build, validation metrics, renders, in-game checks, owner art review.
