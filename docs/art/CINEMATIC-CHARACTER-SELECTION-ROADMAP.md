## Owner-proven defects — follow-up corrective batch, 20 November 2026

**Runtime evidence:** owner's three screenshots show (1) visibly blurred Gate backdrop, (2) expanded Inspect tools colliding with Delete/Create actions, (3) Settings as an overflowing, scrolling modal, and (4) roster New Character entry not responding. The selected character also appears too high in the frame. These are accepted defects, not aesthetic disagreement.

**Corrections pushed in the same PR:**
- **Backdrop:** replaced the 4,464-byte, 768-pixel image with an original-source 1024×576, 19,560-byte quality-preserving WebP. Binary Git SHA-1 verified against the generated local artifact. Image still has the original 1024-pixel source resolution, not fabricated 4K detail. Browser regression now rejects the former low-resolution export.
- **Creation action:** vacant roster slot invokes the existing `onCreate` callback directly, with explicit pointer stacking and no proxy `.click()` on a possibly obscured footer button. Browser test opens creation from this exact slot.
- **Inspection:** replaced the expanded roster-inline camera palette with a dedicated full-screen inspection state, retaining the same actual model and controls. A single Return button or Escape restores the roster with keyboard focus and no hidden controls left behind.
- **Settings:** the existing settings controls are reorganized into Graphics / Interface / More categories, each occupying a fixed viewport section rather than a scrolling popup. The gameplay HUD is hidden again when the settings panel closes via X or Escape.
- **Model framing:** adjusted the view target to present the actual character lower without modifying the actor's persisted world coordinates or rig.
- **Regression tests:** browser checks now cover the direct New Character action, separate Inspect view, no-scroll Settings categories, original-source background decode and full roster/world cycle.

**Validation boundary:** the modified JS parses, CSS braces balance and image binary checksum matches the uploaded source. The fresh GitHub Actions jobs are queued; no new runtime screenshots or owner visual acceptance exist for this batch. PR #180 remains draft and unmerged; #185 remains open for underlying character-model fidelity.

---
# Attunement — Cinematic Character Selection and World Entry

Owner brief: 2026-11-20. Feature branch: `feat/cinematic-character-selection-world-entry`.

## Owner-directed viewport and background correction — 2026-11-20, latest

The owner explicitly required (a) **true middle alignment** of the selected character; (b) the supplied original wide night Gate image **as the static background**; and (c) **no scrolling anywhere** during Character Selection or Character Creation. Prior paragraphs describing a live Gate GLB backdrop are superseded by this explicit direction.

Implementation on this branch:

- `client/assets/character-selection-gate.webp` is an optimized 768×432 WebP derivative of the owner-provided `wide-night(1).png` Gate screenshot, used directly as the background on both screens. This is no longer an approximation of the Gate made from new geometry. Source compression affects detail; full-resolution art can be swapped without modifying persistence.
- `client/src/selection-blueprint-environment.js` now provides a static, ready-only environment handle. The background is provided by CSS; the actual persisted character continues rendering through the existing `createModel` Three.js factory on an alpha-transparent canvas. Character rotation cannot move the scenery. The original Gate GLB and related Expanse assets remain unchanged.
- Removed the intentional `-0.55 m` lateral avatar offset and recentered the camera target on actual model bounds. Actor, environment, and primary entry are aligned to the viewport's middle axis.
- `client/src/creation-sections.js` reuses existing creation inputs and handlers but divides the page into three accessible, mutually exclusive sections: **Identity** (name/calling), **Body** (frame/origin/skin), **Details** (hair/colour). Selection state persists while switching; invalid name focus returns to Identity. No duplicate forms, data models or session calls.
- `client/selection-viewport.css` is loaded last and explicitly bounds the roster, creation UI, actions and model to `100dvh` with no page/panel scrolling, including compact/mobile section sizes and the real six-character capacity.
- Focused browser validation checks WebP HTTP delivery/decoding, live model count, section switching, no scroll/overflow on desktop and 390 px mobile, and the full authoritative create → world → return → delete lifecycle. No visual acceptance is claimed before actual screenshots of this commit.

**Acceptance pending:** CI and real rendered visual comparison, especially 320 px narrow screens, full model centre, six populated roster entries and any face/armour fidelity gaps tracked in #185. PR #180 remains draft/unmerged.

---

## Reference-lock implementation pivot — 20 November 2026 (supersedes invented scene)

