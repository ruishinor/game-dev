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

RESULTS_PLACEHOLDER

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
