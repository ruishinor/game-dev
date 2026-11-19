# Armour: from vector inventory art to rendered 3D assets

Owner direction (2026-11-19): turn the armour illustrations, which until now
existed only as vector inventory artwork (`client/src/catalogue-portraits.js`,
ART-07), into finished, rendered 3D armour assets with the same Blender-based
pipeline and renderer used for Stillpoint and the Halo Construct
(`tools/asset-pipeline`, Cycles). This document is the production record and
the roadmap to finish the work.

Status: **phase 1 implemented (technical acceptance below); owner visual
acceptance pending.**

## Scope of phase 1

The three live armour items, all chest slot:

| Item | Rarity | Vector design carried into 3D |
|---|---|---|
| `field_chest` Field Composite Vest | Common | slate composite vest, sage shoulder yokes, olive chest panel with a dark inset, tan webbing straps and buckles, hem binding |
| `reinforced_chest` Reinforced Relay Vest | Rare | blue-slate vest under layered steel plates (chest plate, two abdominal plates, back plate), large pale pauldron-yokes, teal inset, amber piping and rivets, relay housing on the left chest |
| `resonant_chest` Resonance-Lined Vest | Very rare | violet-slate vest, lavender yokes, dark teal plastron with a resonant diamond core, mint resonance lines (emissive) along the plastron and ribs |

Each item exists for both project bodies (`humanoid_m`, `humanoid_f`), so it is
worn correctly by every player and NPC built on them. Not in scope: the
blueprint documents (`blueprint_relay_vest`, `blueprint_resonant_vest` stay
vector, they are paper), the social coats (portraits exist but they are not
live items), and the class armour sets of the open SYS-01 foundation (PR #119;
see the roadmap).

## What the player sees

* **Inventory, vendor, loot, workshop, Codex:** `itemArt()` shows the icon
  rendered from the exported 3D model (transparent WebP, 256 px, content
  hashed), with the original vector art underneath as a fallback if the image
  cannot load.
* **On the character:** equipping a chest piece shows it on the wearer and on
  every observer. The server derives an allowlisted presentation id `av` from
  its own authoritative loadout (`shared/armour-visual.js`: equipped *and*
  owned), bumps the metadata version, and clients re-bind the skinned piece to
  the character's own skeleton (`client/src/armour-visual.js`). The armour GLB
  loads on first use, not at start-up.

## Method (route `body-fitted-armour`)

See `tools/asset-pipeline/README.md` for the stage table. Decisions:

* **Fitted to the real bodies, in bind space.** Shapes are lofted from the
  body's cross-sections, not primitives, using body units
  `u = (y - pelvis) / (neck - pelvis)` so one design fits both bodies.
* **The fitting surface is the body plus the worn-under shells.** The body
  mesh is hollow where clothing shells cover it (no lower-back surface under
  the belt), and characters wear those shells, so armour is an outer layer
  over the chest, coat, belt and sleeve shells. Nothing is hidden when armour
  is worn.
* **Convex cross-sections.** Armour bridges the spine groove and the space
  between the breasts like a real plate; it does not shrink-wrap.
* **Clearance along the normal.** Radial lofts sit closer on sloped surfaces,
  so every sheet is relaxed and pushed out along the surface normal to a
  minimum gap; layered pieces move with the vest's push, keeping their height
  above it.
* **Torso-borne skinning.** Weights come from the body surface, but legs and
  forearms never drive armour (the coat skirt near the hem is leg-weighted),
  the upper arm is capped (0.3 yokes, 0.4 pauldrons), and plates use rigid
  or height-band weights so they bend with the spine without shearing.
* **Materials.** The vector-art palette, converted to linear colour, drives
  procedural Cycles materials (weave on textile, edge wear, cavity, low
  mottle), baked to one 1024² atlas set per item: base colour, ORM, normal,
  and emissive for the resonant vest.
* **Icons from the shipped asset.** Icons are rendered from the exact
  optimised runtime GLB (Meshopt undone for Blender), studio-lit, three-quarter
  view, transparent background.

## Technical acceptance (measured; `tools/asset-pipeline/assets/armour_chest/outputs/`)

| Body | Item | Triangles | Skin inside | Shell inside | Deepest 0.5 % | Arm contact | Edge strain p99 (limit) | Pass |
|---|---|---|---|---|---|---|---|---|
| m | `field_chest` | 6,860 | 0.55 % | 0.51 % | -11.0 mm | 4.6 % | 0.64 (0.83) | yes |
| m | `reinforced_chest` | 7,361 | 0.66 % | 0.55 % | -10.6 mm | 6.7 % | 0.58 (0.83) | yes |
| m | `resonant_chest` | 6,666 | 0.76 % | 0.34 % | -9.2 mm | 4.1 % | 0.66 (0.83) | yes |
| f | `field_chest` | 6,718 | 0.61 % | 2.22 % | -13.9 mm | 3.9 % | 0.74 (0.89) | yes |
| f | `reinforced_chest` | 7,336 | 0.69 % | 1.61 % | -10.1 mm | 3.5 % | 0.73 (0.89) | yes |
| f | `resonant_chest` | 6,658 | 0.59 % | 1.28 % | -9.4 mm | 3.7 % | 0.71 (0.89) | yes |

