# ATTUNEMENT — Development roadmap and delivery register

Owner direction, 2026-11-18. Baseline: main after audit PR #68. Read [Implementation audit](IMPLEMENTATION-AUDIT-2026-11-18.md), [Game concept](Attunement-Game-Concept.md), [AGENTS.md](../AGENTS.md), and [playtest validation](PLAYTEST-VALIDATION.md). This is the public, high-level execution register explicitly requested by the owner; private encounter scripts, undiscovered triggers, exact loot odds, unreleased assets and other sensitive production information are excluded. Status is evidence-based: **present** means source implementation exists, **partial** means unfinished/limited, **outstanding** means not complete, **branch only** means not integrated, **deferred** specifies sequencing, and **verify** requires current integrated evidence.

## 1. Objective and authority

Build a coherent, persistent MMORPG where character choices, exploration, combat, companions, loot, equipment, fabrication, vendors, quests and discoveries reinforce one another. Do not equate merged code, prototype mechanics or concept artwork with a finished player experience. Preserve existing functionality, saves, established lore and original art identity. The current priority is gameplay usability, interaction and systems coherence; broader content expansion follows that milestone, not the reverse.

Owner approval: routine development, push to focused topic branches, validation and merge are authorized once applicable Actions pass on the correct current integration result and no material warnings, errors or concerns remain. Use small, independently verifiable increments; never bypass validation, force-push shared history, fabricate evidence, waive real failures or publish unlicensed assets. A green test suite does not establish artistic quality, economy balance, performance or human play acceptance. Mark each separately. If blocked, retain a coherent checkpoint; diagnose before rerunning. Main is canonical.

## 2. Reconciliation and existing-system verification

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| INT-01 | Audit all branch heads, PRs, plans and integration status | Audit merged in #68; 70 original heads, 67 original PRs, ten non-ancestral heads | Reconcile deltas selectively, preserve history; avoid wholesale historical merges. |
| INT-02 | Pointer-lock steering, skitter readability, rig guard and capture | #66 draft, old head checks passed; needs current result | Fresh integrated checks; correct pending-lock failure, cancellation and release behavior; real-input browser coverage; distinguish visual review. |
| INT-03 | Recover isolated character appearance work | charlie/character-appearance, branch only | Inspect schema, saves, client/network, capture pipeline and conflicts; port validated increments, not obsolete tree. |
| INT-04 | Historical branch retention | Audit identifies eight further non-ancestral heads | Compare unique behavior/diffs and current tests; classify superseded, retained or genuinely missing. |
| INT-05 | Verify advanced fabrication/fusion and QL5 weapon progression | Present #53–56 | In-game acquisition/requirements, station and skill gating, irreversible costs, valid/invalid actions and persistence. |
| INT-06 | Verify metaphysical abilities | Partial; Keeper Phase Transposition only | Correct labels/availability, unlock visibility, authoritative cast and cost behavior. |
| INT-07 | Verify ground navigation and Survey Strider | Present/partial #57–58 | Follow/assist/stay, obstacle handling, ownership, deployment, dismissal, reconnect and real traversal. |
| INT-08 | Verify Phase Scar and Residual Traces NPC quests | Present but incomplete #60–62 | Real navigation, meaningful outcome, quest journal and reward consistency. |
| INT-09 | Verify layered VFX | Present #59/#62 | Real cast evidence, readability, motion settings, budget and cleanup. |
| INT-10 | Verify maintenance kits, Field Recovery and archival relics | Present #63–65/#67 | Acquisition/consumption, mastery, owner-isolated loot, replay/storage limits and persistence. |
| INT-11 | Verify player systems | Present/partial | Account/roster, party/minimap, companion sheet, combat/cover/corpse lifecycle, radio, vendor, inventory and journal; retain valid behavior. |

