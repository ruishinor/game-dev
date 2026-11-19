# Electrical combat rod — original art candidate

Status: source and isolated runtime inspection; gameplay integration, rendered evidence and production promotion are not yet complete. The owner's two supplied concept boards remain outside Git. No donor weapon, external model or proprietary game mesh is used.

## Reference interpretation

The first board governs the visual design: matched dark ridged grips, long blue-black shafts with blue spiral inlays, luminous channel tips, a central alignment collar and an end-to-end two-part configuration. The second board illustrates a production workflow; it is not calibrated multi-view evidence. A reference-constrained hard-surface mesh is the defensible source, rather than claiming photogrammetric recovery or baking the board's drawn lighting into albedo. Proportions are artistic game-space dimensions, not engineering specifications for a physical device.

The candidate source uses merged material-separated rigid geometry, shared across the two halves, with named grip, coupler, channel and tip anchors. Join and Split are reversible; rotate while separated, close the seam only after alignment. The existing lightning and particle pool provides short local blue-cyan discharges with an explicit quality and reduced-motion gate. No perpetual scene light or full-shaft particle aura.

## Reproduction and inspection

From repository root after `npm ci`:

```sh
node tools/asset-pipeline/js/export-electrical-rod.mjs
node --test test/electrical-rod*.test.js
npm start
```

Open `/client/electrical-rod-preview.html` on the running local game server. Inspect both modes, connection, reversal midway, power on/off, motion study, orbit/close-up and comfort settings. The exporter writes a GLB with named rigid nodes plus Join/Split animation clips and the Khronos validator report beneath the local asset cache, not the shipped manifest. The runtime preview uses the authored source directly so it exercises actual geometry and Attunement VFX. The motion study is a weapon-only presentation study, not a humanoid animation or a real combat result.

## Remaining production gates

- Execute the exporter and inspect validator warnings and actual GLB; review matched screenshots and motion evidence against both supplied boards.
- Fit hand-local transforms to each supported body/rig; implement two-hand constraints, dual wield and rod-specific idle, locomotion, equip, transform, strikes and recovery. Check both grip contacts and avoid clipping.
- Define approved equipment acquisition and mode rules. Existing public equipment definitions are core bonuses, and remote player metadata currently omits weapon appearance. Do not alter class attack kind or damage based on a client request. The server must own item ownership, eligibility, mode, action timing, hit resolution, replay handling and persistence; replicate only the authorized appearance/mode needed for other clients.
- Bind acknowledged mode changes and confirmed contact events to presentation. No damage or stun logic is contained in this asset module. Effects must originate at tip nodes, not at a generic chest projectile.
- Review triangle counts, draw calls, material look and distant readability using measured game scenes; add LOD only if justified. Validate both human frames, two client contexts, death, reconnect, swap, equip/unequip and reduced effects before production use.
- Publish only approved original deliverables; do not commit the owner's source boards, private design notes or unapproved capture material.

No browser render, local dependency installation or multiplayer check is asserted in this record.
