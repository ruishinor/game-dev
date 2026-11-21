# Cinderlock Regalia v2 and the Severance Soldier patrols — handoff (2026-11-21)

Owner request, 2026-11-20: build the Cinderlock Regalia (Kinetic Vanguard, rare/craftable) as game-ready 3D models for the **Severance Soldier patrol groups**, following the owner's concept sheet, five-figure turnaround and written production specification (six modules, LOD0 ≤ 28,000 triangles, two 2K atlases, PBR palette, crimson emissive channels, LOD1/LOD2, rigid plate weighting). Use the existing engines and pipeline rather than new ones. The owner reference images and the specification text are owner material and are **not** in the repository.

Branch `charlie/festive-thompson-a5h4f5` (Claude's reserved Severance track, AGENTS.md). Current main, including #192, is merged in.

## Status

| Step | State |
|---|---|
| Six modular designs on the existing `body-fitted-armour` hard-surface route | Done, both bodies |
| Budgeted high→low build, two shared 2K atlases, LOD1/LOD2, tangents | Done, full quality, both bodies |
| Validation over seven clips | Run; strain passes everywhere, body penetration fails on five modules (below). Not accepted |
| Severance Soldier enemy, server-only squads with formation following | Done, tested |
| Soldier presentation: humanoid + six modules, distance LODs, channel FX, Kinetic Discharge VFX | Done; unit-tested and captured in game (software GL) |
| Published runtime GLBs, icons, manifest | Done; full suite 554/554 |
| Owner art review | Outstanding |

## Modules

| Module (GLB node) | Worn through | Content |
|---|---|---|
| `vanguard_field_set_chest` — Reactor Cuirass | chest item | under-vest to the waist, hexagonal reactor window with fins, traced pectorals, three abdominal tiers, rib-cage vents, four vertebral spine segments between two heat-sink housings, collar with throat notch and nape guard |
| `cinderlock_arms` — deltoid caps and bicep guards | chest item (module) | ribbed undersuit sleeve, rigid "floating" deltoid cap with piping along its lower edge, outer bicep guard with a U trace and two tension straps |
| `vanguard_field_set_gloves` — Induction Gauntlets | gloves item | forearm liner, layered bracer, ulna shield with a ridge conduit through its core, buckled wrist cuff, dorsal plate with a conduit fan, a strip on every finger segment (3 per finger, 2 per thumb) |
| `cinderlock_legs` — tactical trousers, belt, thigh plates | greaves item (module) | trouser seat from the waist to the crotch, fitted trouser legs, 5 cm belt with buckle and side pouches, hip tassets, outer-quadriceps plates with traced outlines, hip seam piping |
| `vanguard_field_set_greaves` — Impact Greaves | greaves item | hexagonal knee cop with outline and chevron (rigid thigh/calf blend), two-segment tibia blade with side conduits, hinged rear calf shell |
| `vanguard_field_set_boots` — Anchor Boots | boots item | liner, upper, angled instep strap with buckle, toe cap with bumper strip, heel counter accents, ankle collar, 4 cm lugged sole with recessed heel block and a toe-bumper channel |

The two new modules are not items and never appear in `av`: `shared/armour-visual.js` maps the cuirass to cuirass + arms and the greaves to legs + greaves, so players and soldiers wear the same set.

## Method (what changed in the pipeline)

* **Design** (`armour_cinderlock.py`): `Plate.trace()` channels inset along plate perimeters, `inset_poly`, `bar` (straps, buckles, fins), a waist map for belt/seat/tassets, and trousers built from the skin. The body's shorts shell is skirt-shaped down to the knee and is hidden under the trousers.
* **Builder** (`blender/armour_hardsurface.py`, `main_groups`):
  1. Each atlas group (`cinderlock_upper`, `cinderlock_lower`) is built at full detail.
  2. The low pieces have their unseen inner faces stripped (faces that point at the body *and* hit it within 12 cm along their normal).
  3. Each piece is unwrapped on its own. The module budget is shared over its pieces (budget includes its channel strips), and each piece is decimated with its channel grooves protected.
  4. Pieces are packed into one 2048² atlas per group, and every map is baked high→low: id, wear/cavity fields, AO, tangent normal, and the channels' emissive mask.
  5. LOD1/LOD2 are decimated per module from LOD0 and share its UVs. MikkTSpace tangents are exported.
* **Booleans:** Blender's Manifold solver, with Exact as fallback. Exact deleted whole plates for some cutters (measured on the lower collar ring, flank, scapula, heat-sink housing and thigh plates, which kept under 1 % of their area). Closed grooves are now ring cutters. Each build reports `damaged_pieces` (empty in the published build).
* **Rig/GLB:** one material per atlas, a `_far` material with the emissive map for LOD1/LOD2, and nodes `<module>`, `<module>__lod1`, `<module>__lod2`, `<module>__fx`.

## Measured — full quality (2048² atlases, 16-sample bakes)

| Body | LOD0 (incl. channel strips) | LOD1 | LOD2 | GLB | Validator | Damaged pieces |
|---|---|---|---|---|---|---|
| m | 27,887 / 28,000 | 12,038 | 6,016 | 5.7 MB | 0 errors, 0 warnings | none |
| f | 27,923 / 28,000 | 12,095 | 6,045 | 5.7 MB | 0 errors, 0 warnings | none |

Per module (LOD0 incl. strips, both bodies): cuirass ≤ 7,500, arms ≤ 3,500, gauntlets ≤ 4,500, legs ≤ 5,000, greaves ≤ 4,500, boots ≤ 3,000. The previous published set was about 120,000 triangles with no LODs.

**Validation** (seven clips × 8 frames; limits unchanged, `strict: false`, so this reports and does not gate):

| Body | Module | Deepest 0.5 % | Inside body (worst frame) | Inside kept shells | Edge strain (limit) | Pass |
|---|---|---|---|---|---|---|
| m | cuirass | −14.5 mm | 2.99 % | 0 % | 0.38 (0.84) | no |
| m | arms | −38.5 mm | 6.75 % | 0 % | 0.44 | no |
| m | gauntlets | −6.7 mm | 0.62 % | 3.94 % | 0.67 | no |
| m | legs | −32.3 mm | 4.23 % | 0.5 % | 0.63 | no |
| m | greaves | −8.7 mm | 1.06 % | 0 % | 0.48 | **yes** |
| m | boots | −161 mm\* | 1.47 % | 0 % | 0.30 | no |
| f | cuirass | −12.7 mm | 2.18 % | 0 % | 0.45 (0.89) | no |
| f | arms | −48.4 mm | 3.90 % | 0 % | 0.42 | no |
| f | gauntlets | −6.2 mm | 0.48 % | 3.24 % | 0.59 | no |
| f | legs | −24.0 mm | 5.08 % | 1.55 % | 0.56 | no |
| f | greaves | −12.8 mm | 1.43 % | 0 % | 0.48 | **yes** |
| f | boots | −148 mm\* | 3.89 % | 0 % | 0.19 | no |

\* Measurement artefact: the body skin ends about 5 cm above the ankle joint (y −0.639 vs −0.687); the feet exist only as the shoe shell, which the boots now hide. The boot numbers below the ankle measure against that stump.

Compared with the previous build, edge strain now passes everywhere (the old gauntlets exceeded it: 1.15 vs 0.83) and the greaves pass outright. Penetration still fails mostly where thin undersuit layers (sleeves 4.5 mm off the skin, trouser legs 9 mm) sit over joints that bulge in sprint and punch frames, and where rigid deltoid caps meet a deforming shoulder.

## Severance Soldiers

* **Server** (`server/sim/severance-patrols.js`, `ai.js`):
  * Three squads, each a sergeant and two soldiers, on the Severed Pass, the Causeway and the gate basin.
  * Followers hold a wedge slot in the sergeant's heading frame. They walk the route themselves when the sergeant is engaged, down or more than 40 m away.
  * The whole squad engages when any member is attacked (`social`), and the Kinetic Discharge first-cast times are staggered.
  * Routes, slots and links never reach clients.
* **Enemy** (`shared/content.js` `severance_soldier`): a melee brawler with a telegraphed point-blank Kinetic Discharge. Numbers are first-pass tuning for the owner to adjust after play.
* **Client:**
  * The `severance_soldier` look wears all six modules over a dark undersuit (shown only until the armour loads). Each soldier gets a stable face and frame from its entity id.
  * Distance LODs switch at 14 m and 32 m with hysteresis. Channel strips show on LOD0 only; the far levels use the HDR emissive map.
  * The armour channels charge through the wind-up, and the release plays the Vanguard Discharge animation plus a crimson recipe in the shared combat VFX engine (`vfx/combat.js` `kinetic_discharge`).
  * The Codex has a soldier entry.
* **Captures:** `node tools/severance-expanse-capture.mjs <dir> 18` covers squad close, mid and far, night, and the discharge (wind-up and burst). Review material stays out of Git.
* **In game (software GL, 1280×720, 2026-11-21):**
  * The squads hold their wedge, each soldier has its own face, and the full set is worn on both frames.
  * The discharge reads clearly: the shared wind-up dome and ground telegraph, the crimson burst, and the Discharge animation.
  * No console or page errors.
  * The first close shot was taken before the 5.5 MB bundle had loaded, so it shows the undersuit fallback; the later shots show the armour.
  * **Finding: the channels barely read at gameplay distance.** Only the reactor and the anchor halos show at 8–10 m. The strips are about 3 mm wide, under a pixel at that range, and the renderer has no bloom pass. Options: a wider additive glow ribbon per channel built by the pipeline and driven by the armour FX shader, distance-scaled halos, or a renderer-wide bloom pass (a cross-game performance decision).
  * Frame cost in that view: 550–640 draw calls, 0.83–0.96 M triangles. Not a GPU figure.

## Tests

* New: `test/severance-soldiers.test.js` (composition, formation, shared aggro and leash, metadata carries no route/slot/link) and `test/cinderlock-modules.test.js` (module map, prototype-key safety, forged `av`, LOD switching and hysteresis).
* Extended: `test/armour-3d.test.js` checks the module nodes, the 28k/14k/7k budgets on the published GLBs, and tangents.
* Full suite on the publishing commit: 554/554.

## Open items (owner review)

1. **Art pass, by priority:**
   * The **boots** read crumpled at 3,000 triangles: the upper and instep strap need a cleaner design rather than more triangles.
   * The **collar and nape guard** are too tall and boxy from the front.
   * Decimation leaves jagged edges on some lower ab plates.
2. **Clearance:**
   * Raise the sleeve and trouser offsets, and consider band (rather than rigid) weights for the bicep guard if the owner accepts slight plate flex.
   * Add a foot surface to the validation body so boot numbers mean something.
3. **Not in the specification's form:**
   * No extra bones: the shared 67-joint skeleton has no twist or socket bones, so caps and knee cops are rigid islands on a fixed two-joint blend.
   * No mirrored UVs: unique texels per side for asymmetric wear and AO.
   * One GLB per body, not six files; no `.fbx`.
   * No groin-gusset piping.
4. **Rewards:** soldiers have an explicitly empty item-drop entry. The publication preflight flags any change to `server/sim/loot-tables.js` by path. This change adds no reward data; loot for soldiers is an owner decision and is not described here.
5. Real-GPU frame cost with three squads on screen is unmeasured (software GL only here).

## Review gate (AGENTS.md)

1. **Authority:** the server owns squad spawning, formation, aggro, leash, specials and damage. Clients send nothing new. Worn armour for players is still derived by the server (`av`). The soldiers' armour is a fixed client-side look keyed by enemy type and carries no state.
2. **Exposure:** public presentation assets (GLBs, icons), the enemy's player-facing name, level, health, attack and special (as for every Codex creature). Squad routes, composition, slots and links stay server-only (tested). No reward data.
3. **Abuse:** forged module ids in a loadout yield nothing (`publicArmourVisual`), and `modulesOf('__proto__')` is empty (a real bug, caught by the new test and fixed). Server-side squads take no client input.
4. **Verification and limits:** the tests above, the pipeline reports, Cycles evidence and in-game software-GL captures. Penetration limits are not met, there is no owner art acceptance, and real-GPU cost is unmeasured.

## Rebuild

```bash
uv venv -p 3.13 .venv-pipeline && VIRTUAL_ENV=.venv-pipeline uv pip install -r tools/asset-pipeline/requirements.txt
npm ci
apt-get install -y libegl1 libgl1   # Blender's compositor (evidence glare) needs EGL in headless containers
cd tools/asset-pipeline
ARMOUR_PREVIEW=1 ../../.venv-pipeline/bin/python -m asset_pipeline all --asset armour_vanguard_set   # fast look (quarter textures)
../../.venv-pipeline/bin/python -m asset_pipeline all --asset armour_vanguard_set                    # full quality, ~40 min on 4 cores
cd ../.. && node tools/assets/build.mjs armour_vanguard_set_m armour_vanguard_set_f
```
