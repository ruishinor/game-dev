# Attunement — integration and implementation audit

Snapshot: 2026-11-18; default branch `main`, baseline `aaaec8d557e5c3e62574919a2f943bfc242a805e`. This is a public-source inventory, not a release certification, a new content roadmap, or disclosure of unpublished mechanics. The repository's standing [review rules](../AGENTS.md) apply.

## Evidence and reconciliation

At the baseline GitHub listed 70 branch heads and 67 PRs (57 merged, 9 closed without a direct merge, 1 open). The complete baseline commit listing had 362 unique commits (100 + 100 + 100 + 62, followed by empty pages). 60 branch heads were in this ancestry. The ten other heads were compared individually against the baseline. A merge record or ancestor establishes history, not necessarily retention of every behavior: subsequent replacement, regressions, and usability gaps remain possible. This branch creates documentation only.

| Non-ancestral head | Ahead / behind main | Disposition |
| --- | ---: | --- |
| ccr-9a6736d4-kufz9x | 6 / 20 | PR [#66](https://github.com/ruishinor/game-dev/pull/66), draft; fresh composite validation required. |
| charlie/character-appearance | 9 / 172 | Unmerged appearance schema/renderer and capture work; known visual issues; [handoff](https://github.com/ruishinor/game-dev/blob/charlie/character-appearance/docs/art/CHARACTER-APPEARANCE-HANDOFF.md). |
| docs/playable-slice-handoff | 1 / 355 | Earlier merged PR #43; superseded documentation, no blind merge. |
| feat/brine-evidence-instruments | 3 / 118 | Earlier merged PR #25; validate retained model/test behavior if porting. |
| feat/gltf-reference-scene | 1 / 83 | Closed unmerged #44; follow-up #45/#48; compare remaining changes, not a blanket merge. |
| feat/item-artwork-refinement | 1 / 119 | Earlier merged PR #29; check current artwork before porting. |
| feat/player-combat-controls-companion-inspect | 21 / 354 | Earlier merged #2; obsolete base; check omissions against current behavior. |
| fix/combat-entity-lifecycle-recovery | 12 / 355 | Earlier merged #1; validate current lifecycle instead of restoring old tree. |
| fix/corpse-presence-visual-readability | 8 / 353 | Earlier merged #3; current loot/presentation differs. |
| preview/playtest-pr4-5-6 | 5 / 151 | Earlier integration; unique delta confined to policy, documentation and ignore files. |

Closed without individual merge: #20, #21, #22, #23, #24, #26, #28, #37 are ancestors of main. #44 is the remaining non-ancestral closed-unmerged head. #67 reconciliation source commit `8432950` had eight successful hosted checks (Node, playtest, focused, journal, playable, vendor, companion, rift); the initial consolidation retained its identical tree. The current baseline additionally changes CI configuration and handoff text. No fresh check runs were returned on the baseline SHA. #66 had seven successful hosted checks on its own head `52781b3`, not on the current combined result. The active default-branch ruleset must not be bypassed.

## Feature inventory

States: **present** = implementation or current source/test evidence identified; **partial** = bounded prototype, unfinished behavior, or presentation gap; **branch only** = not integrated; **not present** = inspected implementation lacks the stated capability; **unverified** = no sufficient current evidence. Test-file presence is not a test result. Visual quality and human gameplay acceptance are separate from automated correctness.

| Feature or plan | Current state | Evidence / remaining limitation |
| --- | --- | --- |
| Core persistent character and authoritative multiplayer simulation | Present | server/store.js, server/net.js, server/sim/game.js; local prototype, not deployment validation. |
| Account login, character roster and legacy recovery | Present | #5/#8/#10; current store/net; fresh security and legacy migration tests not run in this audit. |
| Third-person movement, follow, camera and targeting | Partial | #1–4/#11/#49; current input.js; draft #66 fixes pointer-lock interruption. |
| Combat lifecycle, enemy respawns, corpses | Present | #1/#3/#30; current loot.js, recovery-visuals.js, sim tests; old branch deltas require targeted retention checks. |
| Auto attack, combat facing, cover and line of sight | Present | #2/#4; docs/art/BRINEWORKS-COMMISSIONING.md; conservative horizontal occlusion, not full vertical LOS. |
| Inventory, settings, party and companion naming | Present | #6/#8/#11/#67; current UI and party modules. |
| Personal corpse loot and manual/auto preferences | Present | #18/#20/#21, loot.js, loot-ui.js; F while loot is open does not Take all. |
| Seen state | Partial | #28/#67, inventory-seen.js, journal-ui.js; item focus/hover acknowledges, both top-level buttons mark all unread types. |
| Wallet, stackable loot, vendor, repairs | Present | #20–23/#37/#42, wallet.js, goods.js, vendor.js; credits not corpse-loot entries. |
| Inventory opacity, equipment sheet and body-slot presentation | Partial | #9/#16/#28/#67, ui.js/journal-ui.js; many paperdoll slots are visual placeholders; only four real slots. |
| Quest journal and tracking | Present | #24/#26/#42, quest-journal-ui.js, quest-tracker-ui.js; objective history/selection foundations. |
| NPC dialogue and portraits | Present | #15/#17, npc-interaction.js. |
| Workshop, planner, recipe filters, batch production | Partial | #9/#67, workshop-ui.js, production.js, docs/WORKSHOP.md; no integrated window management; production replaces window contents rather than leaving them closed. |
| Timed glyph inscription and attribute deltas | Present / UX partial | #67, ui.js, main.js ritual event; obstructing panels can remain visible. |
| Resonance attunement and glyph/implant coupling | Present / limited | shared/content.js, build.js, docs/art/GLYPH-COUPLING.md; single attunement and generic slots. |
| Aegis Keeper | Present / prototype | docs/art/KEEPER-PROFESSION.md; independent barrier role, final balance/animation not established. |
| Brine Surveyor | Present / prototype | docs/art/BRINE-SURVEYOR-PROFESSION.md; mark/bore/rig/blast, limited bespoke progression and dedicated animation. |
| Kinetic Vanguard and Symbiotech Conductor | Present | shared/content.js, current combat and companion modules. |
| Phase Transposition and larger hotbar | Present / class-specific | #55/#56, shared/content.js; Keeper slot 5; not general metaphysical unlock system. |
| Advanced fabrication and fusion | Present | #53/#56, shared/crafting.js, bloom-relay/fusion tests; site, skill, equipment and material dependencies. |
| QL5 damage and precision specialization | Present | #54/#56, shared/content.js and shared/crafting.js; QL1/3/5 and condition; visuals not validated. |
| Ground companion navigation | Present / bounded | #57, ground-navigation.js; separate navigation tests, no broad species/combat expansion. |
| Survey Strider | Present / prototype | #58, docs/art/SURVEY-STRIDER.md; Surveyor-specific fabricated link; utility analysis only, no targetability/defensive role. |
| Mender, companion management and support | Present / partial | #39/#67; companion.js, mender-prototype.js; opt-in original appearance and bounded companion system. |
| Multiple freely configurable companion species and configurations | Partial / unverified | Existing Mender and Strider; concept's wider system not established. |
| Phase Scar | Partial | #60/#62, rift.js, docs/art/PHASE-SCAR.md; timed anomaly with no reward, traversal or new creature. |
| Residual Traces branching quests | Present | #61/#62, field-quests.js, docs/RESIDUAL-TRACES.md; reward material usefulness is poorly exposed. |
| Field maintenance kits | Present | #63, utility.js, crafting.js, field-maintenance tests. |
| Field Recovery and maintenance reconditioning | Present / small discipline | #64/#67, recovery.js; two-rank mastery and recipes, not broad profession system. |
| Rare archival relics | Present | #65/#67, loot-tables.js; server-side reward implementation; no hidden rates reproduced. |
| Recipe acquisition | Partial | shared/crafting.js; current knowledge gates via commissioning/mastery, not random corpse recipe discovery. |
| Kinetic coupler and culture matrix | Present / UX partial | shared/crafting.js, field-quests.js; recipe dependencies exist, material-to-recipe guidance limited. |
| Brineworks evidence, commissioning, engineering/research | Present / bounded | #10/#25/#31; docs/art/BRINEWORKS-COMMISSIONING.md; current site rules and route-specific trial; not full profession economy. |
| Kestrel Deep and containment encounter | Present / bounded | #19, related docs, containment and Kestrel tests. |
| Sinter ecology, flora, mineral deposits and wildlife | Present / partial | #7/#36/#38, habitat/colony/sampling/hunting tests; breadth and variety not final. |
| Prerecorded radio HUD and approved library | Present | #11/#14; radio client, voice credits; review audio provenance before new distributions. |
| Improved Sanctum/Sporefield, grounded foothill props | Present / visual acceptance open | #13/#44–49, scene/test evidence; no claim of final fidelity. |
| Derelict relay, industrial storage, pressure plant, pipework, signage | Present | #25/#27/#31–35/#40/#46; corresponding modules and tests. |
| Original item artwork and profession equipment | Present / visual acceptance open | #29/#34/#46, item-artwork.js/gear-recipes.js; old branch differences not presumed missing. |
| VFX engine, signature gear, Listening Stone, field rig | Present / further tuning | #12, docs/art/VFX-ENGINE-HANDOFF.md; no claim of benchmark reached. |
| Layered Discharge/Aegis | Present | #59/#62, combat VFX and timeline tests; visual acceptance open. |
| Pointer-lock steering and Skitter readability, capture fixes | Branch only | #66 remains draft. Fresh integrated tests and actual browser inspection required. |
| Appearance schema and facial/hair renderer | Branch only | charlie/character-appearance; separate race/skin/frame/hair prototype; clipping and outfit fidelity unresolved. |
| Level progression beyond 5 | Not present | shared/content.js exports MAX_LEVEL = 5; no level 10–20 content gate established. |
| Allocatable skill points, talent/perk trees | Not present in inspected character system | shared/content.js and ui.js; automatic primary skill increments and gear modifiers, no allocatable tree. |
| Multiple race-specific skeletons and final faces | Branch only / concept | current looks are cosmetic; appearance branch has two body frames and procedural head/hair, not distinct final racial rigs. |
| Full character origin/customization | Concept / partial | docs/Attunement-Game-Concept.md; appearance branch not integrated. |
| Further attunements and discoverable powers | Concept / partial | one Resonance attunement and class-specific effects; no broad discovery system established. |
| Distinct anatomical augments and multi-slot glyph loadouts | Concept / partial | four authoritative slots; placeholder paperdoll slots do not grant gameplay. |
| Extended skill allocation, build perks, weapon proficiencies | Concept / partial | current three skills and equipment requirements; no comprehensive specialization system established. |
| Exploration and quest-world breadth | Concept / partial | Sanctum/Sporefield, Brineworks, Sinter and Kestrel; larger world expansion not established. |
| Guilds, faction relationships and PvP | Concept / unverified | game concept §§10/13; not established by inspected branch/PR inventory. |
| Player economy and trade | Concept / partial | NPC vendor and personal wallet; player market/trade not established. |
| Solo/group dungeon and raid progression | Concept / partial | bounded shared-world encounters; scalable raid system not established. |
| Long-term horizontal progression and identity | Concept / partial | glyphs, attunement, gear, recovery and relics; no broad endgame established. |

## Earlier public asset plan

The [15-deliverable plan](art/ASSET-PRODUCTION-PLAN.md) has corresponding review files 01–15 in [art/reviews](art/reviews/); the reviews establish recipe/asset work, not universal in-game integration, human acceptance or benchmark fidelity. 01 backpack, 02 capacitor, 03 gauntlet, 04 cranial interface, 05 reservoir, 06 atlas, 07 glyph symbols, 08 Aegis, 09 kinetic/resonance, 10 restoration, 11 Mender, 12 resonance tower, 13 workstation, 14 crystallogenic colony, 15 fungi/Nodules. Follow-up reviews 16–19 cover VFX engine, signature gear, Listening Stone/rig and layered combat effects. The [reference archive status](art/REFERENCE-ARCHIVE-STATUS.md) explicitly says the original 218-section text is incomplete and the original image archive was not uploaded. Do not claim complete recovery or visual acceptance.

## Verification boundary

All branch refs and PR metadata were inventoried. Direct ancestry was established at the pinned baseline, with the ten exceptions individually compared. Implementation evidence is selective source inspection and existing public documents/tests; this is not a line-by-line review of every historical commit. A local checkout and fresh Node/browser execution were not available during this audit. No gameplay changes, new unreleased content, or merge approval is represented by this document. No branch is deleted or force-updated. Future promotion must use fresh integrated checks; do not equate previous branch checks or a green merge record with human playtest acceptance.
