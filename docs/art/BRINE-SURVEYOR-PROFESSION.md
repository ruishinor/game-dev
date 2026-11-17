# Brine Surveyor — profession prototype

The old Brine Surveyor was a Symbiotech cosmetic look. The new third profession is a solo field engineer: no companion, no healing or Charge abilities. Its loop is observe -> bore -> position a fixed rig -> charge or demolish. A target-specific analysis belongs to the player, not the enemy globally. The rig is stationary, visible to nearby clients, temporary, and not an NPC or companion.

- Fault Scan: recover 30 cells, one analysis for 9s, no automatic damage.
- Core Bore: consumes that analysis and 30 cells; 30 base damage.
- Field Rig: stationary 12s, recharges 8 cells/s within 4m, 16s cooldown.
- Controlled Blast: consume rig and 25 cells; 28 base area damage centered on the rig, maximum remote distance 30m.
- First directive: commission with two successful bores, not three kills. Class-specific Device, Implant and competing glyphs. Later shared world objectives remain.
- Power Cells and rig/analysis are transient; character saves persist the profession and gear only. Old cosmetic Surveyors retain their Symbiotech profession and progress, reverting to Conductor appearance; create a new Surveyor for the new playstyle.
- Existing GLB humanoid and available animation clips are reused; fallback silhouette and field rig are procedural. Dedicated weapon animation, deeper bespoke questline and final visual/balance acceptance remain future work.

Review: authority and class access in server combat; validate mark ownership, range, cost, cooldown, rig expiry/death and no duplicate progression. Snapshot presentation has no authority over resource or targets. Automated tests added; hosted CI must pass on the resulting commit. Do not treat this as final artistic or game balance acceptance. Full integrated browser gate remains separate.
