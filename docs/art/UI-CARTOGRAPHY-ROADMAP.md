# HUD, character selection and cartography delivery register

Owner direction, 2026-11-19. Visual targets, not implementation evidence. This register extends the canonical development roadmap. Existing server authority, account ownership and reserved Expanse/Silent Foundry workstream remain unchanged.

## Concept register

The owner accepted the two original schematic illustrations from the HUD/character selection conversation: upper-left player/companion portraits, compact bottom primary action bar with independent pet/stance bars; and cinematic character roster with full-body model central, details left, roster right, entry bottom. The following [original layout reconstruction](UI-LAYOUT-CONCEPT.svg) records their composition; it is not a pixel-identical export or screenshot. Reference files supplied by the owner (not redistributed as third-party art in this public repository):

| Reference | Use |
|---|---|
| HOTKEY-BAR FOR SPELLS, CONFIGURABLE (1).png and (2).png | Existing HUD and desired changes |
| character-creation.png | Character selection composition |
| image(20261119-225029).png | Circular minimap, compass, zone label and clock |
| image(20261119-225339).png | Aion-inspired widescreen atlas and searchable layers |
| image(20261119-225437).png | Compact party member portraits, status bars and active effect icons |
| image(20261119-225549).png | Regional atlas overview and clustered markers |
| image(20261119-225723).png | Day/night icon, circular frame |

Original Attunement styling: graphite, bronze/aged metallic frames, readable ivory text, restrained decoration, individually illustrated action icons where available. No copied game assets, no artificial glow or generic web-card layout.

## Work and acceptance

| ID | Scope | Status at branch creation / planned acceptance |
|---|---|---|
| HUD-01 | Player status portrait, class, level, HP/resource | Candidate cached portrait integration; verify asset availability, appearance, compact HUD, accessibility and real screenshots. Equipment-aware portrait cache remains a follow-up. |
| HUD-02 | Companion portrait/status and independent command bar | Candidate portrait integration; actual companion mode rendered from snapshot. Health/resource bars only when supported by authoritative companion model; do not invent values. |
| HUD-03 | Primary / secondary hotbars, independent companion commands and stances | Existing actions and commands preserved; compact frame styling candidate. Build stable per-slot action assignments, drag/reorder/lock, secondary bars and stance hooks for actual implemented stances; no decorative actions. |
| HUD-04 | Keybindings and customization | Dedicated settings categories, safe binding capture/conflict policy, persistence/migration, reset, input isolation. Visible, transparent, invisible empty slots preserve positions; reveal hidden slots in edit mode. |
| HUD-05 | Party frames | Cached member portraits and active-status hook candidate; retain existing nearby targeting until actual party rows and separate nearby treatment validated. Resource, cross-region/offline state only with explicit scoped member snapshot; future buffs use authorized active effects, not fabricated spells. |
| MAP-01 | Circular minimap | Candidate terrain raster from existing shared heightfield in Reach; compass, zoom, live markers, zone label, atlas link, separate optional clocks. Confirm coordinates, heading, edge markers, collision shapes, small viewports, real screenshots. |
| MAP-02 | Widescreen interactive atlas | Candidate current-region canvas, pan, zoom, layer toggles, searchable entries, recenter and live player location. Future: authored/rendered cartography tiles, region selectors, floor layers, click/hover details, marker clusters, discovered POIs, waypoints, accessible keyboard navigation. No secret spawn tables/loot odds, no undiscovered locations unless authorized. |
| MAP-03 | Day/night and digital clocks | Expanse has planned production day/night lighting; current main `client/src/severance-daylight.js` is a local opt-in preview with day/dusk/night/dawn keyframes and adjustable period; not yet a replicated world clock. HUD may show explicitly labeled preview time when applied. Production cycle must share one phase/time source with lighting (prefer server-derived time for consistent multiplayer; coordinate with Claude). Independent game and local wall-clock visibility, 12/24-hour options; no watchfaces. Never use the local wall clock as world time; no pretend day/night outside supported regions. |
| CHAR-01 | Login > character selection > world | Existing account roster has owner-scoped records incl look/appearance, level, and six-slot server cap. Replace roster presentation with left character facts, central animated full-body preview, right roster; explicit Enter World, Create, Delete, Settings, Return. Preserve guest recovery, account signout, existing session and deletion authorization. |
| CHAR-02 | Creation and preview | Reuse existing creation preview and character model loaders; selected character identity, outfit and supported equipment; no fictional stats. Race-aware camera, rotation, zoom and transitions, reduced motion, loading/error states. Existing characters return to persisted location, new ones follow initiation. |
| CHAR-03 | Selection scene | Original cinematic environment, material/lighting and VFX from existing pipeline; reference concept is not runtime evidence. Use independent title scene, not reserved Expanse environment or branch. |
| VAL-01 | Integration and acceptance | Node tests, browser checks of existing account, input, party, map, clock and save contracts, actual before/after captures at representative resolutions; test no hidden data expansion, authority unchanged and input focus safety. Human visual acceptance pending. |

