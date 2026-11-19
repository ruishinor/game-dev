# ATTUNEMENT — Development roadmap and delivery register

Owner direction, 2026-11-18. Baseline: main after audit PR #68. Read [Implementation audit](IMPLEMENTATION-AUDIT-2026-11-18.md), [Game concept](Attunement-Game-Concept.md), [AGENTS.md](../AGENTS.md), and [playtest validation](PLAYTEST-VALIDATION.md). This is the public, high-level execution register explicitly requested by the owner; private encounter scripts, undiscovered triggers, exact loot odds, unreleased assets and other sensitive production information are excluded. Status is evidence-based: **present** means source implementation exists, **partial** means unfinished/limited, **outstanding** means not complete, **branch only** means not integrated, **deferred** specifies sequencing, and **verify** requires current integrated evidence.

## 1. Objective and authority

Build a coherent, persistent MMORPG where character choices, exploration, combat, companions, loot, equipment, fabrication, vendors, quests and discoveries reinforce one another. Do not equate merged code, prototype mechanics or concept artwork with a finished player experience. Preserve existing functionality, saves, established lore and original art identity. The current priority is gameplay usability, interaction and systems coherence; broader content expansion follows that milestone, not the reverse.

Owner approval: routine development, push to focused topic branches, validation and merge are authorized once applicable Actions pass on the correct current integration result and no material warnings, errors or concerns remain. Use small, independently verifiable increments; never bypass validation, force-push shared history, fabricate evidence, waive real failures or publish unlicensed assets. A green test suite does not establish artistic quality, economy balance, performance or human play acceptance. Mark each separately. If blocked, retain a coherent checkpoint; diagnose before rerunning. Main is canonical.

## 2. Reconciliation and existing-system verification

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| INT-01 | Audit all branch heads, PRs, plans and integration status | Audit merged in #68; 70 original heads, 67 original PRs, ten non-ancestral heads | Reconcile deltas selectively, preserve history; avoid wholesale historical merges. |
| INT-02 | Pointer-lock steering, skitter readability, rig guard and capture | Merged #66; verify human play and visual quality | Fresh integrated checks; correct pending-lock failure, cancellation and release behavior; real-input browser coverage; distinguish visual review. |
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
| UX-01 | Character glow and Seen acknowledgement | Implemented and automated integration passed #77; human play review remains | Character only reflects relevant equipment; hover/focus actual item records persistent Seen; no false glow for materials, no stale-sheet reappearance or cross-character leaks; genuinely new acquisition still glows. |
| UX-02 | F opens manual loot, next independent F Takes all | Implemented and automated integration passed #77 | Current visible corpse session takes priority; held-key repeat does not collect; auto-loot and Shift+F manual override, individual choice, capacity, range and owner isolation remain. |
| UX-03 | Reusable panel/window manager | Workshop implementation and integration passed #77; selective extension outstanding | Move, resize with limits, lock/unlock, surface opacity independent of text, persisted position/size/preferences, restore defaults, viewport clamping, keyboard accessibility; begin Workshop, extend selectively. |
| UX-04 | Fabrication visibility | Implemented visibility/cancel integration #77; human play review remains | Accepted production closes Workshop; independent compact progress/cancel; failure leaves understandable UI; completion notification, no auto-reopen; preserve batch state. |
| UX-05 | Character ritual presentation | Partial; local panel dismissal integrated #77; visual acceptance outstanding | On confirmed inscription/installation/upgrade, unobstructed local character view; relevant panels dismiss/minimize, no remote-player effects altering local UI; cancellation/error intelligible; authoritative attributes/delta notification. |
| UX-06 | Listening Stone motion | Cast motion tuned on #115; in-world review pending | Preserve angular integration and idle/proximity behavior; tune cast movement initially +25–35%, assess actual animation, reduced-motion and readability. |
| UX-07 | Explain equipment/attunement and metaphysical powers | Partial | Show class/ability prerequisites, acquisition sources and hotkeys without revealing undiscovered content. Clear distinction between general and profession-specific powers; no nonfunctional controls. |
| UX-08 | Kinetic coupler and material discoverability | Implemented contextual navigation and automated integration passed #77 | Contextual Used in for known compatible recipes, quantity and requirements, direct Workshop navigation; no spoiler of undiscovered recipes; explain how to discover more. |
| UX-09 | Quest Journal rewards | Listed rewards merged #71; actual grant history outstanding; XP-cap refresh candidate #81 | Show authoritative player-visible rewards (XP, credits, items/materials/knowledge/unlocks where applicable) before turn-in and actual granted outcomes afterwards. Conditional/choice/unknown rewards labeled appropriately; no fictional rewards or spoilers; capped XP clearly distinguished; journal and NPC agree. |
| UX-10 | Interaction consistency and onboarding | Partial; arrival hall and model comparison on #115 | Explain actual controls and next achievable goals in context; remove misleading placeholders or mark unavailable; identify and test quest-to-reward-to-equipment-to-combat loops. |
| UX-11 | Equipment navigation and notifications | Partial | Distinguish new equipment vs inventory; direct contextual actions, reversible UI settings, accessible focus and small-screen behavior. |
| UX-12 | Workshop/NPC material usage guidance | Branch only #78; integrated validation pending | Crafting and research NPC introduction, first achievable recipe and station explanation; existing dialogue/quest system rather than competing tutorial framework. |