The owner supplied the original cinematic MMORPG selection screenshot **again**, plus multiple real Attunement **Severance Gate** images at different daylight/activation states and a 35-second local walkthrough. These are **binding art and composition references**, not inspiration for another generic vestibule. The owner rejected all previous partial blue/cyan procedural gate adjustments. Earlier roadmap paragraphs describing the invented resonance vestibule are historical, not current design approval.

**Implemented in the isolated PR branch after the rejection:**

- Completely **retired** the improvised rectangular Sanctum gate, huge circular dais, cyan rings and oversized invented scenery. The old import module is now a compatibility re-export into `selection-blueprint-environment.js`.
- The selection and creation scenes load the **actual existing Severance Gate Near-scene GLB** from `/client/assets/severance_gate.glb`, served by the existing game HTTP router. The loader uses the same Meshopt decoder as the gameplay asset factory and caches the decode between roster and creator. No GLB copy is checked into the PR. This uses established 3D art rather than an image-only or procedurally invented substitute.
- Presentation-only custom camera staging (small published base scale, behind real character), sculpted/texture-mapped dark canyon terrain, existing rune/channel material colours, faint orbital bands, shaft and motes. No modifications to `client/src/severance-gate.js`, `shared/severance-gate.js`, the Expanse, Silent Foundry or their authority/travel state. This is a **menu visual**, not a gameplay instance.
- Reference-based UI overlay: actual selected full-body model approximately central-left, truthful identity/progression lower left, actual account-owned roster upper right, restrained bottom Enter World and secondary actions. Empty slots are truthful, no fake residents or classes.
- **Rotation now turns the actual character group**, not the camera and every environmental asset. Reduced camera pitch range; no large background swings while inspecting gear/face. Character model remains the exact existing `createModel` output with account-owned visual metadata, not a better-looking nonpersisted stand-in.
- The existing model is framed against the gateway at human scale, with less cyan exposure and no circular stage. Creation uses the same scene while leaving class and physical customization as real inputs.
- The stage GLB starts loading during the login module load, shares a cached immutable source and exposes a definite `data-scene-asset=severance-gate-glb` readiness state. Browser coverage must observe genuine GLB loading in **both** creation and selection; no procedural placeholder can pass.
- World entry now uses a temporary veil until the server-owned local character is placed and at least one gameplay camera frame is rendered, preventing the previously seen empty title-camera/aerial interstitial. Existing simulation and input contracts remain unchanged.

**Unverified/blocked:** No approved running screenshot has yet been taken of this *specific* new branch commit. The raw menu GLB has a faithful geometric/texture basis but its standalone material adaptation and stage positioning require actual browser evidence; do not call it 1:1 or visually accepted until inspected. Multi-race/model fidelity, facial detail, equipment fit, 320px layout, reduced motion, GLB fallback, GPU latency, authoritative enter/return are also acceptance gates. Issue #185 remains the separate character-asset quality blocker. PR #180 stays draft and **must not merge** on source inspection alone.

**Security review:** Existing server-owned selection/creation/entry/deletion are unchanged. The menu consumes the already browser-accessible Gate GLB, with no private drop rates or hidden mechanics. No new secret files, persistence schema, rewards, world-collider, source imagery or server-visible actor state are introduced.

---

## Second owner screenshot review — account roster, 20 November 2026, 19:31 CET

The owner retested **commit `c318651`** locally and supplied a genuine screenshot showing the account-owned character **Tish**, Level 1 Symbiotech Conductor, actual saved class/appearance and `1 / 6` occupied slots. This confirms the *account* roster is rendering a persistent character and the earlier six-empty-card defect is corrected. It does **not** establish visual acceptance.

**Owner screenshot deficiencies:**
- A huge foreground ring overwhelms the stage, the background gate structure is partly cropped, and visible architecture shows little fine material detail.
- The full-body character is still awkwardly framed; the horizontal camera controls sit directly across the feet/shins and the center floor.
- The current real Symbiotech Conductor gameplay mesh still has a conspicuous block over the lower face and insufficient facial/equipment quality. Replacing it with a fictional menu-only model is forbidden.
- Primary and secondary buttons now exist, but their layout competes with the model instead of supporting it.

