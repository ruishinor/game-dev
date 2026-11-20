# Severance Expanse and Silent Foundry — delivery notes (2026-11-20)

Branch `feat/severance-expanse-landscape`, PR #139. This is the broad-strokes pass across all four milestones, done before any detailing, as the owner asked on 2026-11-20. Each system is playable end-to-end and tested; visual detailing comes in later passes.

## Delivered

### 1. Landscape

- **Region and gate.**
  - `shared/severance-gate.js`: the Expanse is 300 × 350 m, centred on (0, -720).
  - The gate is re-anchored at (0, -595). It stands in a saddle of the enclosure (`expanseSaddle`), so it reads against open sky.
  - The return rift (the Phase Scar type, #147) stands beside the arrival terrace on a level pad.
- **Three routes from the arrival to the gate:** the Causeway of Sentinels (the west canyon, under the colossal ring), the Severed Pass, and the Amber Flats (the east crystal flats). Massifs, mesas, spires, 14 crystal clusters, ruins and outcrops sit along them.
- **Terrain, `client/src/severance-pocket.js`.**
  - Mesa and ridge relief is carved only inside each massif's collider, so walkable ground matches the server.
  - World-space strata, an irregular ridge crest, and a gentle rise across the last walkable metres before a steep wall.
- **Environment kit.**
  - `severance_kit.glb` (2.3 MB) holds the ring, spires, crystal clusters and boulders. It is built by `asset_pipeline/blender/severance_kit.py` with the gate's bake method and served by its own route.
  - `client/src/severance-expanse-kit.js` instances it as the ring with a live inlaid channel, spires, ridge crags, mesa chimneys, talus, ridge-crest bluffs and outcrops.
  - Crystals get a shader glow, halos, motes and one roaming light; the glow rises at night.
- **Sky and draw calls.**
  - Inside the zone the sky follows the eye.
  - Static Reach dressing is culled inside both disconnected regions, which cut draw calls from about 970 to 100–200.
- **Gate presence:** the gate wakes only when someone approaches within 120 m. The arrival is about 270 m away.

### 2. Expedition Outpost

- **Safe zone.** A second safe zone, `inSafeZone`, gives no hostile damage or aggro and faster recovery.
- **Expedition Quartermaster.** The server vendor now takes a per-vendor stock profile. This one sells Field Restoratives and maintenance kits and repairs equipment; the Sanctum catalogue is unchanged.
- **Field Restorative.** A server-owned heal of 30 % of maximum health over 5 s, usable in combat, with a 20 s recovery. It has its own VFX recipe and catalogue portrait.
- **Presentation (broad strokes).** `client/src/severance-outpost.js`: a trussed angular shelter with ochre panels, the counter, crates, a generator, a comms mast with a beacon and perimeter lamps.

### 3. Patrols

- `server/sim/severance-patrols.js` (server-only) defines:
  - Causeway Sentinels.
  - An Ash Stalker in the Severed Pass.
  - A Shard Skitter brood on the Amber Flats.
  - Gate Drones on the ceremonial approach.
- They spawn with the first arrival and persist.
- Long patrols leash to the point where they left their route (`ai.js anchorOf`) and resume their route there. Static enemies are unchanged.

### 4. Silent Foundry

- **Layout.** `shared/silent-foundry.js` defines four chambers in a line: the Fabrication Hall, the Cultivation Vault, the Harmonic Chamber and the Excavation Depths.
- **Server.** `server/sim/silent-foundry.js` (server-only) holds the encounter of 15 enemies with the Foundry Overseer in the Depths, the progress record, a once-only Depths cache and the return portal.
- **Travel.** The gate now leads here. The Annex region remains in place but is no longer anyone's destination.
- **Interior (`client/src/silent-foundry.js`):**
  - culture vats with flowing liquid and glass;
  - press slits;
  - the resonator core with rotating rune rings;
  - glowing mineral columns;
  - per-chamber motes;
  - a four-light budget;
  - lighting, fog and sky switched inside and restored on leaving.

## Verification

- `npm test`: 460 tests pass.
- New suites:
  - `severance-expanse`: kit GLB, placements, ring, runtime, HTTP.
  - `severance-outpost`: safe zone, vendor stock, restorative, presentation.
  - `severance-patrols`: walkable routes, spawning, post leashing, safe zone, server-only.
  - `silent-foundry`: travel, persistence, chambers and route, cache, server-only, presentation.
- The route test confirms all three routes reach the gate and that no walkable neighbouring cells differ by 1 m or more.
- The rift browser walkthrough (`test/e2e/rift.mjs`) follows the new layout: the dormant gate wakes on approach, the player walks the passage, enters the Foundry and returns.
- Review captures were made with `node tools/severance-expanse-capture.mjs <dir>`. That covers views 01–16 of the Expanse and views 20–24 of the Foundry, in software GL, kept out of Git.

## Next passes (detailing)

1. **Outpost.** A Blender shelter asset to replace the procedural one, crew NPCs, and outpost VFX (generator heat shimmer, beacon flare).
2. **Patrols.** Expanse-specific variant visuals: ash and amber tints and crystal growths on the rigs.
3. **Foundry.**
   - A Blender architecture kit for walls, presses, vats and the resonator.
   - Mid-encounter set pieces.
   - Overseer specials and their VFX.
   - Retire the Annex code after owner confirmation.
4. **Real-GPU profiling** (`ATTUNEMENT_GPU=1` or the owner's machine) and the owner's visual review.
5. **Live world clock** driving the day/night loop.
6. **Sanctum upgrade** (last stage).

## Review gate (AGENTS.md)

1. **Authority.** The server owns travel (gate → Foundry → gate), safe zones, vendor stock and prices, restorative use and timing, patrol spawns and leashing, Foundry encounters, progress and the cache. Clients send intent only: interact, trade with ticket and revision, use a utility with a revision.
2. **Exposure.** Public by design: terrain and Foundry geometry, area names, the item description (its numbers are the player-facing text), and the kit GLB. Server-only and checked by tests: patrol routes and composition, Foundry encounter placement, the Overseer identity, cache rules and quantity, and vendor prices (sent only in a live vendor session).
3. **Abuse cases.** Tests cover:
   - forged, stale and replayed trades;
   - a remote vendor;
   - a stale or forged restorative revision and use while defeated;
   - cache claims without participation, in combat, and replayed;
   - travel in combat;
   - reconnect inside the Foundry (returns to the Reach spawn);
   - patrols never engaging inside the safe zone.
4. **Limitations.**
   - Visuals are broad strokes.
   - Captures use software GL; real-GPU profiling is pending.
   - Annex code is unreachable but not yet removed.