Milestone A exit: actual integrated browser evidence for acquisition/Seen, corpse loot, material-to-recipe navigation, crafting, ritual and quest-reward presentation. No regression of original controls, saves or authority. Confirm usability with human play when available; record limitations.

## 4. Milestone B — Systems coherence and meaningful gameplay

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| SYS-01 | Dedicated anatomical equipment placement | Partial, four authoritative slots | Define purposeful device, glyph, implant and weapon placement/compatibility; distinct installation methods and effects; multi-slot loadouts, migration of legacy saves, authoritative eligibility, dependency/cascade and removal tests. Avoid cosmetic-only fake slots. |
| SYS-02 | Recipe acquisition | Partial | Random recipe drops plus appropriate merchants/quests/research; persistent learned state, duplicate behavior, discovery-safe UI, server-only outcomes, no progression deadlocks. |
| SYS-03 | Credit loot and economy | Partial | Server-owned personal credit drops, caps, one-time collection, replay/ownership checks; tune buy prices against observed earning rate, repairs, crafting and consumable sinks; no arbitrary inflation, avoid impossible starter progression. |
| SYS-04 | Social clothing at vendor | Outstanding | Purchasable cosmetic inventory and actual equippable social slots, preview and clear price; visible model change, persistent independent cosmetic loadout with no unintended stat effects; validate ownership, costs, duplicates and legacy saves. |
| SYS-05 | Phase Scar meaningful purpose | Traversable Annex and persistent reward on #115; browser and balance acceptance pending | Communicate reason and goal; meaningful success and failure, progress/recovery or discovery even at level cap, authoritative lifecycle and reward integrity, no repeat exploitation. |
| SYS-06 | Traversable rift prototype | Three chambers and return travel on #115; integrated browser acceptance pending | Consider at least one rift that leads to a separate room, world or realm with monster encounters. A bounded encounter-space prototype first; explicit entry/exit/return, death/reconnect/party ownership, server-controlled spawn, rewards and cleanup, safe fallback. Do not claim an actual second universe from a cosmetic teleport. |
| SYS-07 | Metaphysical discovery | Partial | Discoverable abilities beyond a single class-specific addition; distinguish class abilities, glyph alterations and attunement-derived powers; reliable progression, visible requirements and coherent build choices. |
| SYS-08 | Improve Brine Surveyor | Partial | Assess play rhythm, meaningful actions, distinctive utility, companion interaction, encounter applicability and progression; improve actual experience rather than numerical reskin. |
| SYS-09 | Crafting professions and economy | Partial; production XP and progression on #115, balance pending | Build from Engineering, Research and Field Recovery; useful recipes and materials, NPC introduction, progression and interplay; avoid duplicate crafting engines. |
| SYS-10 | Rewards/loot consistency | Partial | Connect quest, rare/very rare tokens, loot, vendors and fabrication; reward explanations, storage, fairness, replay and persistence; balance with actual gameplay. |

Milestone B exit: player can understand and use rewards, construct a differentiated build, discover meaningful content, gain/spend credits and complete a Phase Scar activity. Test cross-system authority and economic abuse cases; measure play balance, do not disclose hidden rates.