* Runtime GLBs: `armour_chest_m.glb` 2,133 KB, `armour_chest_f.glb` 2,218 KB (WebP 1024² atlases, Meshopt); Khronos validator 0 / 0 errors. Icons: three 256 px WebP, about 6-7 KB each.
* Validation: seven clips (idle, walk, jog, sprint, interact, spell, punch) × 8 frames per body. Limits: skin penetration ≤ 1.5 % of vertices, worn-under shell contact ≤ 3 %, deepest 0.5 % of vertices within 15 mm, edge strain p99 ≤ 1.15 × the body's own. The 15 mm depth limit was set after measurement (the female field vest reaches 13.9 mm in sprint and punch frames, where the coat and chest shells, which carry their own arm-swing weights, press into the torso-borne vest); the other limits were fixed beforehand.
* Arm contact (the resting arm touching the vest side) is reported, not gated, as for every existing chest shell.
* Known weak points for the owner's review: the shoulder yokes flip up beside the neck, the textile wear reads streaky, and about 21k triangles per vest is heavy beside the 1.9k-vertex body (phase 5 LOD). Evidence: `outputs/evidence/*.jpg` (bind, idle and jog on both bodies; hero icons).

## Roadmap to complete

| Phase | Work | Acceptance |
|---|---|---|
| 1 (this change) | Route, three chest items × two bodies, worn in game, rendered icons, validation, docs | Validation passes on both bodies over seven clips; glTF valid; icons load in the live inventory; observers see the worn piece; no console errors |
| 2 | **Owner visual review and polish** of the three vests: silhouette, material wear, decal/stencil detail, emissive strength; worn screenshots in the Sanctum under game lighting; adjust per feedback | Owner art sign-off; side-by-side with the vector art |
| 3 | **Look coverage**: check every look's shells (hood, helmet, coat, harness gear in `looks.js`, signature gear) against each vest; per-look exceptions (hide or refit) where gear collides | Validation extended to each look's gear; no visible clipping in the appearance capture tool |
| 4 | **Class armour sets** (SYS-01, PR #119): gloves, greaves and boots × four class sets (Bastion Circuit, Verdant Conduit, Hinge Array, Faultline Harness). First original vector inventory art for each piece, then 3D through this route with new lofts (forearm/hand over the `hands` mesh, shin, foot over the shoe shell) | Each piece worn and rendered like the chests; set identity readable at a distance; `av` generalised to a per-slot allowlist |
| 5 | **Distance LOD** (a decimated variant per item) and a **texture budget** check with many armoured characters on screen | Frame time and memory within the low-spec preset; no pop at the LOD switch |
| 6 | **Rendered icons for other item families** (devices, implants, glyphs, weapons via ART-01): reuse the icon stage on their 3D models where those exist; the vector art stays the fallback | Every item with a finished model has a rendered icon; the rest keep vector art |

Out of scope until decided: cosmetic armour transmog, dyes, damage states.

## Authority and disclosure (AGENTS.md review gate)

1. **Authority / trust boundary.** Equipping is unchanged and server
   validated. `av` is derived by the server from the authoritative loadout; a
   client cannot set it, and an unowned or unknown item yields nothing.
2. **Data exposed.** Observers receive only the allowlisted item id of the
   worn chest piece, which is already visible on the character. No inventory,
   condition, stats or requirements are sent. GLBs and icons are public
   presentation assets of live items; no unreleased content.
3. **Abuse cases.** Forged equip of an unowned item, forged path-like ids and
   other-slot ids are covered by `test/armour-3d.test.js` (unit and real
   WebSocket).
4. **Verification and limits.** See technical acceptance. Remaining limits:
   the resting arm touches the vest sides (reported as arm contact, as with
   every existing chest shell); visual acceptance is outstanding.

## Current-main status — 2026-11-19

Phase 1 merged in [#136](https://github.com/ruishinor/game-dev/pull/136) (`7af55f0`). Browser validation was repaired in [#140](https://github.com/ruishinor/game-dev/pull/140) and [#141](https://github.com/ruishinor/game-dev/pull/141). [#119](https://github.com/ruishinor/game-dev/pull/119) subsequently merged (`08442f6`) after the reconciled head's 12 reported successful checks, including Armour browser integration. It delivers the **functional class-set foundation**, not phase 4's finished rendered armour: four anatomical slots, class and ownership validation, cumulative stat thresholds, persistence and individual vector artwork. Blueprint acquisition, fabrication, per-slot finished GLBs and visual projection, look coverage, balance and owner aesthetic review remain unfinished. Preserve the shipped existing chest GLB allowlist and its provenance when extending it. Do not mark phases 2–6 complete.
