# P12 — Progression, Balance and Economy Integrity

**Source baseline:** `b0df1672d4ac8589c867cb1210600efbca51849d` (`main`, 2026-11-23, before this P12 branch).  
**Scope:** Character XP ladder, zone entry, representative enemies, class attack profiles, resource/crafting loops and merchant mechanics. This is a **source-backed model**, not instrumented player telemetry.  
**Work ownership:** P12. Combat input belongs to P04; security/persistence to P13; canonical roadmap to P03. This document records observed game state without changing other owners' files.

## Facts verified against the source baseline

- **Live character cap is level 15**, not the historical level-5 slice or proposed level-20 ambition. `XP_TO_NEXT[1..14]` totals **21,200 XP** for level 1 → 15. Milestones: level 5 = **1,150**, level 8 = **3,910**, level 12 = **11,510**, level 15 = **21,200** cumulative character XP. This excludes optional, post-cap, lost and unclaimed XP.
- The enforced zone entry thresholds are **Severance Expanse 5**, **Lumenfen 7** (also Resonance attunement), **Silent Foundry 8**, **Null Annex 12** (also personal Foundry Overseer progress). Region level bands are Expanse 5–12, Lumenfen 7–11, Foundry 8–11, Annex 13–15.
- Character levels, class skill points, equipment quality/eligibility, Resonance attunement, Engineering/Research discipline XP, Field Recovery rank and crafting recipes are **distinct systems**. Neither fabrication discipline reaches level 15: Engineering and Research each have a **10-level** track capped at **1,180 discipline XP**. Conflating these numbers leads to incorrect progression estimates.
- The seven starter directives award **350 total character XP** when all reward stages are completed (30 + 40 + 60 + 60 + 40 + 120; one stage grants only items). The optional Brineworks investigation + commissioning yields **90 XP** (35 + 55), and Residual Traces **55 XP**, for **495 combined fixed XP** across these authored lines. Some other sources and missions exist; 495 is not a game-wide quest-reward total.
- Standard vendor price examples: material mire fibre **8 credits**, sentinel alloy **12**, pulse housing **14**; the field maintenance kit sells for **12**. Ordinary sale items pay **2 credits** per mire husk and **3** per spent contact, with an additional **1 credit** from Sentinel/Turret Drone kills. No general material/equipment resale is implemented; buyback returns an item at the same price originally paid. Wallet cap is 1 billion credits, materials/goods normal stack cap 99.
- The authoritative recipe system preflights inputs, skill requirements, uniqueness, and stack capacity before a production-cycle commit. Free restore recipes consume their donor equipment and award no fabrication XP. Multiple economy mutation paths have focused tests; **this is not a comprehensive concurrency or persistence proof**.
- A 3% chance for an eligible class armour blueprint implies **33.3 expected eligible kills** per obtained blueprint under independent stationary rolls; the chance of at least one after 100 eligible kills is approximately **95.24%**. Four named class-armour blueprint sources are intentionally pending content, so current code cannot substantiate complete four-piece-set accessibility for every class. This is an unresolved content availability constraint, not a fabricated drop-rate bug.

## Modeled play paths (not observed completion times)

| Player path | Required character XP at milestone | Known gating / likely constraint |
|---|---:|---|
| New player 1 → 5 | 1,150 | Reach kills, directives, equipment and calibration; Phase Scar entry at 5 |
| Intermediate 5 → 8 | 2,760 additional | Expanse 5–12, Lumenfen at 7 with attunement; Foundry entry at 8 |
| Advanced 8 → 12 | 7,600 additional | Foundry 8–11 and upper Expanse; Null Breach requires personal Overseer progress |
| High level 12 → 15 | 9,690 additional | Null Annex 13–15; level-appropriate elite rewards and repeatable encounter XP |

These are XP thresholds, **not** encounter counts or time-to-level. Damage rotation, enemy uptime, encounter success, travel, player skill, group composition, recovery and live behavior are unmeasured. The four class innate attack profiles (raw damage per auto interval, excluding abilities, gear and defenses) are approximately Vanguard **5 DPS**, Symbiotech **2.5**, Keeper **3**, Surveyor **3.89**; each class's alternate innate melee/ranged mode has equal DPS to its own primary mode. Different class roles prevent interpreting these isolated figures as overall DPS ranks.

## Confirmed numerical disparity and scoped change

At the same enemy level, normalized *XP per 100 effective HP* (server XP formula / level-scaled max HP) showed a low reward for Lumenfen's Bog Stalker. Level-8 Bog Stalker had **205 HP and 64 XP**, or **31.2 XP / 100 HP**, compared with a level-8 Faultstalker (**255 HP / 131 XP**, **51.5 / 100 HP**) and Sentinel (**198 HP / 120 XP**, **60.7 / 100 HP**). The Bog Stalker lacks standard material, junk and credit awards; it is also an optional regional encounter. This does not establish actual time-to-kill, but it is a concrete unfavorable baseline for an enemy with an authored hostile attack.

**Scoped correction:** `ENEMIES.fen_stalker.xp` **64 → 100 (+56.25%)**. No other monster XP values, enemy HP, combat rules, item drops, stack caps, merchant prices or progression thresholds changed. Level-8 Bog Stalker is now **48.8 XP / 100 HP**, closer to Faultstalker yet still lower than Sentinel. This is a **modeled reward-normalization hypothesis** requiring real playtest verification.

| Bog Stalker level | XP before | XP after | XP/100 HP before → after |
|---|---:|---:|---:|
| 8 | 64 | 100 | 31.2 → 48.8 |
| 9 | 71 | 111 | 30.9 → 48.3 |
| 10 | 78 | 122 | 30.7 → 48.0 |
| 11 | 85 | 132 | 30.5 → 47.3 |

The level-11 elite's XP will increase proportionally while retaining its elite health/damage and existing no-ordinary-item drop contract. Actual quest completion, live spawn behavior, kill outcomes and performance must still be checked during a playtest.

## Regression approach and risk register

`test/progression-economy-integrity.test.js` codifies XP milestones, region gates, all-class innate-mode parity, Bog Stalker reward efficiency over levels 8–11, a real server-simulation kill with no ordinary loot, and non-free repeatable production inputs. Existing tests cover one-time corpse credit, wallet overflow, vendor quote replay/atomic commit, batch fabrication, and saved level-15 records.

Remaining risks:

1. **Balance model:** XP per HP ignores movement, enemy abilities, kill uptime, ranged reach, deaths, accessibility and group scaling. Measure completion rates, time-to-kill and real reward acceptance before additional number changes.
2. **Incomplete class-set availability:** Four blueprint sources are declared pending. Completion of all set bonuses remains blocked in the normal loot graph until content owners authorize sources; do not silently invent additional loot tables.
3. **Economy:** No empirical influx/outflow metrics, player trade market, sink analysis at population scale, or durable financial audit log are available. No evidence supports wholesale price or drop-rate changes yet.
4. **Persistence and transactions:** In-process server checks and existing tests do not establish crash-level atomicity, idempotency across restarts, or safe cross-process writes; P13 must own that review.
5. **Concurrent delivery:** This report is fixed to the baseline SHA. Recheck any overlapping changes on current `main` and the exact P12 PR head before merging; do not infer success from historical CI.

**Existing characters:** XP stored on characters, levels, discipline XP, inventory and persisted receipts are untouched. The sole proposed runtime change affects future Bog Stalker XP awards. No backfill, migration, retrospective XP or drop compensation is appropriate.