## 5. Milestone C — Identity and visual quality

| ID | Work | Baseline / status | Acceptance |
|---|---|---|---|
| ART-01 | Serious original science-fiction weapon families | Partial; current models not accepted | Use AO as visual reference only. Credible proportions, receivers/barrels/emitters, grips and mounts, material wear, class distinctions, QL variation and readable silhouette; no toy-like aesthetic. Inspect full model, equipped pose, motion, LOD, performance and provenance. |
| ART-02 | Race/body appearance recovery | #73 merged; body-frame comparison and durable in-world editing on #115, visual acceptance pending | Review existing Colonist/Veyran/Mirekin schema, frames, face/skin/hair, headgear and save rules; correct clipping and detached hair; actual character creation and live network appearance. |
| ART-03 | Distinct race skeletons and faces | Deferred/partial | Distinct mature silhouettes and anatomy with animation/attachment compatibility; incremental rigging and verified live animation; not recolors or concept art presented as working models. |
| ART-04 | Class clothing and headgear | Partial | Weathered coherent material/shape language, social-vs-combat outfit separation, faces visible where appropriate, no clipping; preserve class readability. |
| ART-05 | Companion visual fidelity | Partial | Mender and Strider silhouette/material/motion; use proven rig pipeline; separate new species by actual mechanics. |
| ART-06 | VFX and environments | Partial | Preserve original authored libraries, layered effects, terrain/industrial kit, ecology and readability; validate in context not just asset previews. |
| ART-07 | Review prior 15 deliverables and 19 visual reviews | Partial; 56 vector item portraits rendered for review, final in-context review pending | See art/ASSET-PRODUCTION-PLAN.md and art/reviews; verify actual in-game usage, not just file presence; reference archive remains incomplete. |
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


### Delivery checkpoint — 2026-11-18