**Second corrective batch, not yet visually accepted:**
- Rebalanced the staging: subtle 1.56 m raised deck instead of giant round Sanctum platform; backdrop gate moved deeper and scaled; original Sanctum GLB components measured and normalized to human-scale heights rather than arbitrary multipliers; removed massive foreground kit disc.
- Default camera yaw reduced to .08 radians to align the live character with the portal; both creator and selection retain drag, keyboard, bounded zoom and reduced-motion compatibility.
- Collapsed the intrusive toolbar into an accessible **Inspect character** disclosure, closed by default; controls now appear to one side and disappear on switch. Added focused E2E assertions for inspector/default visibility and primary-action nonoverlap.
- Replaced the Conductor's shared-gameplay floating mouth-block (in `client/src/looks.js`) with a lower-profile chamfered chin receiver and smaller side vents; affected game and menu use the *same* asset. Geometry fit still requires screenshot review.

**Acceptance and test gates:** The earlier `c318651` roster browser CI passed, but that applies to **pre-correction code only**. It also reported a follow/inventory timeout inside the existing browser fixture and an HUD accessibility ctrl-drag assertion; these cannot be attributed to these scene corrections without investigation. After this batch, obtain fresh roster/creation browser captures and re-check the authentic model in both, with a particular focus on feet visibility, portal position, popup overlays and accessory fit. Owner approval not given. **Keep #180 draft/unmerged and #185 open.**

---
## Owner visual rejection and corrective pass — 2026-11-20

The owner performed a **real local test** of PR #180 at `http://127.0.0.1:8082/` using an isolated preview worktree (previous branch commit `2fe561b`). **Visual acceptance failed.** Source screenshots, provided in the conversation, show:

1. Character Selection renders a very dark, minimally textured flat gate, a roster filled with six redundant empty-slot rectangles and a disabled Enter World action beneath overlapping camera buttons.
2. Creation returns to the old centered scrolling login card, with the active Verdigris Reach world rendered behind it, rather than extending the character-select environment.
3. Live character model renders, but its existing body, face and armor/gear quality do not match the reference or the owner's fidelity target. **Using the real model is necessary but not sufficient for visual acceptance.**

Remediation committed on the PR feature branch after that feedback:

- Reworked the form's DOM into a bounded creation-controls column and a shared cinematic, full-viewport character canvas, maintaining real class/appearance selections, submit and back functionality.
- Creation and selection both use the same `createSelectionEnvironment` renderer with live `createModel`; suppressed the unrelated game world title rendering during both screens.
- Moved both sets of camera buttons above primary action safe zones; added desktop browser assertions for bounding-box non-overlap.
- Empty roster shows one real creation action, account's true slot capacity and no fake character cards; disabled Enter World is hidden until a real selected character exists.
- Rebalanced scene exposure and neutral lighting, shaded rock materials, added procedural geological grain, real Sanctum kit parts, transit hardware and sparse material depth effects. These are *improvements to the interim scene*, not verified final AAA art.
- Browser gate now asserts full-viewport creation and captures genuine creation/selection screenshots in CI when available.

**Open blocker (not disguised by a lighting pass):** The existing actual character rig/model, face, skin and equipment meshes remain visibly below the requested fidelity. The MakeHuman derived `humanoid_m/f` assets, 4.3k quad facial basis, skin maps, identity morphs, fitted armour, GLB asset pipeline and `docs/art/CHARACTER-FIDELITY.md` should be audited for target-specific improvements. That is an *asset/mesh quality task*, not a CSS makeover. Do not replace the persisted character with an unrelated display-only asset, change authority, or make unsupported equipment appear. No owner visual approval until actual race/body and face/equipment screenshot comparisons pass.

**Next required gates:** Chromium run of corrected creator↔roster flow including model rendering, screenshot comparison at 1360×850, 1920×1080 and mobile; actual visuals across classes/origins and equipment; GPU/perf measurement. Tests may pass without reaching visual fidelity. Leave PR draft/unmerged while this work remains unresolved.

---
## Non-negotiable visual contract

- The **first** owner reference is the composition: full-viewport environmental depth, monumental transit/resonance structure behind the live selected character, top-left identity, bottom-left metadata, right-hand roster and low-profile bottom actions.
- The second image is a rejected *schematic*, **not** an approved palette, model, or quality floor. No grey/green/beige/yellow default look, no flat mannequin and no web dashboard.
- Selection must display the **actual persisted character**, using gameplay's `createModel` factory, appearance schema, outfit, allowlisted armour, social torso, weapon props and electrical rod mode where supported. Do not fabricate names, levels, class options, slot limits, wealth or locations. **The composition SVG is an original *target/diagram*, not an implementation screenshot or a substitute model:** [Cinematic selection composition](concepts/cinematic-character-selection.svg).
- No work on the owner-reserved Severance Expanse or Silent Foundry worktree, geometry or travel contracts.