## 3. Milestone A — Gameplay usability and interaction (first)

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| UX-01 | Character glow and Seen acknowledgement | Partial; both top-level buttons currently share unread inventory flag | Character only reflects relevant equipment; hover/focus actual item records persistent Seen; no false glow for materials, no stale-sheet reappearance or cross-character leaks; genuinely new acquisition still glows. |
| UX-02 | F opens manual loot, next independent F Takes all | Outstanding | Current visible corpse session takes priority; held-key repeat does not collect; auto-loot and Shift+F manual override, individual choice, capacity, range and owner isolation remain. |
| UX-03 | Reusable panel/window manager | Outstanding | Move, resize with limits, lock/unlock, surface opacity independent of text, persisted position/size/preferences, restore defaults, viewport clamping, keyboard accessibility; begin Workshop, extend selectively. |
| UX-04 | Fabrication visibility | Partial | Accepted production closes Workshop; independent compact progress/cancel; failure leaves understandable UI; completion notification, no auto-reopen; preserve batch state. |
| UX-05 | Character ritual presentation | Partial | On confirmed inscription/installation/upgrade, unobstructed local character view; relevant panels dismiss/minimize, no remote-player effects altering local UI; cancellation/error intelligible; authoritative attributes/delta notification. |
| UX-06 | Listening Stone motion | Partial | Preserve angular integration and idle/proximity behavior; tune cast movement initially +25–35%, assess actual animation, reduced-motion and readability. |
| UX-07 | Explain equipment/attunement and metaphysical powers | Partial | Show class/ability prerequisites, acquisition sources and hotkeys without revealing undiscovered content. Clear distinction between general and profession-specific powers; no nonfunctional controls. |
| UX-08 | Kinetic coupler and material discoverability | Partial | Contextual Used in for known compatible recipes, quantity and requirements, direct Workshop navigation; no spoiler of undiscovered recipes; explain how to discover more. |
| UX-09 | Quest Journal rewards | Outstanding | Show authoritative player-visible rewards (XP, credits, items/materials/knowledge/unlocks where applicable) before turn-in and actual granted outcomes afterwards. Conditional/choice/unknown rewards labeled appropriately; no fictional rewards or spoilers; capped XP clearly distinguished; journal and NPC agree. |
| UX-10 | Interaction consistency and onboarding | Partial | Explain actual controls and next achievable goals in context; remove misleading placeholders or mark unavailable; identify and test quest-to-reward-to-equipment-to-combat loops. |
| UX-11 | Equipment navigation and notifications | Partial | Distinguish new equipment vs inventory; direct contextual actions, reversible UI settings, accessible focus and small-screen behavior. |
| UX-12 | Workshop/NPC material usage guidance | Outstanding | Crafting and research NPC introduction, first achievable recipe and station explanation; existing dialogue/quest system rather than competing tutorial framework. |

Milestone A exit: actual integrated browser evidence for acquisition/Seen, corpse loot, material-to-recipe navigation, crafting, ritual and quest-reward presentation. No regression of original controls, saves or authority. Confirm usability with human play when available; record limitations.