- Canonical gameplay integration [#77](https://github.com/ruishinor/game-dev/pull/77), merge `bc6d0f5`, includes #70, #72, #75 and #76 through preserved ancestry. Eight hosted checks passed on `4e3a474`; Node 300, integrated browser 77/77, focused Workshop 12/12. [Playable preview run](https://github.com/ruishinor/game-dev/pull/77/checks) evidence is automated; no independent artistic or GPU assessment is asserted.
- Character fidelity #73 is merged. #78 Venn guidance, #79 expanded appearance, #80 calibration/reward and #81 XP-cap Journal refresh remain separate candidates pending fresh applicable validation against current gameplay. Test corrections retain gameplay assertions and authority; cancelled or superseded runs are not passes.
- Next: reconcile current candidate heads, diagnose failures and promote only the validated current trees. Then address actual reward receipts, equipment semantics and recipe acquisition before broader cosmetic/economic and encounter expansion. No new world instance or level-cap expansion is accepted at this checkpoint.

### Delivery checkpoint — 2026-11-19 (owner-directed expansion)

This checkpoint supersedes the previous expansion sequencing for the six explicitly authorized assignments, not their acceptance gates. Candidate status is not main/release status.

| Roadmap scope | Delivery | Status and outstanding gate |
|---|---|---|
| SYS-05/06, EXP-07 | [#109](https://github.com/ruishinor/game-dev/pull/109), based on #91 | Three connected Phase Annex areas, physical bulkheads and encounters. Candidate only. Node collision regression and Rift browser failure block promotion; verify wall/perimeter collision, party travel, return, death/reconnect and reward integrity. |
| UX-10, ART-06 | [#110](https://github.com/ruishinor/game-dev/pull/110) | Traversable arrival hall and optional persistent terminal orientation. Included in #115 candidate; Node passed individually, browser baseline failures and embedded asset classification require integrated validation. Full live character creation is not claimed. |
| INT-07, SYS-08, ART-05 | [#111](https://github.com/ruishinor/game-dev/pull/111), based on #101 | Original articulated runtime tripod; emergency screen, alongside learned target analysis. Candidate only. Ground-companion browser workflow failed in Spindle coverage. Reconcile shared companion changes without reverting existing main assets; original exported GLB, LOD and human visual acceptance still outstanding. |
| UX-04, SYS-09, ART-06 | [#105](https://github.com/ruishinor/game-dev/pull/105), [#112](https://github.com/ruishinor/game-dev/pull/112) | Physical workshop, moving machinery, work progress projection and character working poses. Included in #115. Node passed on #112; integrated browser, interruption, multi-user presentation and actual animation appearance need current-head acceptance. |
| ART-07, UX-11 | [#108](https://github.com/ruishinor/game-dev/pull/108), [#114](https://github.com/ruishinor/game-dev/pull/114) | 56 explicit vector illustrations and catalogue coverage checks. Included in #115. #108 passed its applicable checks; expanded catalogue needs integrated verification. Final rendered artwork remains outstanding. |
| INT-01/04, SYS-01 | [#106](https://github.com/ruishinor/game-dev/pull/106), [#115](https://github.com/ruishinor/game-dev/pull/115) | #106 merged as dbc4bb8 after six applicable checks passed. #115 draft combines artwork, fabrication and initiation while preserving main equipment changes; latest integrated candidate before this documentation commit a808dab. Dungeon, companion and earlier independent fixes are not yet reconciled. |

Integration order: diagnose the #109 collision failure and pre-existing Rift/Spindle browser failures; reconcile travel and companion authority with current main; incorporate earlier non-ancestral fixes (#99, #101, #102, #103 and relevant predecessors) only after inspecting overlapping changes; rerun applicable full gates on an exact non-draft merge candidate; conduct real visual/play review. Preserve all candidate branches until disposition is recorded. No broad release, final visual acceptance or unobserved test success is implied. Existing deferred expansion rows remain deferred unless specifically authorized.

### Reconciliation checkpoint — 2026-11-19

- #109 (`a8ef707`): existing Phase Scar is the entrance after calibration; separate exterior doorway removed. Three connected chambers, six encounter spawns, boss and one-time personal cache, persistent participation checks and safe return. Node and Rift browser checks passed on the independent candidate; playable preview failed separately. Shared region, not party-private instancing. Environment richness, encounter pacing and original creature assets remain incomplete.
- #110 (`a289a47`): physical arrival hall with terminal-based cosmetic appearance editing, server-owned validation, save persistence and nearby-player model updates. Node and Rift browser passed on the independent candidate. Not a fully isolated first-time creation sequence.
- #111 (`96206c7`): learned Strider, summon hotkey, original articulated runtime model, target scan with 15 Power Cells, emergency screen and commanded personal salvage recovery. Node, follow/inventory and quest journal passed on the independent candidate. Rendered-model acceptance and remaining browser coverage outstanding.
- #112: physical fabrication machine and work poses integrated; independent Node passed, vendor browser failed awaiting machine work, so integrated validation remains open. Profession-XP candidate #102 is separate.
- #114 (`7a7b00a`): explicit catalogue artwork with updated exact replacement-art browser assertion. Not final rendered thumbnails.
- #115: restored current-main companion/drone implementations and tests (`2468ee4`); integrated #110 (`cffc5fb`), #111 (`2a0a25d`), and selectively reconciled dungeon travel/rendering/persistence/tests (`71abaf7`) without importing unrelated weapon/clothing changes from the older branch. This checkpoint adds the current catalogue artwork assertion. Exact-head integrated gates and human gameplay review are still required. #99, #102, #103 and unrelated earlier branches must be separately reconciled; no merge or release is implied.

### Owner clarification checkpoint — 2026-11-19

- Main: #113 merged at `a0268ed` after six applicable workflows passed. Spindle tuning is reconciled into #115 without removing learned Strider coverage (`80942d4`).
- SYS-05/06, ART-06: #115 now implements 3/4/4 hostile spawns and ten collision-bearing rock/crystal formations in the Phase Annex. Lower ambient and artificial effects; cursor-following pointer tooltips with viewport clamping and keyboard focus behavior (`0d815d0`).
- SYS-09: reconciled #102 profession progression (`83104d2`): persistent Engineering/Research XP, awarded only on successful material-consuming cycles, level information and bounded production speed. Economy/play balance remains open.
- UX-10, ART-02: reconciled #97 live full-body/face creation preview (`52dfb63`), then physical arrival floor/arches and live terminal cosmetic preview with explicit authoritative Apply (`b89fe0f`). Not a mandatory isolated creation level. Existing server persistence and appearance validation retained.
- ART-07: original physical-object vector revision of 15 catalogue portraits, preserving all 56 identity mappings. Anarchy Online is visual reference only. Full-resolution 3D-rendered thumbnails and independent aesthetic approval remain open.
- Validation: on `b89fe0f`, Node and Rift browser passed; other runs were in progress at observation. Previous integrated browser assertion error (`A.evaluate` instead of `A.page.evaluate`) was corrected. This new revision requires fresh exact-head checks. #115 remains candidate-only until full applicable green validation and current main reconciliation. Other outstanding Partial rows, independent branch deltas and visual/play acceptance remain open.

### Preview gate reconciliation — 2026-11-19

- Candidate `a3c8282` passed seven of eight workflow jobs; preview run 44446284179 attempt 2 was cancelled at approximately the 12-minute job limit, after producing 36 evidence files. Attempt 1 logged functional PASS before cancellation; its exact cancellation cause is unconfirmed. Neither is a successful workflow. The functional preview job now has a bounded 25-minute job allowance and 20-minute test-step allowance, explicit stage/capture logging and separate browser/server shutdown logging; PASS is emitted only after both cleanup steps finish. No gameplay assertion or per-assertion timeout is relaxed. This is not a performance qualification.
- Reconcile main `f0a6527` (six commits including the Stillpoint production pipeline). All 18 upstream changed blob paths were unchanged on the candidate relative to their previous common main, allowing an ancestry-preserving merge with original binary asset blobs. Fresh applicable workflows must pass on the resulting exact head; previous checks are not release evidence. No independent artistic acceptance is implied.

### Vendor gate observation — 2026-11-19

- On `c703f32`, seven applicable jobs succeeded, including preview job 135430647366 (functional assertions, browser/server teardown, artifact upload). Vendor job 135430647522 timed out during observation of a normal 1100ms fabrication cycle. A missed transient in the software-rendered browser is a plausible test synchronization defect, not a proven gameplay cause.
- The vendor browser check now arms frame observation before submitting the real authenticated craft request and records both real scene-object working states. Software GL draws are temporarily paused using the existing inspection hook while networking, model updates and simulation continue; drawing resumes in cleanup. Inputs, outputs, transaction checks, normal duration and all other assertions remain unchanged; idle state and failure diagnostics are added. No authority, data exposure or runtime changes. Fresh exact-head validation is required; human visual acceptance is outstanding.

### Arrival and inventory follow-up — 2026-11-19

- UX-10 / ART-02: the Sanctum arrival hall has a marked editing bay and an aisle-facing orientation terminal. Character creation and the terminal can compare both full-body gameplay models at the same scale, outfit, and camera angle. The hall applies only validated cosmetic fields for the authenticated character and reports success after the server's atomic save. Failed writes restore the prior appearance and permit retry. Tests cover remote and combat rejection, nearby-player appearance metadata, write failure, and browser selection through on-disk save.
- ART-07: retained 56 original per-item vector illustrations. Revised ten with clearer physical silhouettes and construction details, including faceted prism housing, a hinged servo implant, an asymmetric phase damper and a fitted carbine. Reviewed a browser-rendered catalogue sheet. References: [Anarchy Online character creation](https://www.ao-universe.com/guides/classic-ao/gameplay-guides-6/character-creation), [original character creation flow](https://device.report/m/1f4dd17ae346cdbd3c4bb8391f9a059768560b95cd148ed039c288b9bd69cb97), [item families](https://ao-stonks.com/index.php/items).
- A private first-time playable creation sequence, sex/frame-independent race rigs, and a final in-context visual review remain open. The server continues to send only the established cosmetic metadata for nearby characters and the save result to the player who applied it.
- UX-06: the Listening Stone's cast contribution to angular speed is 30% stronger, measured against the proximity-only baseline. Angular integration preserves continuity, and reduced motion keeps proximity speed and hides existing waves. Cast readability still needs in-world review.
- Reconciled the earlier Kestrel alarm and presentation fixes from #103 and #99 into the candidate. The alarm exposes only local encounter status. Projectile trails start at the displayed emitter, hairstyle selection keeps the face exposed, and defeat recovery controls take priority over radio. The existing focus-aware tooltip behavior is retained.
