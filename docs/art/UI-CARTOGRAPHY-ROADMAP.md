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
