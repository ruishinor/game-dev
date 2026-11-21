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
| Published runtime GLBs, icons, manifest | Done (second pass: glow ribbons, boots, collar) |
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

## Measured — full quality (2048² atlases, 16-sample bakes), 2026-11-21 second pass

What is drawn at each distance (LOD0 includes the animated channel strips; every level includes the glow ribbons):

| Body | LOD0 | LOD1 + glow | LOD2 + glow | Glow ribbons | GLB | Validator | Damaged pieces |
|---|---|---|---|---|---|---|---|
| m | 27,868 / 28,000 | 11,646 / 14,000 | 5,981 / 7,000 | 1,454 | 5.3 MB | 0 errors, 0 warnings | none |
| f | 27,880 / 28,000 | 11,647 / 14,000 | 5,942 / 7,000 | 1,382 | 5.3 MB | 0 errors, 0 warnings | none |

Per module, LOD0 including strips and glow, both bodies: cuirass ≤ 7,500, arms ≤ 3,500, gauntlets ≤ 4,500, legs ≤ 5,000, greaves ≤ 4,500, boots ≤ 3,000. The test `test/armour-3d.test.js` enforces these budgets, the module and glow nodes, and tangents on the published GLBs.

**Art pass (owner feedback, 2026-11-21):**
* **Collar:** lowered and brought closer to the neck: two short rings and a smaller nape guard.
* **Boots:**
  * The shoe-derived liner decimated into holes (about 150 triangles per foot) and read as crumpled, see-through flaps. It is replaced by a smooth, closed lofted boot body.
  * The upper covers only the forefoot.
  * A slimmer angled instep strap.
  * A heel counter on the vertical ankle map, so nothing folds over the shoe's ankle opening.

**Validation** (seven clips × 8 frames; limits unchanged, `strict: false`, so this reports and does not gate):

| Body | Module | Deepest 0.5 % | Inside body (worst frame) | Inside kept shells | Edge strain (limit) | Pass |
|---|---|---|---|---|---|---|
| m | cuirass | −16.3 mm | 4.56 % | 0 % | 0.37 (0.84) | no |
| m | arms | −38.5 mm | 6.62 % | 0 % | 0.46 | no |
| m | gauntlets | −6.7 mm | 0.65 % | 4.13 % | 0.69 | no |
| m | legs | −32.6 mm | 4.14 % | 0.52 % | 0.61 | no |
| m | greaves | −8.9 mm | 1.03 % | 0 % | 0.48 | **yes** |
| m | boots | −181 mm\* | 2.04 % | 0 % | 0.22 | no |
| f | cuirass | −13.4 mm | 2.38 % | 0 % | 0.43 (0.89) | no |
| f | arms | −48.5 mm | 3.91 % | 0 % | 0.41 | no |
| f | gauntlets | −6.2 mm | 0.48 % | 3.17 % | 0.58 | no |
| f | legs | −23.8 mm | 4.97 % | 1.6 % | 0.53 | no |
| f | greaves | −13.4 mm | 1.44 % | 0 % | 0.48 | **yes** |
| f | boots | −157 mm\* | 4.93 % | 0 % | 0.12 | no |

\* Measurement artefact: the body skin ends about 5 cm above the ankle joint (y −0.639 vs −0.687); the feet exist only as the shoe shell, which the boots hide. Boot numbers below the ankle measure against that stump.

Edge strain passes everywhere, and the greaves pass outright. The lowered collar raised the male cuirass from 2.99 % to 4.56 % of vertices inside the body: it now sits close enough that the neck meets it in some frames. Penetration still fails mostly where thin undersuit layers (sleeves, trouser legs) sit over joints that bulge in sprint and punch frames, and where the rigid deltoid caps meet a deforming shoulder.

## Severance Soldiers