## Repository state inspected, 2026-11-20

| Requirement | Existing architecture | Implementation and status |
|---|---|---|
| Login → authenticated roster | `client/src/net.js`, `server/net.js` account messages; `account_ready` | **Inherited**; unchanged protocol lifecycle |
| Account identity and persistence | `server/store.js`: account records, character `accountId`, explicit max 6 | **Inherited**; truthful maxSlots projected by server, no parallel DB |
| Enter World | `account_select` validates account ownership; `enter` calls `game.addPlayer` | **Inherited**; one active session per character; client disables repeat submits during loading |
| Create → initiation | `account_create_character`, `initiationSeen:false`, existing initiation hall | **Inherited**; returns from creation; no retired class/race introduced |
| Return from world | `account_leave`, `game.removePlayer` sync of position/health | **Inherited**; session remains account-authenticated |
| Character deletion | server `deleteOwned(account,id,name)` and typed client confirmation | **Inherited**; new UI retains confirmation, operation busy state |
| True character model | `createModel`, GLB body/appearance and procedural gameplay fallback | **Extended** to full-viewport scene; renderer shares model factory |
| Actual equipped appearance | public weapon/armour/social visual helpers and model `wv`, `av`, `sv` | **Implemented projection** for owned roster only; rod `er` from owned equipped rod; no inventory content sent |
| Character metadata | stored level/xp/credits/last location via `pos`, `zoneAt` | **Implemented** with sanitized account-owned presentation; initiation and disconnected-region spawn appropriately distinguished |
| Class roster | four active classes from `CLASSES` | **Implemented** insignia by actual class id, selected state, truthful empty slots |
| Environment | small beige/bronze procedural model background | **Replaced** with full-viewport original resonance vestibule, canyon silhouettes, layered precursor gate, subtle particles and cold neutral lighting |
| Settings | existing HUD settings panel | **Wired** from selection screen without parallel settings implementation |
| Render cost | existing separate preview render loop alongside title world | **Improved**: world backdrop render skipped while dedicated selection scene active |
| Accessibility | pointer drag, button rotate, bounded zoom, keyboard rotate, reduced motion | **Retained**; responsive layout needs visual acceptance |
| Safety | server validates auth, ownership, limits, mutations | **Preserved**, with a focused account-scoped presentation test |

## Visual art direction and spatial blueprint

The selectable presentation site is the **Resonance Vestibule**, a *menu-only* reconstruction of Attunement's existing precursor/transit language, **not** a gameplay zone or new dungeon entrance.

- Midground: character on a low octagonal/circular metallic rock platform, feet grounded. Existing gameplay factory renders body, face, hair/head, suit and supported equipment; the account roster never sends an arbitrary client model URL.
- Background: ~9 m ancient machine gate, dark weathered basalt plinths, cold steel ribs, recessed resonance seam; deeper strata and far broken rock silhouettes to convey genuine space.
- Lighting: dark blue-black atmosphere, neutral-cool key light for honest material colour, soft cyan environmental accents and restrained point source in the distant arch. No yellow, beige or gratuitous emissive haze.
- Animated particles: sparse and subtle; quality footprint intentionally bounded and reduced-motion variant removes movement. Avoid duplicate VFX engines or generating actual player abilities on the menu.
- Interactive: drag/keyboard rotates the live model; bounded zoom, full-body and face camera presets derived from rendered geometry bounds. Significant non-humanoid diversity not yet formally verified; no race-specific spline or bespoke pose claimed.

### Layout contract

Desktop composition: Attunement identity and real realm label upper-left, live 3D character centre, character-owned details bottom-left, account-owned roster on right, Enter World anchored bottom centre and peripheral secondary actions. Mobile stacks controls over the environment but does not hide the model or turn the view into a card dashboard.

## Architecture decisions

