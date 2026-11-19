# Electrical combat rod — original art candidate

Status: original asset plus purchasable joined-configuration gameplay candidate. Fresh integrated validation, human fitting/visual acceptance and production promotion remain outstanding. The owner's two supplied concept boards remain outside Git. No donor weapon, external model or proprietary game mesh is used.

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

## Purchasable gameplay candidate — 2026-11-19

Owner requested vendor acquisition. Provisional playtest values: Sanctum quartermaster, 24 credits, QL 2, Common, Vanguard only, +3 base melee auto-attack damage at full condition. Existing unique weapon ownership, quote revision, range, combat, balance, repair and equip eligibility rules remain authoritative. No real stun, new range, crowd-control or alternate combat mode is introduced. Other classes cannot purchase or equip it. The client uses an equipped-appearance bit in the public player row, never another player's wallet/inventory or condition. This bit only attaches/detaches the original joined mesh to the currently loaded right-hand rig; existing melee animation drives it. Electrical pulses are bounded and emitted only during visible attack presentation under the existing effect quality/comfort policy. Joined equipment, vendor transaction, swap-away, disposal and pose attachment are tested; fresh CI and actual captures are still required. Dual configuration and Join/Split remain in the isolated preview/export, not live equipment. Full two-hand IK, authored weapon-specific attacks, live switching, multiplayer visual review, clipping and performance work remain outstanding. The original preview and asset geometry are retained. No owner reference boards are added.

## Live mode integration — 2026-11-19

The Vanguard can use the equipped item's context menu to separate into two batons or join the rod. This is a server-owned explicit desired mode (not a toggle), validated against equipped ownership, class, defeat, combat, auto-attack, inscription, production and airborne state. Same-mode requests do not mutate state. The sanitized mode persists across reconnect while the weapon is owned. The row's existing er field now uses 1 for joined and 2 for dual; no extra private inventory data is exposed. Damage, range, condition and price are intentionally identical in both modes. Presentation keeps one root on the right hand and interpolates the other half to/from the live left palm, with immediate settling under reduced motion, death or attack. The final dual grip and joined seam are covered by synthetic rig tests. Actual character fitting, two-hand support pose, authored attacks and visual acceptance are still distinct requirements; do not treat the interpolation as character IK or a validated physical handoff.

## Delivery gate follow-up — 2026-11-19

Vendor job 135459830272 on `eadea8e` failed at line 118 because the test requested the label `Equip` after the Field Pulse Emitter was already installed. The actual enabled context action is `Swap in`. Correct both swap interactions (rod and return to emitter); preserve all authority, mode and scene assertions. No gameplay change.
Port the same bounded preview diagnostic workflow used by #115 and #118, because the preexisting preview source and workflow match byte-for-byte. Job 25 minutes, test 20 minutes, stage/cleanup logging, no gameplay assertions removed or individual timeout changes. Fresh applicable CI required.

On `3c4815b`, eight of nine workflows succeeded. Vendor job 135470305884 matched two legitimate Swap in controls (inventory detail and context menu). Scope both swaps to the context menu, retaining exact labels and all outcome assertions. Reconcile merged retirement #118 (`cc7291e`), applying the active/archived race registry to the rod renderer without removing weapon functionality. Fresh exact-head validation required.