* **Server** (`server/sim/severance-patrols.js`, `ai.js`):
  * **Five squads roam long loops** through the Expanse: Far West, Causeway, Severed Pass, Amber Flats and Gate Basin, each loop 340–754 m. The loops were path-planned on a 1 m grid with a 3 m formation corridor clear of colliders, the outpost and the arrival, and they stay more than 10 m from every resonant-vein harvest site (`test/severance-veins.test.js`).
  * Each squad is three strong. A soldier walks point on the route; a second soldier and the **sergeant follow, the sergeant at the rear** (formation slots in the point's heading frame). Followers walk the route themselves when the point is engaged, down or more than 40 m away.
  * The whole squad engages when any member is attacked (`social`).
  * **The sergeant hangs back** about 4 m from the fight while any squadmate is still fighting, then closes in.
  * Sergeants carry a public `rg` flag, so Tab targeting ranks them after their soldiers even when the squad is approached from behind.
  * Kinetic Discharge first-cast times are staggered.
  * Routes, slots and squad links never reach clients.
* **Enemy** (`shared/content.js` `severance_soldier`): a melee brawler with a telegraphed point-blank Kinetic Discharge. Numbers are first-pass tuning for the owner to adjust after play.
* **Loot:** owner decision, 2026-11-21: the squads drop no items. The empty entry in `server/sim/loot-tables.js` is that decision. The publication preflight flags any change to that file by path; this one is exempt by the owner.
* **Client:**
  * The `severance_soldier` look wears all six modules over a dark undersuit (shown only until the armour loads). Each soldier gets a stable face and frame from its entity id.
  * Distance LODs switch at 14 m and 32 m with hysteresis.
  * **Channel glow:** a soft additive ribbon over every channel (`<module>__glow`) widens and brightens with camera distance: half-width 6 mm up close, about 2.8 cm at 10 m (about 3 px), 4.5 cm at most. The widening happens in bind space before skinning, so the lines still read at 10–30 m, where the 3 mm strips are under a pixel. Up close it stays a faint halo over the animated strips. The ribbons share the strips' flow animation and surge, and stay visible at every LOD.
  * During the wind-up the armour channels charge; on release the Vanguard Discharge animation plays with a crimson recipe in the shared combat VFX engine (`vfx/combat.js` `kinetic_discharge`). The recipe is also inspectable in the VFX lab: `client/vfx-lab.html?fx=area:kinetic_discharge`. It is deterministic across seeks and raises no page errors.
  * The Codex has a soldier entry.
* **Captures:** `node tools/severance-expanse-capture.mjs <dir> 18` covers squad close, mid, 24 m (day and night) and far, and the discharge (wind-up and burst). `node tools/vfx-lab-capture.mjs <dir> kinetic_discharge` covers the recipe on its own. Review material stays out of Git.

## Tests

* New: `test/severance-soldiers.test.js` (composition, formation, shared aggro and leash, metadata carries no route/slot/link) and `test/cinderlock-modules.test.js` (module map, prototype-key safety, forged `av`, LOD switching and hysteresis).
* Extended: `test/armour-3d.test.js` checks the module nodes, the 28k/14k/7k budgets on the published GLBs, and tangents.
* Full suite: see the publishing commit message.

## Open items (owner review)

1. **Art:**
   * Boots and collar are reworked (above) and need your review.
   * Decimation still leaves jagged edges on some lower ab plates.
   * Owner art acceptance of the set is outstanding.
2. **Clearance:**
   * Raise the sleeve and trouser offsets, and pull the collar back about 3 mm on the masculine body.
   * Consider band (rather than rigid) weights for the bicep guard if you accept slight plate flex.
   * Add a foot surface to the validation body so the boot numbers mean something.
3. **Not in the specification's form:**
   * No extra bones: the shared 67-joint skeleton has no twist or socket bones, so caps and knee cops are rigid islands on a fixed two-joint blend.
   * No mirrored UVs: unique texels per side for asymmetric wear and AO.
   * One GLB per body rather than six files; no `.fbx`.
   * No groin-gusset piping.
4. **Readability:** a renderer-wide bloom pass would further strengthen the channels at range (a cross-game performance decision).
5. **Performance:** real-GPU frame cost with five squads on screen is unmeasured; software GL only here.

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