## Boundaries

Client-only atlas reads existing shared geometry and already delivered visible-region entity snapshots; no new server/world payloads or authoritative gameplay mutation. Public map geometry is already public. Current disconnected region backgrounds are provisional geometry, not authored cartographic artwork. Avoid changing reserved Expanse terrain, phase travel, portal, dungeon or environment branches. Coordinate clock integration through the existing lighting adapter when production time is available. Keep future party data scoped to actual authenticated membership. Unknown effects must not appear as active; never disclose hidden mechanics via map layers.

Existing controls preserved; **Shift+M** opens the atlas, M remains the existing menu. No claims of completed visual quality until actual browser evidence.

## Owner visual acceptance feedback — 2026-11-20

Three attached live screenshots demonstrate that the first merged HUD iteration is **too small and not adequately legible**. This supersedes the earlier small-scale UI styling as an acceptance target.

- Increase the actual rendered size and contrast of player, companion and party frames, including HP/resource numbers and buff-status chips; no tiny 9–10px primary text.
- Crop **player and party** portraits to the head/above-neck visual region. Companion models can use a recognisable close crop adapted to their anatomy.
- Primary combat actions must be clearly larger; companion actions target **85% of main-slot dimensions** (rather than the earlier fixed 34px).
- Increase the minimap itself, nearest terrain/landmark labels, markers, player arrow and party circles. Improve contrast and reduce ambiguous collider clutter, without revealing hidden spawns.
- Always display the optional day/night glyph when enabled. If no production time-of-day value exists, use a visibly **neutral pending** paired-sun/moon indicator, *not* a fabricated phase. The existing preview must be called out as preview.
- Summon Companion becomes **Dismiss Companion** when a real owned companion is active, in both the clickable hotbar and the existing companion frame, without changing server restrictions on managing companions during combat/death.
- Action-bar slot visibility preference: visible / transparent / hidden; hidden logical slots retain their indexes and can be restored in Settings.
- Dedicated editable keybindings, defaults and conflict checks for the current real player and companion action slots; do not pretend future stances or buffs already exist.
- CI screenshot and browser gate must verify actual computed slot dimensions, icon/portrait frame visibility, keyboard configuration and summon/dismiss round trip. Human legibility and visual acceptance remain separate from automated pass.

Implemented candidate: `feat/hud-actionbar-keybindings`. Visual proof is only valid after its head passes browser rendering checks; do not mark fully accepted without inspection.

## Party frame and active-effect refinement — 2026-11-20

Branch: `feat/hud-party-status-buffs`, stacked on the HUD readability PR #151.

