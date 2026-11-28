# P03 — Current-main verification and product-acceptance gates

**Review baseline:** [`283ffe97d369eecbb0aa8a7dcabeacb59b1e05ce`](https://github.com/ruishinor/game-dev/commit/283ffe97d369eecbb0aa8a7dcabeacb59b1e05ce) inspected on 2026-11-23 (after the [initial P03 register baseline](DELIVERY-REGISTER.md)). **Not a release certification.** Follow [AGENTS.md](../AGENTS.md). This document supplements the canonical [delivery register](DELIVERY-REGISTER.md); only the register owns canonical requirement status. It does not change game scope or assign a second primary register editor.

**How to read evidence:** `S` source/automated assertion exists; `P@SHA` a successful run was inspected on the stated exact commit; `V` actual in-game screenshot/video review completed for the intended configuration; `A` explicit scoped owner/product acceptance, with unresolved defects closed. A `P@SHA` from one Node unit suite cannot establish a `V` or `A`, and no code presence alone is a proof of an earned player journey.

## Executed baseline evidence (only these are confirmed)

- [Main health run 45136104065](https://github.com/ruishinor/game-dev/actions/runs/45136104065) **success** on `283ffe97d369eecbb0aa8a7dcabeacb59b1e05ce`: `npm test` **776/776** successful Node tests; `test/publication-preflight.test.js` **7/7** successful; real Chromium guest entry and persistence job **successful**. This supports the covered server-simulation and source integrity predicates, plus that one limited browser interaction. It does **not** cover all five acceptance gates below.
- [P03 PR #312](https://github.com/ruishinor/game-dev/pull/312), old head `8bd1bc88de52adf44ecfe91fb634871ae707b22a`: disclosure preflight **PASS**; [integrated browser run 45094822591](https://github.com/ruishinor/game-dev/actions/runs/45094822591) **FAIL** (77/78). The failing camera-turn assertion timed out although its diagnostic printed matching change to character and camera yaw. [PR #321](https://github.com/ruishinor/game-dev/pull/321) addresses the software-WebGL test wait while retaining the actual rotation predicates. It is not deemed fixed until merged and exact-head regression passes; do not waive red CI on #312.
- Independently executed tests beyond these exact run records are **not** claimed. All test invocations below are reproducible **next actions**, not assertions of execution.

## Verification coverage and missing proof

| Gate | Existing test/source evidence | What is *not* established by that evidence | Completion owner / next record |
|---|---|---|---|
| P15-01 — real level ladder | `test/level-fifteen.test.js` verifies XP thresholds, level 15, save sanitization, earned awards, account isolation and anti-duplication; `test/regional-progression.test.js` verifies gates and representative level crossings. Both ran in the baseline Node suite. | A legitimately **earned** level 1→5→8→12→15 journey through live client gameplay without setting XP, GM commands or fixture-level changes; pacing/availability for each class. | [#327](https://github.com/ruishinor/game-dev/issues/327): a reproducible natural-journey run and sanitized progression diary |
| P15-02 — regional endgame | `test/regional-progression.test.js`, `test/rift-annex.test.js`, `test/e2e/annex.mjs` verify various entry/return contracts. | `test/e2e/annex.mjs` explicitly **sets level/progress** and disables enemy AI to capture three rooms; it does *not* establish natural boss completion, earned prerequisites or entire campaign progression. | #327 plus region gameplay owner |
| P15-03 — recovery | `test/level-fifteen.test.js` verifies old saves, persistence, death/rejoin, level-cap and invalid XP cases. | Combined, browser-observed full journey through death/reconnect/logout/re-entry with persistent quest and equipment state at each level band. | #327 with exact persistent-data fixture, no direct state granting |
| ECO-01 — item acquisition | `test/class-armour-acquisition.test.js`, `test/weapon-assembly-recipes.test.js`, `test/weapon-assembly-graph.test.js`, `test/progression-economy-integrity.test.js` run in Node baseline. | Complete ordinary acquisition and recipe availability through play, for representative starter and higher-tier equipment; design question [#315](https://github.com/ruishinor/game-dev/issues/315) remains. | [#328](https://github.com/ruishinor/game-dev/issues/328), P12 systems owner |
| ECO-02 — transactions | `test/e2e/vendor.mjs` exercises actual server-authoritative sale/purchase/buyback with **fixture-provided** initial resources; `test/e2e/armour.mjs` and `test/e2e/weapon-switch.mjs` grant inventory to run real downstream equip/weapon UI. | Legitimate earn→purchase→fabricate→equip→use→repair→persist and negative transactions with concurrent/disconnected clients. Passing fixture-powered journeys is insufficient for an unassisted economic loop. | #328; record before/after authoritative counts without proprietary loot odds |
| ECO-03 — balance | `test/progression-economy-integrity.test.js` checks fixed invariants, class attack parity and conversion safeguards. | Observed player earnings, resource access, sinks, true recipe discovery pacing and progression deadlocks under actual play (especially outside fixture levels). | #328; balance assessment separately from Node green |
| VIS-01 — playable faces and silhouettes | `test/appearance.test.js` verifies Human/Velari/Augmented and legacy migration; `test/e2e/character-roster.mjs` covers account-owned previews and creation views. `test/e2e/armour.mjs` exercises equipped model metadata and screenshots. | Natural-looking anatomy, fitted face accessories, skin/hair/headgear clearance, locomotion silhouette, varied gender/frame/rigs, observer rendering and real hardware performance **have not** been approved. | [#185](https://github.com/ruishinor/game-dev/issues/185), [#251](https://github.com/ruishinor/game-dev/issues/251), [#271](https://github.com/ruishinor/game-dev/issues/271); owner visual review |
| VIS-02 — armour/art | `docs/art/ARMOUR-3D.md` documents fit measurements and scoped #214 owner visual acceptance; `test/armour-3d.test.js` checks technical production. | Historical mesh strain/fit/LOD and production lighting/animations remain separate; narrowly approved set designs must not be called universally geometry-accepted. | Armour owner; capture both bodies and quality tiers with pose/motion checks |
| DNG-01 — runtime interiors | `test/e2e/annex.mjs` checks three visible rooms, roofs, return portal structure and captures at 1280×800 / 1920×1080. `test/rift-annex.test.js` and `test/e2e/rift.mjs` cover route state. | Cohesive material/architectural fidelity, avoiding primitive shapes, combat visibility and hazards/telegraphs with enemies *alive*, actual third-person navigation/camera and day/night evidence. The capture test disables encounter AI for deterministic shots. | [#317](https://github.com/ruishinor/game-dev/issues/317), [PR #306](https://github.com/ruishinor/game-dev/pull/306) and P07/P08; **owner interior-visual rejection still applies** |
| DNG-02 — continuity | Live and server-sim tests check travel and return, including region identity. | Full earned entry, death/recovery, reconnect and return while preserving player state; no visual acceptance implied by correct portal identity. | #327 and P07/P13 integration evidence |
| A11Y-01 — basic account UI | `test/e2e/character-roster.mjs` checks 1280×720, 1366×768, 1920×1080, 2560×1440, 3440×1440 and no-scroll/clipping constraints. | Actual text readability, contrast, gamepad/TV remote behavior where supported, long-duration comfort and owner sign-off. Not a complete accessibility audit. | P05 UX owner and player-observed captures |
| A11Y-02 — desktop/TV windows | `test/e2e/desktop-windows.mjs` uses 1280×800, 1920×1080, 2560×1440, 3840×2160 and 2560×1440 with scale 1.5; checks bounded controls, labels, keyboard management and window positioning. Workflow [`desktop-windows.yml`](../.github/workflows/desktop-windows.yml) has all five modes. | These five workflow jobs were **not inspected as PASS on this exact main SHA**; some content scroll may be justified, and static fitting does not guarantee readability. | P05; capture every major window in each selected display/scale mode |
| A11Y-03 — HUD/Atlas input | `test/e2e/hud-accessibility.mjs` checks reduced-motion, portraits, minimap, hotkeys, focus and several viewports; `test/e2e/atlas-waypoints.mjs` covers map interactions. | Real 4K/TV scaling, perception of text/icons, focus return under all modal interactions, pointer/keyboard hit targets and motion-safe VFX across each class. A 320px legacy test does **not** impose mobile release support. | P05; independent real-hardware/screenshot review |

## Execution and acceptance protocol

### Stage 1 — exact-head automated gates

Run on the **same integrated commit SHA** used for product evaluation; archive the SHA and workflow URL. Never substitute a previously successful PR head, test-source presence or a fixture's internal print for passing exact-head CI.

```bash
npm ci
npm test
node test/e2e/annex.mjs
node test/e2e/armour.mjs
node test/e2e/character-roster.mjs
node test/e2e/hud-accessibility.mjs
node test/e2e/weapon-switch.mjs
node test/e2e/vendor.mjs
```

For the desktop/TV matrix (existing workflow `.github/workflows/desktop-windows.yml`):

```bash
for mode in desktop hd qhd tv tvScaled; do
  ATTUNEMENT_WINDOW_TEST_MODE="$mode" node test/e2e/desktop-windows.mjs
done
```

These commands assume the repository's documented browser dependencies/Chromium installation; use the existing workflow setup. They are **a proposed execution sequence**, not a report that these suites all ran in this audit. Preserve screenshots/artifacts and failures; do not selectively report only positive checks. Do not substitute `?q=0` software-rendering fixtures for real hardware acceptance.

### Stage 2 — legitimate integrated player journey

Use an isolated persistent data store and new account. No `/gm` commands, test-only `char.level` overrides, direct inventory grants, or server-side teleports for this proof. At fixed milestones record **real UI and server-observed results**: normal quest/objective progress, credits/materials, earned level, equipment, fabrication station, combat, loot and vendor/repair receipts. Exercise allowed and denied actions. Save/reload, disconnect/rejoin and recover after death at selected checkpoints. Report reproducible failure details and what blocked progression; do not modify the public record to imply a completed full run if only isolated phases were tested.

### Stage 3 — qualitative visual and accessibility acceptance

Capture comparable in-game views in real third-person gameplay, not stand-alone asset previews: front/side/three-quarter faces, class equipment and combat motion; three Annex chambers and every threshold with real enemy telegraphs; primary HUD, map, inventory, loadout, fabrication, journal and Settings. Use at least 1280×800, 1920×1080, 2560×1440 and representative 4K/large-screen scaling, in relevant quality/night/dusk and reduced-motion configurations. Log: build SHA, hardware/GPU/renderer, viewport/UI scale, camera coordinates, character/enemy state, readable/unreadable elements, clipping, approximate frame/pause behavior and owner judgment. Compare with the owner-approved/rejected scope in AGENTS; **exterior portal approval does not authorize interior approval**.

### Stage 4 — close or keep open

For each P15/ECO/VIS/DNG/A11Y gate retain (a) evidence URI, (b) tested SHA, (c) result, (d) observed failure, (e) issue/PR owner, (f) owner/art review where applicable, and (g) explicit acceptance decision. Then update **only** the corresponding rows in `docs/DELIVERY-REGISTER.md`. No test workflow or documentation commit automatically completes A (product acceptance).

## Current unresolved responsibilities

- [#327](https://github.com/ruishinor/game-dev/issues/327) — full earned and persisted level-15 journey.
- [#328](https://github.com/ruishinor/game-dev/issues/328) — end-to-end real equipment/economy loop and transaction integrity.
- [#185](https://github.com/ruishinor/game-dev/issues/185), [#251](https://github.com/ruishinor/game-dev/issues/251), [#271](https://github.com/ruishinor/game-dev/issues/271) — live character/NPC model visual quality, not resolved by appearance schema alone.
- [#317](https://github.com/ruishinor/game-dev/issues/317) and [PR #306](https://github.com/ruishinor/game-dev/pull/306) — Foundry camera/interior presentation and visibility; no general art sign-off.
- [#265](https://github.com/ruishinor/game-dev/issues/265), [#266](https://github.com/ruishinor/game-dev/issues/266), [#298](https://github.com/ruishinor/game-dev/issues/298), [PR #321](https://github.com/ruishinor/game-dev/pull/321) — relevant browser CI reliability; exact diagnostic and specific assertion must be preserved.

**Ownership:** P03 audits and maintains this evidence index and the canonical requirement rows only. Existing gameplay, economy, region, art, security and UI owners are responsible for implementation or independent validation on their branches; they may link verification artifacts in their PR/issue descriptions without concurrently rewriting the canonical register.
