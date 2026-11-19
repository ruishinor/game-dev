# Severance Expanse — work-in-progress handoff (2026-11-19)

Branch: `feat/severance-expanse-landscape` (from `main` at c652e46). This branch is not ready to merge: 4 Node tests fail because the client and tests still assume the old 87 m approach pocket.

## Merged before this branch

- #131: Severance Gate asset, server phase machine, travel route, landmark VFX and LOD bands.
- #137: day/night presentation loop (`?tod=`, `__attune.timeOfDay`, `severanceStep`).
- The companion-summoning fix in the Expanse (`server/sim/ground-navigation.js` `inWorld`).

## Done on this branch (committed, unmerged)

- **`shared/severance-gate.js`: full Expanse layout.**
  - Region `SEVERANCE_EXPANSE`: centre (0, -720), 300 × 350 m (hw 150, hd 175), rim 12. `SEVERANCE_POCKET` is kept as a deprecated alias.
  - The gate anchor moves to (0, -595), yaw π. Arrival is at (15, -866), the beacon at (15, -870.5), and the outpost site at (62, -848), r 17.
  - Terrain:
    - Massifs: a central spine cut by the Severed Pass, west and east mesas, gate-basin ridges and spires.
    - 14 mineral crystal clusters.
    - A colossal broken ring at (-48, 26), relative to the centre.
    - Re-laid ruins (west causeway, pass, flats, ceremonial approach) and 20 outcrops.
    - 96 props in total.
  - `massifLift` and `pocketHeight`: dunes, a dry lake, flattened gate, arrival and outpost pads, and a rim.
  - `pocketArea` labels: Severance Gate, Expedition Outpost, Arrival Rift, Severed Pass, Causeway of Sentinels, Amber Flats, Ash Plain.
  - A flood-fill check passed: the arrival, the outpost and the gate front are open, and the gate is reachable by the west-only, east-only and pass-only routes.
- **`tools/asset-pipeline/asset_pipeline/blender/severance_kit.py`: environment kit** built with the gate's methods (shared stone atlas bake, emissive channel inlay). It contains:
  - `Ring_Colossal` with `_Channel`, sunk into the ground, broken, with fallen voussoirs.
  - `Spire_A`/`B`/`C` (18, 24 and 30 m).
  - `Crystal_A`/`B`/`C` with shard children.
  - `Boulder_A`–`D`.
  - Each piece sits at the origin as its own node.
  - Output: `assets/severance_kit/outputs/severance_kit.glb`, 2.3 MB after `optimize.mjs … 2048 86 keep`, about 5.8 k triangles.
  - Rebuild with `PYTHONPATH=. python -m asset_pipeline.blender.severance_kit '{"work":"<dir>","result":"<dir>/r.json","bake":2048,"normal":2048}'`. Add `"quick":true` for a fast preview bake.

## Next steps, in order

1. **`client/src/severance-pocket.js`.**
   - Size the terrain from `SEVERANCE_EXPANSE`: about 2 m spacing, or chunk it.
   - Add a steep-slope strata tint via `onBeforeCompile`.
   - Instance the kit GLB: spires on `kind:'spire'` massifs (height `16 + (seed % 7) * 2.4`), crystals on `SEVERANCE_CRYSTALS` (use a runtime emissive or fresnel material and the teal flag), and the ring on `SEVERANCE_RING`.
   - Keep the sky group recentred while inside the region and restore it on exit.
   - Serve the GLB with a route in `server/index.js`, as for `severance_gate.glb`.
2. Re-export `SEVERANCE_EXPANSE` from `shared/world.js`, and update the minimap framing in `client/src/ui.js`.
3. Fix the four failing tests in `test/severance-gate.test.js`. They encode old-pocket positions and clearances: the approach-traversable test, the region-labels test, the phase-presence test and the landmark-bands test. Then run `npm test` and `test/e2e/rift.mjs`.
4. Update `tools/severance-capture.mjs` and `tools/severance-daynight-capture.mjs` for the new anchor. Capture review views, keeping them out of Git.
5. Open a PR with the AGENTS review gate (authority, exposure, abuse cases, verification), wait for CI, then merge.
6. Continue with the Outpost and quartermaster (safe zone, shelter asset, class-neutral healing consumable on the vendor and wallet contracts), then native patrols, then the Foundry interior replacing the Annex. Keep odds and encounter scripts server-only.

Out of public Git: owner reference images (`art-source/severance-gate/source/`), owner videos and review captures.

## Review gate (AGENTS.md)

1. **Authority.** Layout, colliders and heights are shared deterministic geometry, as in the merged gate. Travel, gate phase and zone membership stay server-validated. No new server mutations are on this branch.
2. **Exposure.** This branch adds public terrain layout, area names and a generated environment-kit asset. It adds no odds, encounter scripts, patrol logic or vendor stock. Outpost services and patrols must keep their tables server-side when they land.
3. **Abuse cases.** The larger region keeps the clamp-to-region collision. Once the client lands, re-verify reconnect-to-spawn, companion spawning inside the new bounds and passage-only gate travel.
4. **Verification.**
   - Done: flood-fill route check, a kit preview render, and `npm test` at 415 passed and 4 failed, all 4 being the known old-pocket assertions listed above.
   - Not run yet: browser e2e and captures.
