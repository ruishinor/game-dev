# Turret Drone

## Purpose

This enemy extends the Derelict Relay roster with a heavier ranged denial unit derived from the supplied turret-drone spider blueprint and pipeline reference.

**Accepted type name:** `Turret Drone`

## Delivery scope

Implemented with the same practical production pattern used for Spindle/Halo Construct:

- procedural source asset generation under `tools/assets/`
- generated GLB built through the asset manifest pipeline
- runtime client presentation rig with articulated legs and turret tracking
- authoritative server/content registration as a hostile enemy
- gameplay integration via spawn, loot, journal copy and special telegraph/VFX coverage

## Key files

- `tools/assets/turret-drone.mjs`
- `client/src/turret-drone.js`
- `shared/content.js`
- `server/sim/loot-tables.js`
- `client/src/characters.js`
- `client/assets/turret_drone.glb`
- `test/turret-drone.test.js`

## Gameplay profile

- role: heavy relay-denial turret drone
- base attack: ranged bolt fire
- special: `Suppressive Barrage` (`turret_drone_barrage`)
- zone: eastern outskirts of Derelict Relay; eight collision-checked spawn points
- level 3, HP 188, attack range 17 m, attack interval 2.5 s, aggro radius 8 m
- initial balance values, not a completed encounter playtest

## Validation evidence

Validation completed on the recovered snapshot:

- `node tools/assets/build.mjs turret_drone`
- `npm test` (333/333 passed before the additional GLB hierarchy assertion)

Notable validated outcomes:

- generated `turret_drone.glb` passed manifest, disk and Khronos glTF validation through `test/assets.test.js`
- Survey Strider regression test remained green
- all eight spawn positions pass collision validation; existing spawn order is preserved

## Notes / limitations

- `turret_drone_barrage` has a dedicated area recipe and a low-quality fallback. Live browser presentation, ground contact, visual fidelity, crowd performance and multiplayer encounter balance have not been verified.
- The generator reuses the Spindle geometry and material helper modules. Reconcile against the merged Spindle branch or include those reviewed helpers before building. No separate distance LOD was implemented; profile the eight-unit encounter before deciding whether to add one.