1. **Reused** existing three.js gameplay `createModel`, `Assets`, `createCreationPreview`; `client/src/selection-environment.js` only produces menu presentation geometry and draws no authoritative simulation.
2. **Reused** existing account↔characters ownership in `server/store.js`; no new record store, duplicate account logic, character state cache or client-side entitlement decision.
3. Extended `listCharacters` only after account filter to include `xp`, `credits`, `location`, `initiationSeen`, public allowlisted `av/wv/sv`, and valid owned equipment mode `er`; do not return `inventory`, `pos`, `equipped`, conditions, loot rules or hidden progression.
4. Character location is a label from `zoneAt` on stored position. Initiation displays its distinct state. Disconnected-region reconnect uses the existing safe-spawn policy; labels must not promise resume inside a disconnected instance.
5. The session and delete contracts remain server-authoritative; name confirmation is also enforced server-side. During requests, UI disables duplicate client submits but does not pretend that this is a security boundary.
6. Existing world assets do not get cloned or changed. Character menu can have real 3D lighting and props without modifying owner-isolated regions.

## Acceptance / evidence register

**Implemented in isolated branch, not automatically accepted:**
- Selection UI and unique cold-material scene, account data projection, truthful slot count, model-based visual metadata, character details, class insignia, settings, operation busy states, reduced background rendering, keyboard/rotation/zoom compatibility.
- Original concept image in `docs/art/concepts/cinematic-character-selection.svg`.

**Validation added but not represented as passed until workflows complete:**
- `node --test test/character-selection.test.js`: two-account isolation, visual projection, correct location, character progression, no secret state, other-account deletion refusal, inventory removal.
- `node test/e2e/character-roster.mjs`: actual registration, empty roster, viewport-sized canvas, creation/back/create/world/return, observed actual model/selected id, re-entry and typed deletion.
- Workflow `.github/workflows/character-roster.yml` triggers on relevant changes and runs focused Node + Chromium gates.
- Existing `npm test`, publication preflight, site-level browser tests and check runs must also be evaluated for branch/merge.

**Open quality/acceptance gates:**
- Representative *genuine running-game* screenshot(s) and real GPU inspection. The SVG is a concept only and **not** visual acceptance proof.
- Verify character model frames by each supported race/appearance/body type, equipment variants including held rod, armour families and cosmetic override precedence; inspect fallback when no GLB.
- Ensure view remains polished at 320/390/768/1360/1920 widths; collision/overlap, readability and WebGL performance must be visually reviewed.
- Test hostile/forged account IDs, duplicate entry/deletion messages and multi-account isolation through actual network sockets on the current branch, not just existing tests.
- Existing character position/progression and new-character initiation must be exercised against current authoritative game simulation.
- Improve scene art with actual optimized GLB/texture workflow if the procedural architectural staging fails owner quality review. Avoid falsely claiming it already reaches AAA fidelity.
- Full body armour/weapons without a renderable asset intentionally follow the gameplay fallback; not all items are visually representable yet.
- User-approved cinematic transition/world loader: the roster currently indicates entering status and swaps on authoritative `welcome`; a bespoke crossfade is **not yet demonstrated**.
- No independent realm selector: no multi-realm architecture has been identified. Label current supported world only.
- Do not reintroduce retired Red Rucker/Veyran character options or unrelated classes.
- Screenshots/video and actual run-time benchmark must be attached before visual acceptance/promotion.

## Standing AGENTS.md review gate

**Authority:** account registration/login, ownership, selected-character entry, creation limits, deletion and world state remain server-owned; preview and labels are advisory. All client roster data comes from the authenticated connection.

**Disclosure:** client receives only the owning account's selected public presentation projection and non-sensitive metadata. Do not project inventory, equipment internals, unknown item drop sources/odds, unrevealed mechanics or privileged state. Repository is *public*, so even server-only source is not confidentiality.

**Abuse and regression:** reject other-account character IDs at selection and deletion, mismatched deletion names, invalid create attempts and duplicate session replacement without loss. Unit test and inherited E2E cover a portion; further actual branch-level socket tests pending.

**Verification limits:** passing syntax/unit checks is not visual acceptance, browser-run evidence is not real GPU profiling, and no main merge until actual check gates and material visual/persistence objections are addressed.

## Next independent execution batches

1. Run and repair PR CI: focused roster test + Playwright, node tests, publication preflight. If CI blocked by external Chromium install, record external limitation and run focused independent checks when possible.
2. Capture genuine desktop/mobile evidence and verify selected persisted character/equipment. Fix defects against the first reference before any stylistic improvisation.
3. Complete reliable world entry fade/error and full lifecycle tests, including reconnect and cancellation.
4. Integrate any finished *existing* art pipeline assets through proven three.js model factory; optimise environment without overloading lower graphics quality.
5. Merge only after defensible tests and owner visual acceptance under `AGENTS.md`. If blocked by visual/gpu inspection, leave PR draft and continue independent work.
