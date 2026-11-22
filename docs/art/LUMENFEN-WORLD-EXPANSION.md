# Lumenfen — independent world expansion

This branch adds **Lumenfen**, a separate 290 × 330 metre outdoor wetland with glasswater basins, rootglass forest, luminous fungi and native wildlife. It is not an ash-palette variant or copy of Severance Gate/Expanse's 3D kit.

## Geography and travel

The new **Rootglass Tear** spawns at a deterministic free location on the existing Verdigris Reach. Travel requires character level 7 and Resonance attunement; no extra Phase Scar calibration is required or modified.

- **Veil Landing**: safe southern arrival. **Veil Return** stands nearby and sends travellers back to the Rootglass Tear's Reach approach.
- **Glasswater Crossing** and **Root-Crown Crossing**: different interior living rifts linking opposite sectors of the wetland.
- The Mirrorpools, Mossbound Thicket, Tidal Mycelium and Luminous Canopy have distinct terrain and names.
- Fen Lanterns are non-aggressive native drifters; Bog Stalkers patrol the marsh, including one elite.

## Architecture and disclosure

Shared deterministic terrain, collision and portal anchors are in `shared/lumenfen.js`. Existing world movement, visibility, ground height and reconnect handling are extended through `shared/world.js`.

The new biome, creature models and living thresholds render from `client/src/lumenfen-*.js`. The owner-approved exterior Phase Scar and Severance Gate geometry and art remain unchanged.

`server/sim/lumenfen.js` exclusively authorizes travel: registered object ownership, region, range, line of sight, alive/not in combat, level, and attunement. Native enemies spawn once on the shared server and use existing authoritative AI, combat and reward systems. Browser code contains no rules that grant items or control player travel.

## Verification still needed

Unit tests: `node --test test/lumenfen.test.js`. Run existing world, regional progression, portal, atlas and Node tests, followed by actual desktop playtests at 1280×800 and 1920×1080. Verify collision and arrival clearance, four portal visuals, both-way travel, respawn/reconnect, day/night atmosphere, minimap and GPU budget.

This is a functional first-pass region and art kit; hand-authored production GLB models, audio identity, encounter depth and live visual acceptance remain future work. Do not mark it visually accepted without captured playtest evidence.