- Dedicated **party** frame stack is ordered by the server-issued `party.members` roster. Nearby visible non-members remain in their own labelled stack with existing targeting/context actions; no targeting functionality is removed.
- Members outside the local entity visibility set retain a name/class/level placeholder labelled **Out of visible range**. Their health, energy, buffs and appearance are not supplied by server party metadata and must **not** be fabricated or displayed as current.
- Party and player status effects render distinct per-effect vector artwork from existing Attunement spell/ability language. Icons have accessible names and full effect/tooltips. Effects only appear while present in the already scoped snapshot; no future buff system is invented.
- Focused real-browser two-session gate: join actual server party, verify party grouping and active buff icon, then move one member out of view and verify fallback without fake values. Full two-player regression remains necessary.

Deferred: remote teammate authoritative health/buff channels, class-specific party formations, raid/large-group layout, permanent buffs, future spell icons and personalized equipment portraits. Do not extend data visibility without an explicit server privacy/authority model.

## Atlas waypoints and navigation increment — 2026-11-20

Branch: `feat/atlas-waypoints-navigation`, stacked on the HUD legibility/keybinding integration until that PR is merged.

| Scope | Implemented candidate | Acceptance |
|---|---|---|
| MAP-04 Personal waypoints | Click within the visible current-region map to mark coordinates; separately select a known map entry and click **Mark selected place**; explicit clear control | No server mutations, no secret spawn/loot data, points restricted to the current mapped region |
| MAP-05 Minimap bearing | Distinct gold diamond marker at mapped position; edge-clamped marker when off-screen, accessible straight-line distance | Correct coordinate transform and heading; do not call it route guidance or navigable pathfinding |
| MAP-06 Full-screen atlas | Expand to screen edges, restore normal window, center on player, retain search/layer controls | Browser checks for fullscreen toggle, map search, waypoint creation/clearing, reopening and snapshot-driven distance |
| VAL-02 | Unit checks for pan/zoom inverse projection, region bounds and cardinal bearings; targeted Playwright browser workflow and screenshot artifact | Merge only on current-head validation; actual visual inspection still required |

A waypoint is transient and local to the current session and region, not account-synchronized and not a quest objective. It clears on crossing into another travel region. Route planning, persistent bookmarks, a fully authored map image, discovery/fog-of-war, quest pins, and shared party markers require additional product decisions or actual game-data integration; they are not claimed in this increment.

The dedicated Expanse/Silent Foundry environment and day/night cycle remain owned by the parallel workstream, untouched here.

## Current integration reality — 2026-11-20

This current-head checkpoint supersedes the historical "candidate" and local-preview statuses above; it does **not** assert artistic acceptance.

| ID | Status verified | Required next gate |
|---|---|---|
| HUD-01/02, MAP-01/02 | Foundation #148 merged; real portraits/minimap/atlas exist in current main | Review actual in-game sizing, head framing, hidden layers and camera/quality fallbacks |
| HUD-03/04 | HUD input, slot sizing and configurable hotkeys in #151, **still unmerged**; 14 successful runs on old head `d25eab60`, conflict with newer main | Preserve C/Inventory focus and existing real shortcuts, merge current main without dropping newer changes, then rerun HUD/browser/Node/companion/preview and viewport matrix; no forced merge |
| MAP-02 follow-on | #153 stacked **draft** on #151, head `2e8987b2`; dedicated waypoint test green, companion browser test failed (ambiguous Dismiss companion locator) | Only after #151 merge, retarget to main; scope corrected locator, retest waypoint/discovery, map bearing, zoom, keyboard and live region context against own head |
| HUD-05 party | #154 stacked **draft** on #151, head `36e4c57e`; party timeout and vendor identity failure plus companion selector failure | Only after #151 merge, retarget independently, inspect server-scoped party/out-of-range snapshots and vendor identity; then own Node, party, vendor, companion and integrated browser checks |
| MAP-03 clock | Production Expanse server-owned world clock and linked lighting delivered by Claude in #160, replacing earlier preview-only assumption | Read the current authoritative clock and its preview override; validate day/night icon/lighting match and multiple clients; do not add a second wall-clock simulation |
| CHAR-01/02 | Authenticated 3D roster #150 merged, with world entry/delete flows and live model preview | Keyboard/reduced-motion and loaded equipment presentation verified separately; owner scene/art review not implied |
| VAL-01 | Dedicated HUD accessibility browser test on #151 covers slot ratios, fonts, minimap size, focus/Inventory regression and keybinding persistence at 1280 × 860 | Extend to 320px and required 1280×720, 1366×768, 1920×1080, 2560×1440 usability and honest real-world capture/contrast review; synthetic keyboard events are not all real input |