## 4. Milestone B — Systems coherence and meaningful gameplay

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| SYS-01 | Dedicated anatomical equipment placement | Partial, four authoritative slots | Define purposeful device, glyph, implant and weapon placement/compatibility; distinct installation methods and effects; multi-slot loadouts, migration of legacy saves, authoritative eligibility, dependency/cascade and removal tests. Avoid cosmetic-only fake slots. |
| SYS-02 | Recipe acquisition | Partial | Random recipe drops plus appropriate merchants/quests/research; persistent learned state, duplicate behavior, discovery-safe UI, server-only outcomes, no progression deadlocks. |
| SYS-03 | Credit loot and economy | Partial | Server-owned personal credit drops, caps, one-time collection, replay/ownership checks; tune buy prices against observed earning rate, repairs, crafting and consumable sinks; no arbitrary inflation, avoid impossible starter progression. |
| SYS-04 | Social clothing at vendor | Outstanding | Purchasable cosmetic inventory and actual equippable social slots, preview and clear price; visible model change, persistent independent cosmetic loadout with no unintended stat effects; validate ownership, costs, duplicates and legacy saves. |
| SYS-05 | Phase Scar meaningful purpose | Partial; hazard only | Communicate reason and goal; meaningful success and failure, progress/recovery or discovery even at level cap, authoritative lifecycle and reward integrity, no repeat exploitation. |
| SYS-06 | Traversable rift prototype | Proposed; defer broader expansion until coherence | Consider at least one rift that leads to a separate room, world or realm with monster encounters. A bounded encounter-space prototype first; explicit entry/exit/return, death/reconnect/party ownership, server-controlled spawn, rewards and cleanup, safe fallback. Do not claim an actual second universe from a cosmetic teleport. |
| SYS-07 | Metaphysical discovery | Partial | Discoverable abilities beyond a single class-specific addition; distinguish class abilities, glyph alterations and attunement-derived powers; reliable progression, visible requirements and coherent build choices. |
| SYS-08 | Improve Brine Surveyor | Partial | Assess play rhythm, meaningful actions, distinctive utility, companion interaction, encounter applicability and progression; improve actual experience rather than numerical reskin. |
| SYS-09 | Crafting professions and economy | Partial | Build from Engineering, Research and Field Recovery; useful recipes and materials, NPC introduction, progression and interplay; avoid duplicate crafting engines. |
| SYS-10 | Rewards/loot consistency | Partial | Connect quest, rare/very rare tokens, loot, vendors and fabrication; reward explanations, storage, fairness, replay and persistence; balance with actual gameplay. |

Milestone B exit: player can understand and use rewards, construct a differentiated build, discover meaningful content, gain/spend credits and complete a Phase Scar activity. Test cross-system authority and economic abuse cases; measure play balance, do not disclose hidden rates.

## 5. Milestone C — Identity and visual quality

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| ART-01 | Serious original science-fiction weapon families | Partial; current models not accepted | Use AO as visual reference only. Credible proportions, receivers/barrels/emitters, grips and mounts, material wear, class distinctions, QL variation and readable silhouette; no toy-like aesthetic. Inspect full model, equipped pose, motion, LOD, performance and provenance. |
| ART-02 | Race/body appearance recovery | Branch only | Review existing Colonist/Veyran/Mirekin schema, frames, face/skin/hair, headgear and save rules; correct clipping and detached hair; actual character creation and live network appearance. |
| ART-03 | Distinct race skeletons and faces | Deferred/partial | Distinct mature silhouettes and anatomy with animation/attachment compatibility; incremental rigging and verified live animation; not recolors or concept art presented as working models. |
| ART-04 | Class clothing and headgear | Partial | Weathered coherent material/shape language, social-vs-combat outfit separation, faces visible where appropriate, no clipping; preserve class readability. |
| ART-05 | Companion visual fidelity | Partial | Mender and Strider silhouette/material/motion; use proven rig pipeline; separate new species by actual mechanics. |
| ART-06 | VFX and environments | Partial | Preserve original authored libraries, layered effects, terrain/industrial kit, ecology and readability; validate in context not just asset previews. |
| ART-07 | Review prior 15 deliverables and 19 visual reviews | Present/partial | See art/ASSET-PRODUCTION-PLAN.md and art/reviews; verify actual in-game usage, not just file presence; reference archive remains incomplete. |
| ART-08 | Asset sourcing and licensing feasibility | Investigated; AO direct reuse blocked absent permission | See section 7. Prefer legally reusable donors and original adaptation; no ripped models. |

