# Gadget loot · initial playable layer

Two distinct devices enter the existing unique-item loot and loadout systems. Rogue Sentinels independently roll Field Vector Array (30%) and Conductive Membrane (40%) after the existing Adrenal Shunt roll. These rates are initial design values, not balance-validated. Existing Skitter and Warden tables remain intact. Loot is awarded to credited nearby players; duplicates are excluded. A class-incompatible array may be retained, but cannot be equipped by a non-Vanguard. No trading or dismantling exists on this branch.

## Play implications

- Field Vector Array broadens Discharge and Resonant Aegis by 2m, at the cost of 20% Charge generation. It occupies the device slot, so replacing a skill-granting device can invalidate a dependent implant.
- Conductive Membrane bridges Kinetics and Biotech, at the cost of 10% damage. It can enable a skill threshold at level 2 but does not supersede the single-discipline +3 devices.
- These are equipment sidegrades, not active-use gadgets or new equipment visuals.

## Workshop integration boundary

PR #9 owns the existing material counts, crafting recipes, server validation and Workshop UI. This branch must not introduce a second crafting engine. PR #9 has not passed integrated browser validation. Subsequent integration should extend its recipe contract from one owned unique target to multiple distinct unequipped unique ingredients, with atomic validation and consumption, while preserving old recipes.

Candidate fusion (not implemented): Field Vector Array + Conductive Membrane + a calibrated kinetic coupler -> Aegis Rectifier. A new functional identity, e.g. concentrated protection in exchange for reduced projection coverage, rather than simple addition of ingredient modifiers. Exact stat and range semantics require balance review; do not ship fabricated effects or recipes before the authoritative implementation and UI are ready.

Required fusion checks: duplicate ingredient IDs, missing or equipped ingredient, pre-owned output, cross-class output policy, skill and attunement requirements, combat/location gate, nonpositive/overflow materials, repeated/concurrent requests, persistence/reconnect, and complete rollback on refusal. Show consumed inputs and actual output effect in the UI before confirmation. No changes to existing directive rewards, slots or save format on this branch.

## Review

Simulated gameplay/economy: avoid power inflation; each device has opportunity costs. Security: reuse server-owned loot and equipment validation; no new mutation endpoint. Compatibility: additive stable IDs, isolated catalogue and existing inventory UI. UX: textual mechanical effects; item icons/models and interaction testing remain open. Adversarial: verify credited proximity, duplicate exclusion, incompatible classes, missing ownership, dependent implants and actual Aegis range. Retrospective: deterministic tests cover semantics, not drop-rate enjoyment, art quality or overall balance.