### Exact safe integration and ownership

1. Verify newest main head and whether another agent has already changed any target branch. Fix conflicts on the owning HUD branch with a real three-way merge; do not replace entire `client/src/main.js`, `client/src/ui.js` or CSS with an older revision.
2. Diagnose failing CI **at job/log level** rather than treating all red status as flaky. The #153 companion failure has a known selector-specific correction from the later #151 head. For #154 the party visibility timeout and vendor authenticated-player failure are distinct and currently unresolved.
3. Merge only when GitHub reports a current-head mergeable result and all applicable current-head checks and individual jobs have completed successfully. Re-fetch main after each merge.
4. Keep the pre-existing player portrait and companion identity contracts, independent nearby-player targeting, account-scoped party state and uncluttered HUD logic. Do not invent unavailable party health, buffs or discovery markers.
5. Preserve Claude's reserved Expanse/Foundry environment and world-clock ownership; HUD code may consume existing public interfaces but must not change region geography, portals, dungeon objects or hidden content.
6. Visual screenshots and software-GL browser tests are implementation evidence, **not** artistic acceptance or real-GPU performance evidence.

## Owner visual rejection — 2026-11-20

**Status: REJECTED for visual acceptance.** The owner supplied one current in-game HUD screenshot and four original-intention references (minimap, party portrait stack and two overlapping portrait/hotkey-bar examples) on 2026-11-20. Successful #166 functional/browser checks and its merge do not satisfy the intended art direction. Subsequent Atlas recovery #168 merged through concurrent integration without thereby receiving owner visual approval.

The actual owner comparison establishes these mandatory corrections:
1. **Player/companion frames:** compact top-left integrated portrait and horizontal HP/resource tracks, circular head portrait visibly overlapping its metal frame; no large standalone dashboard cards, detached text buttons or gratuitous empty space. Unavailable companion information remains truly unavailable.
2. **Party portraits:** a bounded vertical stack of real party members with identifiable headshots, compact health/resource status only from permitted snapshots, and genuine active effects with distinct visual artwork. Out-of-region members may show an honest unavailable state, never invented health or buff values.
3. **Action bar:** compact centered illustrated 1–9 slots, independent subordinate companion command row, original high-fidelity ability-specific art and correct key labels/cooldowns, reliable configurable keybindings and visible/transparent/hidden empty-slot options. **Primitive monochrome glyphs or inexpensive generic iconography are not a final artistic substitute for the reference.** The 25 original multi-layer SVG scenes in draft #172 are functional first-pass art, not confirmed final-quality acceptance.
4. **Minimap:** bounded gold/bronze circular instrument with dark, detailed, topographic terrain; clear directional cues and meaningful scoped markers. Minimize overlapping labels and flat debug-map shapes. Atlas interaction and waypoint function remain intact.
5. **HUD footprint:** keep the game world visible on 1280×860, 1366×768, 1920×1080 and 320px, without collisions between portraits, map, hotkeys, menu or chat. Real input navigation, action availability and keyboard focus must remain correct.
6. **Art validation:** compare actual runtime captures for each class and a valid party/companion state with the owner's references. Screenshots, SVG existence, browser size assertions and software-GL success are evidence, **not** authority to assert artistic acceptance. Human review remains required.