## 6. Milestone D — Expansion (deferred until coherence gate)

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| EXP-01 | Extend valley/world exploration | Deferred | New differentiated geography, objectives, enemy ecology, navigation and useful destinations; not empty acreage. |
| EXP-02 | Increase level cap to 20 | Deferred; cap 5 | Progressive XP curve, save migration, appropriate level-dependent encounters, equipment/rewards, progression pacing and endgame checks, not a constant-only edit. |
| EXP-03 | Skill trees and specialization | Deferred | Meaningful direction choice at 10; points at 12, 14, 16, 18; capstone at 20. Server-owned allocation, prerequisites, respec policy, clear tradeoffs, tests across classes. |
| EXP-04 | Additional playable class | Deferred | Distinct role/loop/resource, coherent lore, onboarding, gear, abilities, visual identity and balance; not a reskin. |
| EXP-05 | Further weapon quality and equipment | Deferred | QL progression and meaningful tradeoffs beyond current tiers; acquisition and appearance integration. |
| EXP-06 | Additional companion species including airborne | Deferred | Distinct utility, navigation/targetability/lifecycle, acquisition and commands, persistent collection; avoid power creep. |
| EXP-07 | Additional rifts and creatures | Deferred after SYS-05/06 | Reuse tested encounter architecture; meaningful variation and return safety, original creature assets. |
| EXP-08 | Expanded NPC quest chains and crafting/gathering | Deferred | Connected story and reward progression, diverse objectives and discoverable content. |
| EXP-09 | Broader MMORPG features | Concept-stage | Factions, reputation, guilds, social progression, player economy, dungeons/raids, PvP and long-term horizontal progression; establish necessity and viability for small populations first. |

## 7. Asset sourcing: Anarchy Online feasibility

Reviewed 2026-11-18. Technical existence of community resource-database/mesh tooling is not a license to redistribute Funcom content. [Project Rubi-Ka technical post](https://project-rk.com/posts/0005-its-tool-time/) describes work with RDB resources, textures and meshes; no tested, authorized export pipeline for Attunement was established. The [AO EULA on Steam](https://store.steampowered.com/eula/396280_eula_0) §§7–9 restricts software use, adaptation and distribution, retains IP ownership and restricts reverse engineering subject to applicable law. [Funcom Legal FAQs](https://www.funcom.com/legal/) describes limited revocable noncommercial fan use and requires written permission for commercial use of its IP. Free-to-play, old age, available client files, community viewers and open-source tools do not make models open assets. No affirmative license for third-party game incorporation was found. Do not retrieve, convert, distribute or publish AO models/textures/animations for this project absent explicit appropriate permission. Ask Funcom for a written license specifying asset families, adaptation, distribution, commercial use and public repository rights, if ever pursued; no contact has been made. This is a feasibility assessment, not legal advice.

Preferred route: existing recorded CC0 donors and independently designed industrial weapon assemblies; evaluate the official [Quaternius Sci-Fi Modular Gun Pack](https://quaternius.com/packs/scifimodularguns.html) (CC0) and [Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) (CC0) as potential building blocks, not finished art or downloads already integrated. For any selected donor verify exact archive license/provenance, file integrity and rig/scale/texture compatibility; record asset ledger, preserve required notices, build original silhouettes and material treatment, inspect at gameplay distance and in motion. Do not reproduce distinctive protected AO designs or use a community asset archive as licensing evidence.

## 8. Delivery process and acceptance

Inspect current main and AGENTS.md before work. One coherent batch per branch/PR, targeted regression tests plus existing applicable gate, fresh source/merge result, review of security/persistence/disclosure and data migrations as relevant. Use real browser interaction and representative visual evidence for UI/art. Track exact commit, PR, Actions links, result, limitations and owner-visible changed behavior. No need for repeated owner approval on passing routine changes. Do not merge a draft/stale result or silently weaken gates. No claim of automation continuing between sessions without a configured automation.

The implementation audit is a pinned historical snapshot; this roadmap is the living register. Update status only on evidence. Do not mark planned, candidate, tested, visually inspected and merged as interchangeable. Scope first to Milestone A and reconcile #66; work through Milestones B/C before expansive content D. Re-evaluate sequencing after actual play evidence; no automatic expansion merely because source compiles.
