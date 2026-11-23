# Attunement — canonical delivery and requirements evidence register

**Baseline:** [`b0df1672d4ac8589c867cb1210600efbca51849d`](https://github.com/ruishinor/game-dev/commit/b0df1672d4ac8589c867cb1210600efbca51849d), inspected 2026-11-23. Status is **as of this fixed commit**. This document is the current operational index; historical plans remain primary evidence of intent, **not** up-to-date status authorities. Changes merged after this SHA require a new, explicit evidence row or revision.

**Decision order:** (1) latest owner-approved [AGENTS.md](../AGENTS.md) and explicit owner decisions; (2) observed current-main implementation and current exact-head tests; (3) current PR/issue records; (4) older committed plans/handoffs, preserved as dated snapshots; (5) speculation, which is not an acceptance basis.

**Status codes:** I implemented (bounded functionality exists; not necessarily accepted); P partially implemented (scope or proof incomplete); U unverified (insufficient current evidence); B blocked (specific unresolved gate); S superseded (prior requirement displaced by explicit later decision); D deferred (approved idea, not current deliverable); N not started (no delivery evidence). A category of P/U is intentional where source exists but required integration, balance, live evidence or acceptance is absent. Status is independent of the four assurance axes.

**Separate assurance axes:** **C** = code on pinned main (yes / partial / unknown / no); **T** = automated validation (source = relevant committed test exists, **not** proof it passed at this baseline; unknown = not established; n/a = not applicable); **V** = product-specific visual assessment (owner-scoped means an explicit narrow owner acceptance was recorded; rejected-interior/player means explicit rejection of that subset; unknown = not reviewed; n/a = not visual); **A** = full requirement/product acceptance (no = not proven). Neither merged PR metadata nor test-file presence proves end-to-end function, visual quality, acceptance, or production readiness. No baseline-head workflow runs or check-runs were returned by the inspected GitHub API requests; no claim of baseline CI PASS is made.

The evidence column cites GitHub PR numbers, paths on the pinned tree, or historical plans. A `#N` link is GitHub's issue/PR reference. Verify claim-specific source and run logs before raising `T` to **pass@SHA**. Do not copy hidden reward algorithms, unpublished mechanics, or privileged server material into this public register.


## Decision corrections and active constraints

- **Level caps:** `shared/content.js` on the pinned main defines `MAX_LEVEL = 15`; `test/level-fifteen.test.js` and `test/regional-progression.test.js` cover foundations, regional gates and earned XP. Historical `MAX_LEVEL=5` statements in the 2026-11-20/21 checkpoints are **dated, superseded status**, not present facts. `EXP-02` / `EXP-10` level **20** and a capstone/specialization tree remain **deferred**. Attunement affinity, crafting profession and character XP level are distinct systems. A complete naturally played level 1→15 journey and balance sign-off are **not established** by these source checks.
- **Regional ownership:** `AGENTS.md` 2026-11-22 supersedes Claude-only Expanse/Foundry isolation. Authorized workers can coordinate there after checking live overlapping branches and preserving accepted designs. Other genuinely assigned per-file exclusivity is not automatically cancelled.
- **Asset origin:** no GLB/procedural/manual/archive-origin test, publication or merge veto solely because of origin, and no fabricated blanket license hold. Evaluate real quality, integrity, provenance and evidenced rights conflicts. `AGENTS.md` supersedes older notes; #272 implemented an origin-gate correction. No exemption from security or meaningful visual review.
- **Rifts:** owner approval of the exterior Phase Scar/Severance *construction* is scoped and does not cover missing exterior ground VFX or rejected interior/Null Annex thresholds. #273 and #274 are merged reconstruction increments, not full acceptance.
- **Armour:** #214 records scoped owner acceptance of four rare armour families and revised Halo vendor presentation. This does **not** erase previously reported Cinderlock mesh-fit results, performance budgets or general in-game acceptance. Preserve 2026-11-20 technical reservations and 2026-11-21 owner art approval as different statements.
- **PR state (historical snapshot at baseline, 2026-11-23 ~01:26 UTC):** the five then-open PRs were #91, #92, #93, #96 and #228. **Follow-on update:** #91/#92/#93/#96 were subsequently closed as superseded **without merging**; #228 remained open against a non-main branch at the later 08:08 UTC checkpoint. New parallel PRs now exist, and [P03 #312](https://github.com/ruishinor/game-dev/pull/312) remains an open documentation PR; see the dated current-main checkpoint below. Do not present #180, #193, #196, #198, #236, #273, #293, #299 or #302 as still open. Closure of an old recovery PR is not integration evidence.
- **Scope/acceptance:** desktop/TV are supported design targets. Open issues #185, #251, #265, #266, #271, #278, #294 and #298 document specific outstanding defects/acceptance or test/performance work. `main` is not a release certification.

## Requirement-to-evidence matrix

All existing plan IDs remain stable. The following preserves original identifiers, including those older plans marked provisional. IDs should not be renumbered when their implementation changes. Use **a separate row** for any new contractual requirement, and `Supersedes:` links to retired IDs when necessary.

### Integration and existing systems

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| INT-01 | Branch and PR audit | partially implemented | yes | source | unknown | no | #68; historical inventory incomplete at this baseline |
| INT-02 | Pointer lock, skitter, capture | partially implemented | yes | source | unknown | no | #66; docs/PLAYTEST-VALIDATION.md |
| INT-03 | Appearance recovery | partially implemented | yes | source | unknown | no | shared/appearance.js; #209; visual gaps #185 |
| INT-04 | Legacy branch retention and delta disposition | partially implemented | partial | unknown | n/a | no | #91/#92/#93/#96 closed unmerged as superseded 2026-11-23; #228 remains open; #315 preserves unresolved old blueprint-source choice |
| INT-05 | Advanced fabrication and weapon quality | partially implemented | yes | source | unknown | no | #285; test/weapon-assembly-graph.test.js |
| INT-06 | Metaphysical abilities | partially implemented | partial | unknown | unknown | no | docs/DEVELOPMENT-ROADMAP.md §2; full casts not checked |
| INT-07 | Strider and ground navigation | partially implemented | yes | source | unknown | no | server/sim/companion.js; test/companion-transit.test.js |
| INT-08 | Phase Scar and NPC quest line | partially implemented | yes | source | unknown | no | server/sim/rift.js; test/rift.test.js; test/quest-log.test.js |
| INT-09 | Layered VFX | partially implemented | yes | source | unknown | no | docs/art/VFX-ENGINE-HANDOFF.md; test/armour-fx.test.js |
| INT-10 | Maintenance, field recovery, relics | partially implemented | yes | source | unknown | no | docs/art/FIELD-RECOVERY.md; end-to-end economy unverified |
| INT-11 | Account/party/companion/combat/quest system integrity | partially implemented | yes | source | unknown | no | test/e2e/play.mjs; #265/#266/#298 remain open |

### Player experience

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| UX-01 | Seen/new equipment acknowledgement | implemented | yes | source | unknown | no | #77; older focused coverage; current regression unknown |
| UX-02 | Two-step F loot operation | implemented | yes | source | unknown | no | #77; current exact-head browser run unconfirmed |
| UX-03 | Managed gameplay windows | partially implemented | yes | source | unknown | no | #129/#262; test/e2e/desktop-windows.mjs |
| UX-04 | Fabrication visibility/cancel | partially implemented | yes | source | unknown | no | docs/WORKSHOP.md; test/live-fabricator.test.js |
| UX-05 | In-world character ritual | partially implemented | partial | unknown | unknown | no | roadmap milestone A; actual visual experience pending |
| UX-06 | Listening Stone movement | partially implemented | yes | source | unknown | no | #115; real animation judgment pending |
| UX-07 | Equipment and ability explanation | partially implemented | partial | unknown | unknown | no | docs/DEVELOPMENT-ROADMAP.md §3 |
| UX-08 | Material used-in discovery | implemented | yes | source | unknown | no | #77; current behavioral retest not independently executed |
| UX-09 | Quest rewards and receipts | partially implemented | yes | source | unknown | no | #71; test/quest-tracking.test.js; grant receipts incomplete |
| UX-10 | Interaction consistency and onboarding | partially implemented | partial | source | unknown | no | #115; test/e2e/initiation.mjs |
| UX-11 | Equipment navigation and notifications | partially implemented | partial | source | unknown | no | #235/#238; full slot audit outstanding |
| UX-12 | Workshop/NPC tutorial | unverified | unknown | unknown | unknown | no | historical #78 branch-only; current equivalent not verified |

### Systems, equipment and gameplay

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| SYS-01 | Purposeful anatomical equipment | partially implemented | yes | source | unknown | no | #119/#238; test/armor-set-integration.test.js |
| SYS-02 | Recipe discovery and acquisition | partially implemented | yes | source | unknown | no | test/weapon-assembly-recipes.test.js; full sources unknown |
| SYS-03 | Credits, loot and economy balance | partially implemented | yes | source | unknown | no | server/sim/loot.js; economy balancing unverified |
| SYS-04 | Purchasable social clothing | partially implemented | yes | source | unknown | no | #142; test/social-clothing.test.js |
| SYS-05 | Phase Scar progression meaning | partially implemented | yes | source | unknown | no | #217; test/regional-progression.test.js |
| SYS-06 | Traversable encounter rift | partially implemented | yes | source | rejected-interior | no | #273; test/rift-annex.test.js; interior visual quality rejected |
| SYS-07 | Broader metaphysical discovery | partially implemented | partial | unknown | unknown | no | roadmap §4; no integrated breadth proof |
| SYS-08 | Distinct Surveyor play loop | partially implemented | partial | unknown | unknown | no | #111; balance not verified |
| SYS-09 | Craft professions / interplay | partially implemented | yes | source | unknown | no | docs/WORKSHOP.md; test/crafting-disciplines.test.js |
| SYS-10 | Cross-system reward consistency | partially implemented | partial | unknown | unknown | no | server/sim/loot.js; replay/economy journey not certified |
| EQ-01 | Independent equipped melee/ranged weapons | partially implemented | yes | source | unknown | no | #238; shared/weapons.js; test/weapon-selection.test.js |
| EQ-02 | Every displayed equipment slot functional | partially implemented | partial | source | unknown | no | #119; test/armor-set-integration.test.js; unimplemented slots not ruled out |
| EQ-03 | Weapon switching/hotbar interactions | partially implemented | yes | source | unknown | no | #267/#286; test/e2e/weapon-switch.mjs; #266 flake open |
| EQ-04 | Consistent QL and rarity taxonomy | partially implemented | partial | unknown | unknown | no | shared/content.js; full item and view audit missing |
| EQ-05 | Implant slot/upgrade progression | partially implemented | partial | unknown | unknown | no | docs/art/GLYPH-COUPLING.md; complete multi-tier journey unverified |
| EQ-06 | Glyph discovery and alternative modifications | partially implemented | partial | unknown | unknown | no | docs/DEVELOPMENT-ROADMAP.md §9 |
| EQ-07 | Social and utility gear | partially implemented | yes | source | unknown | no | #142; test/social-clothing.test.js; utility coverage incomplete |
| EQ-08 | Four rare class armour set systems | partially implemented | yes | source | owner-scoped | no | #119/#156/#211/#214; test/class-armour-acquisition.test.js; fit/LOD unresolved |
| EQ-09 | Modular fabrication/acquisition chain | partially implemented | yes | source | unknown | no | #285; test/weapon-assembly-graph.test.js; old #93 still open |
| CB-01 | Weapon-specific attack/animation/VFX | partially implemented | yes | source | unknown | no | #259/#260/#290; tests/player-weapon-presentation.test.js |
| CB-02 | Class/weapon/attunement specializations | partially implemented | partial | unknown | unknown | no | test/weapon-specialization.test.js; full progression not shown |
| DEL-01 | Independent delivery reconciliation | partially implemented | yes | unknown | n/a | no | Baseline had five open #91/#92/#93/#96/#228; four are now closed unmerged; #228 remains, and P03 #312 requires CI reconciliation |
| DEL-02 | Four-class energized rod VFX | partially implemented | yes | source | unknown | no | #264/#293; test/e2e/rod-live-vfx.mjs |
| DEL-03 | Desktop window management and fit | partially implemented | yes | source | unknown | no | #262; test/e2e/desktop-windows.mjs; TV inspection outstanding |
| DEL-04 | Natural Stillpoint movement | unverified | unknown | unknown | unknown | no | #133 historical claim; recent natural movement evidence not inspected |
| REC-01 | Recover unique modular weapon chain | partially implemented | yes | source | unknown | no | #285 merged assembly graph; old #93 closed as superseded, but distinct blueprint-source design decision tracked by #315 |
| REC-02 | Sustained fabrication and animations | partially implemented | yes | source | unknown | no | docs/art/LIVE-FABRICATOR.md; no visual sign-off |
| REC-03 | Replace spherical ranged VFX | partially implemented | yes | source | unknown | no | #290; owner screenshot quality acceptance not established |
| REC-04 | Family-specific recoil/grip and carry | partially implemented | yes | source | unknown | no | #268/#290; test/player-weapon-presentation.test.js |
| REC-05 | Hand-origin class casting | unverified | unknown | unknown | unknown | no | roadmap §10; no all-class live capture established |
| REC-06 | Retire legacy stacks only after delta comparison | partially implemented | partial | unknown | n/a | no | #91/#92/#93/#96 now closed unmerged; #315 remains as explicit residual; #228 still open against obsolete non-main base |

### Narrative, region and progression

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| NAR-01 | Six-quest playable chapter | unverified | unknown | source | unknown | no | server/sim/field-quests.js; six substantive completed journeys not proven |
| NAR-02 | Severance expedition narrative | partially implemented | yes | source | unknown | no | #139/#284; quests/pacing remain open |
| NAR-03 | Foundry narrative and dungeon | partially implemented | yes | source | rejected-interior | no | #273/#279; functional delivery not visual acceptance |
| NAR-04 | Long-term branching narrative | not started | no | unknown | n/a | no | concept direction; no committed end-to-end evidence |
| NAR-05 | Optional and replayable side content | partially implemented | partial | unknown | unknown | no | server/sim/field-quests.js; breadth unverified |
| WORLD-01 | Severance Expanse full region | partially implemented | yes | source | unknown | no | #139/#219/#284; quality and journeys open |
| WORLD-02 | Differentiated dungeon ecology | partially implemented | yes | source | rejected-interior | no | #273; test/rift-annex.test.js; owner visual acceptance open |
| WORLD-03 | Reach and Sanctum upgrade | partially implemented | yes | source | unknown | no | #203/#243/#258; actual in-world review open |
| PROG-15 | Attainable character progression through level 15 | partially implemented | yes | source | unknown | no | shared/content.js MAX_LEVEL=15; #196/#217; test/level-fifteen.test.js; no full journey proof |
| EXP-01 | Expanded world exploration | partially implemented | yes | source | unknown | no | #236/#275/#280; Lumenfen integrated; not expansion-finished |
| EXP-02 | Level 20 cap | deferred | no | n/a | n/a | no | current MAX_LEVEL=15, not 20; roadmap §6 |
| EXP-03 | Specialization and level-20 capstone | deferred | no | n/a | n/a | no | roadmap §6; no completed tree |
| EXP-04 | Additional playable class | deferred | no | n/a | n/a | no | roadmap §6 |
| EXP-05 | Higher quality-tier weapons and gear | partially implemented | partial | source | unknown | no | #285; #228 unmerged for two weapon families |
| EXP-06 | More companion species including flying | deferred | partial | unknown | unknown | no | ground companions exist; airborne expansion not established |
| EXP-07 | Additional rifts and creatures | partially implemented | yes | source | unknown | no | #236/#274; current world source; quality open |
| EXP-08 | Extended quest chains and gathering | deferred | partial | unknown | unknown | no | roadmap §6; end-to-end chains not established |
| EXP-09 | Broader MMORPG social/economic/PvP | deferred | no | n/a | n/a | no | concept only, no broad delivery claim |
| EXP-10 | Broader 20-level progression architecture | deferred | no | n/a | n/a | no | current cap 15; roadmap §9 |
| EXP-11 | Additional races/classes/companions | partially implemented | yes | source | unknown | no | #209 race foundation; no new playable class |
| EXP-12 | Large-scale MMO expansion | deferred | no | n/a | n/a | no | concept only; preserve small-population viability |

### Visual art, production and source policy

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| ART-01 | Original credible weapon families | partially implemented | yes | source | unknown | no | #246/#290; #228 still unmerged |
| ART-02 | Race/body appearance recovery | partially implemented | yes | source | rejected-player | no | #209; shared/appearance.js; #185 open |
| ART-03 | Distinct playable race anatomy and rigs | partially implemented | partial | unknown | rejected-player | no | #249/#251; not full distinct validated rig suite |
| ART-04 | Class outfit/headgear fidelity | partially implemented | yes | source | unknown | no | #211; #185 visual defects open |
| ART-05 | Companion visual fidelity | partially implemented | yes | source | unknown | no | docs/art/SPINDLE.md; docs/art/SURVEY-STRIDER.md |
| ART-06 | Original VFX and environmental fidelity | partially implemented | yes | source | rejected-interior | no | #274/#279/#281; interior rejection persists |
| ART-07 | 15 deliverables and 19 asset review records | partially implemented | yes | source | unknown | no | docs/art/ASSET-PRODUCTION-PLAN.md; docs/art/reviews/01..19 |
| ART-08 | Legally appropriate source and attribution | partially implemented | partial | source | n/a | no | AGENTS.md §Asset origin; investigate evidenced rights only, no origin-only blocks |
| ART-09 | Halo NPCs and vendor identity | partially implemented | yes | source | owner-scoped | no | #122/#214/#268/#288/#293; #271 still open |
| ART-10 | Worn 3D armour and acceptance | partially implemented | yes | source | owner-scoped | no | #136/#211/#214; docs/art/ARMOUR-3D.md; mesh fit/LOD gap |
| ART-11 | Recover concepts and provenance | partially implemented | partial | unknown | n/a | no | docs/art/REFERENCE-ARCHIVE-STATUS.md; incomplete archive |
| ART-12 | Version-controlled concept illustrations | partially implemented | yes | source | unknown | no | docs/art/concepts/; completeness unknown |
| ART-13 | Repeatable production asset pipeline | partially implemented | yes | source | unknown | no | #257/#301; tools/asset-pipeline/; budgets/visual review open |
| PUB-01 | Public repository disclosure containment | blocked | partial | unknown | n/a | no | public repo, historic disclosures cannot be undone by current scanner; admin review needed |

### UI, cartography and validation

| ID | Requirement | Status | C | T | V | A | Evidence / remaining gate |
|---|---|---|---|---|---|---|---|
| HUD-01 | Player HUD portrait/stats | partially implemented | yes | source | unknown | no | #172; test/e2e/hud-accessibility.mjs; real scale review open |
| HUD-02 | Companion portrait and commands | partially implemented | yes | source | unknown | no | #172; test/e2e/ground-companion.mjs |
| HUD-03 | Bars, slot customization and commands | partially implemented | yes | source | unknown | no | #166/#200; test/e2e/hud-accessibility.mjs |
| HUD-04 | Configurable and persisted keybindings | partially implemented | yes | source | unknown | no | #166; exact focus regression run unverified |
| HUD-05 | Scoped party frames and active status | partially implemented | yes | source | unknown | no | #169; test/e2e/party-hud.mjs |
| MAP-01 | Circular minimap and navigation | partially implemented | yes | source | unknown | no | #172; actual visibility/legibility gate open |
| MAP-02 | Full world Atlas | partially implemented | yes | source | unknown | no | #187/#199/#201; test/world-atlas.test.js |
| MAP-03 | World daylight and game/local time | partially implemented | yes | source | unknown | no | #160; world-clock scope region-dependent |
| MAP-04 | Personal Atlas waypoints | partially implemented | yes | source | unknown | no | #168; test/atlas-saved-points.test.js |
| MAP-05 | Atlas label legibility and keyboard | partially implemented | yes | source | unknown | no | #199/#201; visual retest pending |
| MAP-06 | Region/floor layers and rich map destinations | unverified | partial | unknown | unknown | no | roadmap map future scope; full features not verified |
| CHAR-01 | Authenticated character roster | partially implemented | yes | source | unknown | no | #150/#180; test/e2e/character-roster.mjs |
| CHAR-02 | Functional creation and model preview | partially implemented | yes | source | unknown | no | #180/#209; saved compatibility and visuals open |
| CHAR-03 | Owner-directed cinematic scene | partially implemented | yes | source | unknown | no | #180/#198; owner art scope, final visual confirmation open |
| VAL-01 | Cross-feature test/viewport evidence | partially implemented | partial | source | n/a | no | test/e2e/; latest baseline main CI not confirmed |
| VAL-02 | Atlas projection/accessibility test evidence | partially implemented | yes | source | unknown | no | test/atlas-cartography.test.js; test/e2e/atlas-waypoints.mjs |

### 2026-11-17 asset programme (numbered deliverables)

The source plan numbers items 01–15; stable register IDs `ASSET-01`–`ASSET-15` are assigned here without altering that historical document. The existence of `docs/art/reviews/01..15` and original assets demonstrates production/review work, **not** finished gameplay integration or independent artistic acceptance.

| ID | Original deliverable | Status | C | T | V | A | Evidence |
|---|---|---|---|---|---|---|---|
| ASSET-01 | Modular expedition backpack generator | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-02 | Kinetic capacitor harness | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-03 | Glyph projection gauntlet | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-04 | Cranial neural interface | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-05 | Biological culture reservoir | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-06 | Industrial material atlas | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-07 | Glyph symbol library | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-08 | Aegis field generator | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-09 | Kinetic/resonance effect library | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-10 | Restorative/symbiotic effect library | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-11 | Redesigned Mender Symbiote | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-12 | Industrial resonance tower | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-13 | Research/engineering workstation | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-14 | Crystallogenic colony generator | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |
| ASSET-15 | Adaptive nodules and resonant fungi | partially implemented | partial | unknown | unknown | no | [production plan](art/ASSET-PRODUCTION-PLAN.md); [reviews](art/reviews/) and asset pipeline; verify actual use |

## Committed plan and historical decision inventory

| Source | Purpose and key revisions | Interpretation |
|---|---|---|
| [DEVELOPMENT-ROADMAP.md](DEVELOPMENT-ROADMAP.md) | 2026-11-18 audit plan; 11-19 expanded DEL/EQ/NAR/WORLD/EXP commitments; 11-20 regression and disclosure checkpoints; 11-21 progression and merges; 11-22 owner asset-authorization addendum | **Historical requirements and decisions**; status tables at their dated baseline only; this register owns latest status |
| [Attunement-Game-Concept.md](Attunement-Game-Concept.md) | Persistent small-population MMORPG, class/skill/attunement/glyph/crafting, cooperative gameplay and long-term systems | **Vision** and design constraints, not all funded or implemented requirements |
| [CINEMATIC-CHARACTER-SELECTION-ROADMAP.md](art/CINEMATIC-CHARACTER-SELECTION-ROADMAP.md) | 11-20 reference-lock, owner screenshot rejections and corrections; 11-21 screen/asset constraints | #180 and #198 merged; full visual sign-off unverified; historical candidate sections not current PR statuses |
| [UI-CARTOGRAPHY-ROADMAP.md](art/UI-CARTOGRAPHY-ROADMAP.md) | HUD/MAP/CHAR/VAL identifiers; 11-20 owner readability rejection; 11-21 candidate integration | Older #191/#197/#180 open states superseded where verified; the reference composition remains an acceptance criterion |
| [ASSET-PRODUCTION-PLAN.md](art/ASSET-PRODUCTION-PLAN.md) and [reviews](art/reviews/) | 11-17 ranked packages, 15 deliverables and separate review records | Review or asset generation alone does not establish full runtime acceptance |
| [ARMOUR-3D.md](art/ARMOUR-3D.md) | Technical geometry pipeline and 11-20 geometry reservations, 11-21 scoped owner approval via #214 | Do not conflate owner design acceptance with passing measured mesh/LOD checks |
| [LUMENFEN-HYBRID-ASSET-RECONSTRUCTION.md](art/LUMENFEN-HYBRID-ASSET-RECONSTRUCTION.md) | 11-22 source donors, six landmark/portal identities and integration quality gates | #236/#257 and later art increments merged; visual reconstruction backlog #278 remains |
| [VISUAL-ACCEPTANCE.md](art/VISUAL-ACCEPTANCE.md) | 11-18 SwiftShader snapshot scores and comparison rubric | Historical subjective baseline, **not** present-day current quality grade |
| [ENGINEERING_EXTRACTION.md](ENGINEERING_EXTRACTION.md) and [MMO-RENDERING-EXTRACTION.md](art/MMO-RENDERING-EXTRACTION.md) | Prior-art implementation analysis, technology option matrix and renderer proposals | Engineering decision research, not proof roadmap tasks shipped |
| [IMPLEMENTATION-AUDIT-2026-11-18.md](IMPLEMENTATION-AUDIT-2026-11-18.md) | SHA-pinned initial branch/PR audit | Historical baseline, not contemporary state |
| [SEVERANCE-EXPANSE-HANDOFF.md](art/SEVERANCE-EXPANSE-HANDOFF.md), [SANCTUM-ARCHITECTURE-HANDOFF.md](art/SANCTUM-ARCHITECTURE-HANDOFF.md) | Region, patrol, Foundry and architectural handoffs; 11-20/21 ownership references | Current owner-shared regional rule in AGENTS takes precedence |
| [HALO-CONSTRUCT-NPC.md](art/HALO-CONSTRUCT-NPC.md), [SPINDLE.md](art/SPINDLE.md), [ELECTRICAL-COMBAT-ROD.md](art/ELECTRICAL-COMBAT-ROD.md), [ELECTRICAL-COMBAT-ROD-V2.md](art/ELECTRICAL-COMBAT-ROD-V2.md), [PHASE-ANNEX-DUNGEON.md](art/PHASE-ANNEX-DUNGEON.md) | Feature-specific art and gameplay contracts | Keep as subordinate implementation/history records; audit against current runtime |
| [HANDOFF.md](HANDOFF.md), [WORKSHOP.md](WORKSHOP.md), [PLAYTEST-VALIDATION.md](PLAYTEST-VALIDATION.md), [AGENTS.md](../AGENTS.md), [asset-pipeline HANDOFF](../tools/asset-pipeline/HANDOFF.md) | Runbook, authority, persistence, validation and asset pipeline | AGENTS is standing owner policy; other documents are dated operational records |

Other committed docs/art feature notes (for example Lumenfen world expansion, Kestrel Deep, character fidelity, rifts, VFX, armour, Sanctum, server-backed professions and equipment) are subordinate detailed specifications. Their existence is included in the [Git tree at baseline](https://github.com/ruishinor/game-dev/tree/b0df1672d4ac8589c867cb1210600efbca51849d/docs/art); they do not silently override this status index or AGENTS. The historical `SE-*` workstream IDs from the 11-19 Gate checkpoint are represented by WORLD-01, WORLD-02, ART-06 and regional handoffs; do not reassign or delete original references.

## Evidence gaps / unverified acceptance

- **Direct baseline execution:** source and test files inspected, but no exact-baseline passing combined Actions run retrieved. This document contains **no** blanket CI-green claim. Run CI on any register PR head and link exact workflow/job evidence before changing a test cell from `source` to `pass@SHA`.
- **End-to-end play:** current persisted 1→15 journey, region gates, old-save migration, combat/crafting/economy interoperability, reconnect/death and no-reward-duplication must be exercised beyond individual Node assertions.
- **Visual:** actual gameplay-capture comparisons remain needed for interior rifts, Phase Annex/Foundry readability, weapon grips/VFX, character models, HUD/Atlas/TV UI and Lumenfen. The owner has explicitly rejected some of these; no inference from GLB presence.
- **Reliability:** #265/#266/#298 browser test instability and #294 desktop render stalls remain open notwithstanding separately merged mitigations #269/#292/#295/#299/#301/#302.
- **Publication:** public Git history cannot be made confidential by moving modules server-side or limiting scanners. Access-control decisions outside this documentation scope remain.
- **Legacy PR disposition:** #91/#92/#93/#96 closed **without merge** as superseded after a later current-main scope check; distinct #93 acquisition source is retained in issue #315 rather than silently erased. #228 remains open against an obsolete non-main branch and requires its own equivalence/retarget decision. Do not wholesale merge old branches from their titles.

## Follow-on verification checkpoint — 2026-11-23 (08:08 UTC, **newer than initial baseline**)

**Inspected main SHA:** [`283ffe97d369eecbb0aa8a7dcabeacb59b1e05ce`](https://github.com/ruishinor/game-dev/commit/283ffe97d369eecbb0aa8a7dcabeacb59b1e05ce). This checkpoint is **not** a retroactive change to the `b0df1672` initial baseline or blanket feature acceptance. It supplements the initial requirement rows with verified new evidence. [Executable verification and visual-acceptance gates](VERIFICATION-GATES.md) cover the five priority areas; no existing IDs were removed.

- **Actual post-merge tests:** [Main health run 45136104065](https://github.com/ruishinor/game-dev/actions/runs/45136104065) completed successfully **on the SHA above**. The `npm test` suite passed **776/776** Node tests (including XP progression, region gates, economic invariants, appearance, equipment), standalone publication-preflight tests passed **7/7**, and the real-browser guest-entry/persistence job succeeded. This establishes successful *covered checks* at the stated SHA; it does not prove a natural level-15 journey or all feature workflows.
- **Natural progression:** `PROG-15` is **partially implemented**, not fully accepted. Unit tests cover cap 15 and selective server-sim XP/persistence/region gates; `test/e2e/annex.mjs` intentionally uses server fixtures and disables encounters for visual captures. A full legitimately earned and persisted 1→15 player journey remains **unverified**, specifically tracked in [#327](https://github.com/ruishinor/game-dev/issues/327).
- **Equipment and economy:** `EQ-01..09` and `SYS-02/03/09/10` have successful automated unit coverage at the newer SHA, but full legitimate acquisition→fabrication→equipment→combat→repair→reconnect across classes and failure/replay paths is **not established**. [#328](https://github.com/ruishinor/game-dev/issues/328) owns that proof; historical #93 blueprint source still requires scoped decision in [#315](https://github.com/ruishinor/game-dev/issues/315).
- **Character art:** appearance migration and browser UI tests exist, but final in-world head/face, gear clearance, rigging and NPC quality require owner review; see #185/#251/#271. The #214 scoped armour aesthetic approval is **not** a blanket fit/performance acceptance.
- **Interior dungeon:** live `test/e2e/annex.mjs` verifies three room models and portal composition and captures 1280×800/1920×1080; because it bypasses natural entry progression and suppresses combat AI for screenshots, it does not validate full play/telegraph readability or owner-rejected interior visual quality. Issues #317 and live [PR #306](https://github.com/ruishinor/game-dev/pull/306) concern the active Foundry/camera gate.
- **Accessibility:** `test/e2e/character-roster.mjs` and `test/e2e/desktop-windows.mjs` contain desktop/TV overflow, focus and controls checks, including five window modes up to 4K/1.5× scaling. These separate browser suites were **not independently verified as green on this exact main SHA**; real large-display legibility and human acceptance remain open. Do not promote phone-only test cases to release requirements.
- **P03 CI issue:** [#312](https://github.com/ruishinor/game-dev/pull/312) initial head `8bd1bc88` passed the publication scan but failed one keyboard camera-turn assertion in [integrated playtest run 45094822591](https://github.com/ruishinor/game-dev/actions/runs/45094822591) (**77/78**). [#321](https://github.com/ruishinor/game-dev/pull/321) is a separate pending fixture-only correction and must pass exact-head integration before being considered resolved; no waiver for #312.
- **Dated active PR snapshot:** at inspection the seven open PRs were #228, #306, #308, #312, #318, #319 and #321. This inventory will drift; **re-fetch** before future merges.

**Acceptance policy:** existing cells marked `source` indicate tests present at the *initial* pinned baseline; the 776-test pass applies to **this later SHA**, not automatically to every historical row. Verify the exact applicable browser/visual/audit gate before changing `V` or `A`. P03 retains sole edit ownership of the canonical status register; other workstreams deliver evidence in their PR/issue discussions.

## Low-friction maintenance protocol

1. After every independently validated feature PR, place in its PR body: **requirement IDs**, owner intent/scope change, implementation paths, exact head and base SHAs, merged? (yes/no), exact CI workflow/job links and conclusion, visual evidence (with date/device/viewport), owner acceptance scope, incomplete behaviors and follow-on issue(s). Prefer **not** editing this file from parallel feature branches.
2. One designated register editor reconciles approved reports into the row(s) on a fresh main SHA. Keep IDs stable; update status and each of C/T/V/A separately. Record a new dated baseline in this heading and a short change log below, not a blind growing series of contradictory “current” snapshots in the older roadmaps.
3. **State transitions need evidence:** merge record + current retained source for C=yes; exact SHA-successful tests for T=pass@SHA; identified capture/observer review for V; explicit scoped owner/product decision plus remaining conditions for A. If source changed but validation is missing, leave the axis unknown. If later work invalidates a former PASS, downgrade and link the regression.
4. **Supersession:** never delete an old owner decision. Annotate the old file as superseded with the later decision/PR/date; keep lineage `Supersedes: OLD-ID` where scope genuinely changes. New IDs use a domain prefix, are unique, and do not reuse retired numbers.
5. Before merge: check link paths, repository policies, current main, overlapping active PRs, no public sensitive details, Markdown table column counts, and exact-head applicable CI. A factual documentation correction is not subject to a separate manual visual acceptance gate.

## Change log

- **2026-11-23 (P03 evidence update, main `283ffe97d369`):** corrected stale superseded PR claims, recorded actual 776/776 Node and guest browser main-health evidence and #312 camera failure, introduced five-track verification gates and linked #327/#328; original baseline unchanged.
- **2026-11-23 (P03 baseline b0df1672d4ac):** source-pinned consolidated register; unified delivery terminology and assurance axes; reconciled 15/20 cap, current region ownership, asset-origin rules, narrow visual approvals, recently merged PRs and outstanding legacy stacks. This is a documentation audit, not a gameplay or release certification.