**Active correction:** draft [#172](https://github.com/ruishinor/game-dev/pull/172), isolated from party HUD [#169](https://github.com/ruishinor/game-dev/pull/169). Validate with a new current-head job matrix and visual artifact inspection. Maintain draft status and never silently mark VISUAL ACCEPTED simply because tests pass. Reconcile #169's server-scoped party behaviour onto the accepted compact styling without changing Claude-reserved environments or exposing hidden mechanics.

## Owner reference lock — minimap, portrait trim and Atlas (2026-11-20)

**Explicit owner decision:** The original supplied templates are the design blueprint, not optional inspiration. Do not create a substitute palette/composition that contradicts them. Relevant exact source images: `INTENTION-MINIMAP.png`, `INTENTION-PLAYER-PORTRAITS-PARTY-CONFIGURATION.png`, both `INTENTION HOTKEY-BAR ... (1)/(2).png`, `image(20261119-225339).png` (widescreen interactive map), and `image(20261119-225549).png` (regional map and clustered data). These user-supplied reference images remain external to the public proprietary development repository; do not copy third-party illustration pixels.

- **Minimap size:** 236px in the rejected HUD was materially too large. Current draft #172 constrains diameter to 96–140px on larger viewports (CSS viewport dependent) and about 76–94px on small screens; verify actual screenshot footprint, not just internal canvas resolution. Keep the circular directional/terrain instrument and its controls independent.
- **Minimap and unit trim:** No default honey-gold, tan, yellow or beige frame/portrait/map UI palette. Use restrained charcoal/blue-slate/steel framing with neutral off-white lettering; HP green and class-specific resources retain gameplay meaning. Existing portrait composition stays compact and overlapping, as shown in the user's originals. Do not remove necessary focus/selection cues.
- **Atlas structure:** The owner's actual illustrated references have an expansive **rectangular** topographic map alongside a dark filter/catalogue sidebar, visible entity search and right-side vertical map tools. Do not render a large green circular reach schematic surrounded by unused black canvas; suppress raw collider squares and collision-prone text labels. Terrain must reflect the existing public world geometry, not invented future areas.
- **Marker presentation:** Visibly distinguish current public places, party, player, hostile and other authorized live entities; compress dense currently-visible categories into labelled counts where useful; retain individually searchable entries and non-authoritative waypoint guidance without disclosing undiscovered rewards or coordinates.
- **Candidate #175:** Original full-width relief plate, rectangular projection, dark sidebar, vertical zoom/recenter/fullscreen, and visual clustering. **Stacked draft on #174** (label-collision fix), not a complete map art acceptance. The built-in procedural terrain is an original intermediate texture; the rich hand-painted/environment-derived detail of the source is still a genuine remaining visual acceptance requirement.
- **Gates:** #172 and #175 need exact-head browser/Node and viewport checks, plus real in-game screenshot comparison against the original pictures. Do not auto-promote on CI green alone. Check keyboard/waypoint/Atlas pan/zoom accuracy and no changes to Claude-exclusive environments. Owner sign-off of true reference fidelity is required.


## Verified integration and desktop visual gates — 2026-11-21

This subsection supersedes the *current status* statements above, not the original reference compositions or owner decisions. Observed canonical main \`0a5c1697139cf0832f6091cc3fc777412f39ed57\` after [#200](https://github.com/ruishinor/game-dev/pull/200). Revalidate before making changes.

| Track | Inspected main/PR evidence | Still required |
|---|---|---|
| World Atlas, authored Reach image and manifest | [#187](https://github.com/ruishinor/game-dev/pull/187), [#192](https://github.com/ruishinor/game-dev/pull/192), [#188](https://github.com/ruishinor/game-dev/pull/188) merged; actual asset is integrated, not just a plan | Visual reference comparison; map legibility/zoom/crop, stable chart load, authored chart data and fallback, current-region coordinate fidelity |
| Map labels and keyboard | [#199](https://github.com/ruishinor/game-dev/pull/199) merged (caption collision), [#201](https://github.com/ruishinor/game-dev/pull/201) merged (keyboard controls); original [#191](https://github.com/ruishinor/game-dev/pull/191) closed **unmerged** | Live tab/focus, arrow-pan within Reach, zoom, Enter placement, Esc close, selected-place/saved-note flow; preserve valid search and marker semantics |
| HUD layout and input | [#169](https://github.com/ruishinor/game-dev/pull/169), [#172](https://github.com/ruishinor/game-dev/pull/172), [#181](https://github.com/ruishinor/game-dev/pull/181), [#200](https://github.com/ruishinor/game-dev/pull/200) merged. #200 repairs post-rebuild Ctrl-drag hit-testing in its test; **not a full UX sign-off** | Real Ctrl-drag/reorder, conflict-free keybindings, class/companion action visibility and valid party status; compare owner reference images, preserve artwork, no arbitrary redesign |
| Cinematic character roster | [#150](https://github.com/ruishinor/game-dev/pull/150) merged foundation; [#180](https://github.com/ruishinor/game-dev/pull/180) open at \`f22e057b\`, 15 successful / 2 failed workflows (roster, integrated) | Preserve approved sharp Gate background, **center** full-body player, real Create/Inspect/Settings/world entry, no unnecessary scrolling and no visual substitution. Owner inspection still required |
| Cinematic login | Original draft [#190](https://github.com/ruishinor/game-dev/pull/190) is a preservation source; dependent recovery [#198](https://github.com/ruishinor/game-dev/pull/198) remains draft at \`6dd0b8f1\` with 15 failed workflows | Integrate after #180 without replacing approved art, Cinzel, actual HTML sign-in/register form or guest access; test existing Atlas/Spindle/roster and first-click readiness |
| Race/body identity | \`looks.js\`, creation/roster rendering and historic characters are interdependent; Human/Velari/Augmented migration is **not verified delivered** | Versioned compatibility and saved Mirekin recovery; creation/edit/Inspect/gameplay projection, rigs and existing player data. No forced renaming or visual-acceptance claim |
| Owner GM previews | [#197](https://github.com/ruishinor/game-dev/pull/197) open at \`fe75a4b9\`, party/integrated workflows failed | Keep privileged access server-authorized, unavailable by default and never open through client-only UI; verify preview locomotion/world-entry continuity |

**Owner visual decision prevails:** automated canvas measurements, generated screenshots and a merge do not establish reference fidelity. Approved existing sign-in/selection compositions are to be recovered without reinterpretation. Desktop and large-screen viewing are the active production target: verify **1280×720, 1366×768, 1920×1080, 2560×1440 and large displays**. Keep primary actions, selected character, map and key controls visible without unnecessary page/panel scrolling. Retain keyboard and reachable overflow fallback rather than hiding content on constrained windows. Previous 320px tests remain useful regression evidence but do not authorize mobile-first compromises of the desktop design.

**Delivery dependencies and owners:** #180 selection is primary; #198 login stacks after #180, #190 is source only. #201 is the integrated keyboard lineage; do not resurrect #191. #193 weapon switching and #202 integrated-combat test recovery may influence action-bar assertions but are not license to change approved HUD art. Claude owns Sanctum architecture, Cinderlock and the remaining rare armour 3D, and reserved Expanse/Foundry; separate Soldiers work remains parallel. Only the designated hourly integration owner may merge general Attunement PRs. Retain one expected-SHA, correct-head check and individual-job gate per integration.

**Saved cartography follow-on:** [\`client/src/atlas-saved-points.js\`](../../client/src/atlas-saved-points.js) already stores up to 32 local character-scoped notes. Improve tolerance of malformed local storage and reject duplicate IDs with narrow Node tests; this is local persistence integrity, not shared server-authoritative mapping, cloud sync or a new location-discovery system.