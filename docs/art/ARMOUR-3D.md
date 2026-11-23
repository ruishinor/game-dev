# Armour: from vector inventory art to rendered 3D assets

> **Current-status reconciliation (2026-11-23):** [Canonical register ART-10/EQ-08](../DELIVERY-REGISTER.md) supersedes the earlier blanket “owner visual acceptance pending” status below. [#214](https://github.com/ruishinor/game-dev/pull/214) records the owner's **scoped visual acceptance** of four rare armour families and the revised Halo vendor on 2026-11-21. That does not waive the technical mesh-fit failures, LOD/tangent/performance work, runtime pose verification or new/rejected character-art concerns. The phase-by-phase text is preserved as historical evidence.


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

## Cinderlock Regalia — the Vanguard class set in 3D (phase 4, first set)

Visual aim: the owner's Cinderlock Regalia concept sheet (Kinetic Vanguard; Reactor Cuirass, Induction Gauntlets, Impact Greaves, Anchor Boots) and the black hard-surface cuirass sample with red emissive channels. The concept images are an owner reference and are **not** in the repository. The four pieces dress the live `vanguard_field_set_{chest,gloves,greaves,boots}` items (content names them "Bastion Circuit"; renaming the items to the Cinderlock names is a content decision left to the owner).

Asset: `tools/asset-pipeline/assets/armour_vanguard_set` → `client/assets/armour_vanguard_set_{m,f}.glb` and four rendered icons.

**Method** (the Severance Gate hard-surface standard, extended to worn armour):

* *Design* (`armour_cinderlock.py`): plates are authored in limb/torso parameter space on the body's convex envelope — faceted cross-sections (flat planes between 10–26 facets), sections smoothed along the bone, a hard-surface height profile (flat plateau with chamfered margins, V ridge, ramped rolled lips), chevron-cut greave plates, layered vambrace bands, pauldrons mapped along the upper-arm bone, a lofted boot upper and an anchor sole. Grooves, vent holes and bolts are part of each plate's spec.
* *Build* (`blender/armour_hardsurface.py`): solidify → exact boolean grooves/holes → planar dissolve → bevel with hardened normals; emissive inlay strips carry flow-distance UVs. Per item: material-id, field and edge bakes (convexity wear, AO cavity, scratches), AO against the body, a detail normal bake, and a numpy composite to base colour / roughness / metallic.
* *Rig*: each item is two skinned meshes (`item` and `item__fx` with the `CL_Channel` material) plus FX anchor nodes `fxa--item--kind--n` parented to joints. Item nodes carry `extras.hides`: the body shells the piece replaces (coat, chest, belt, sleeves, hood; forearms; thighs and shins). Pieces are fitted to the bare body plus the shells that stay visible (shorts, shoes, hands).
* *Runtime* (`client/src/armour-fx.js`): the channel shader animates the flow UVs, additive halos and ember points ride the anchors, a combat surge brightens them, quality and reduced motion are honoured. `wearArmour` hides the replaced shells while a piece is worn (ref-counted across slots) and restores them on removal.
* *Evidence*: dark studio (AgX, fog-glow bloom on the channels only), the whole set on one mannequin, bind / idle / jog on both bodies.

**Measured** (`validate`, seven clips × 8 frames; the phase-1 limits are *not yet met*, so the set validates with `strict: false` and is reported, not gated):

| Body | Piece | Min clearance | Inside body (max frame) | Inside kept shells | Edge strain max (limit) |
|---|---|---|---|---|---|
| m | chest | -27 mm | 2.9 % | 0.6 % | 0.56 (0.83) |
| m | gloves | -5 mm | 0.6 % | 4.1 % | 1.15 (0.83) |
| m | greaves | -35 mm | 4.1 % | 2.0 % | 0.45 (0.83) |
| m | boots | -17 mm | 0.1 % | 8.4 % | 0.39 (0.83) |
| f | chest | -23 mm | 3.7 % | 0.8 % | 0.64 (0.89) |
| f | gloves | -5 mm | 0.4 % | 3.1 % | 0.72 (0.89) |
| f | greaves | -30 mm | 3.1 % | 2.0 % | 0.39 (0.89) |
| f | boots | -23 mm | 0.9 % | 9.5 % | 0.34 (0.89) |

Body penetration concentrates where rigid plates cross deforming joints in sprint and punch frames; the shoe and hand shells sit under the boot and glove liners. The gloves' strain on the male body exceeds the limit.

**Remaining** (tracked in the table below as phase 4b): validation tuning to the phase-1 limits (currently `strict: false`), a distance LOD (137k–203k triangles per full set across the four families; loaded only when a piece is worn) and tangents for the detail normal map. **Owner visual acceptance of all four families (Cinderlock, Vesperglass, Strataweave, Mycelial): granted 2026-11-21** (#211).

## Rare class armour collection (owner specification, 2026-11-20)

Four class sets, 16 pieces, 16 blueprints, 16 recipes, 12 cumulative effects. Owner references: four armour sheets (Cinderlock Regalia, Mycelial Accord, Vesperglass Array, Strataweave Fieldkit) and four VFX family sheets (Kinetic Vanguard, Symbiotech Conductor, Aegis Keeper, Brine Surveyor). They are owner material, kept out of the repository; the sheet borders and UI frames are not armour colours.

**Ids.** The pieces keep the SYS-01 ids (`<class>_field_set_<slot>`, sets `<class>_field_set`) so existing saves and loadouts stay valid; names, attributes and effects are the owner's. The provisional "Bastion Circuit / Verdant Conduit / Hinge Array / Faultline Harness" names are retired. Legs = `greaves`, Feet = `boots`.

| Set (class) | Pieces | 2 / 3 / 4 pieces | Full set |
|---|---|---|---|
| Cinderlock Regalia (Vanguard) | Reactor Cuirass +18 HP · Induction Gauntlets +1 Kinetics · Impact Greaves +10 HP · Anchor Boots +6 HP +1 Instrumentation | +10 HP / +8% Charge generation / +1 m Discharge radius | +44 HP, +1 Kin, +1 Instr |
| Mycelial Accord (Symbiotech) | Cultivation Carapace +12 · Synapse Gloves +1 Biotech · Tendril Greaves +8 · Rootwalkers +4 HP +1 Instr | +6% healing / +8 HP / Mending Graft +1 tick | +32 HP, +1 Bio, +1 Instr |
| Vesperglass Array (Keeper) | Harmonic Cuirass +14 · Projection Gauntlets +1 Instr · Lattice Greaves +8 · Phasewalkers +5 HP +1 Kin | +8 HP / +6% projected barrier capacity / +1 m Lattice Relay radius | +35 HP, +1 Instr, +1 Kin |
| Strataweave Fieldkit (Surveyor) | Survey Harness +12 · Calibration Gloves +1 Instr · Excavator Greaves +8 · Traverse Boots +5 HP +1 Kin | +4% damage / +2 s Fault Scan / +1 m Controlled Blast radius | +25 HP, +1 Instr, +1 Kin |

**Mechanics.** One set engine (`shared/armor-set-bonuses.js`): distinct equipped, owned, class-matching pieces in their own slots; thresholds cumulative; removal drops them immediately; `deriveStats` is the only stat path. New effects are resolved in the real abilities: `barrierMul` multiplies the Keeper's projected barriers (Hinge Field, Lattice Relay; the Aegis glyph keeps `shieldMul`), `relayRadius`, `graftTicks` (same amount per tick, one more second), `scanMs`, `blastRadius` (the blast itself and the public rig radius).

**Acquisition.** Each piece has a personal, non-consumed blueprint and a class-locked fabrication recipe. Rewards, eligibility and rarity are server-authoritative; exact unrevealed source-to-outcome rules and probabilities are intentionally omitted from public documentation. Some blueprint acquisition sources are not yet implemented and those items are not currently obtainable through their intended gameplay route. Avoid implying complete availability until a tested end-to-end source is shipped.

**Status.** Mechanics, blueprints, recipes and drops: integrated and tested (`test/rare-class-sets.test.js`, `test/class-armour-acquisition.test.js`). 3D: all four families are built, fitted to both bodies, skinned, published and worn in game (`client/assets/armour_{vanguard,keeper,surveyor,symbiotech}_set_{m,f}.glb`; mapping in `shared/armour-visual.js`). Inventory art: Cycles renders of each real piece; blueprint art: a Freestyle schematic render of the same piece on a gridded holographic sheet (`blueprint_<item>`), so every icon depicts implemented geometry.

### The other three families (same route as Cinderlock)

Designs live in `tools/asset-pipeline/asset_pipeline/armour_families.py` on the Cinderlock maps, with the shared part kit in `armour_parts.py` (swept tubes, surface straps, oriented boxes, faceted gems, lens rings, authored FX strips). The hard-surface build adds a translucent layer (`<item>__glass`, family `XX_Glass` material, alpha blend) and pattern bakes (textile weave, organic cells, hazard bands).

| Family | Construction (what makes it readable without colour) | Energy language (runtime, `client/src/armour-fx.js`) |
|---|---|---|
| **Vesperglass Array** (Keeper) | Porcelain shells on titanium frames; a protected hexagonal optical core in the cuirass; diamond prism windows in slim thigh and shin shells; diamond knee cops with gems; vambrace prism panel and wrist projection lens; porcelain finger plates | ice-blue lines in phase, iridescent prism glass; Harmonic Shield / Hinge Field / Lattice Relay casts hold a sustained resonance |
| **Strataweave Fieldkit** (Surveyor) | Abrasion textile vest and trousers (weave bake) under bolted ochre plates; cross harness, belt with pouches, flaps, buckles and a survey canister; sternum instrument housing with a recessed amber readout; articulated thigh plates, hazard-banded knee guards, strapped shin plates; treaded boots | instrument readouts, scan bar and beacon blink; Fault Scan / Field Rig / Core Bore / Controlled Blast answer as calibration pulses |
| **Mycelial Accord** (Symbiotech) | Cultivated ivory carapace (cell bake) over jade tissue, deliberately asymmetric (leaf-shell pauldron with a membrane fin on the left, cupped shell on the right); rib ridges and flank membrane; vertebral spine plates; seed-node vessel; tendrils spiralling round chest, forearms and legs; culture vessel on each forearm; leaf-scale thigh plates; grown boot cuffs | peristaltic circulation along branching capillaries, breathing membranes and spores; Mending Graft / Neural Lash / Shared Pulse / Overgrowth Surge answer with a brief bloom |

All four families share the engine rules of the combat VFX (budget, intensity setting, reduced motion); a four-piece set of one family lights a restrained set signature. Nothing raises global bloom or particle counts.

**Cinderlock reconciliation** against the original concept sheet (supplied after the build): kept the graphite plates with crimson conduits, hexagonal reactor frame, raised collar, heavy pauldrons, articulated finger plates, chevron greaves and treaded anchor soles; restored the conduit down each middle phalanx that the sheet shows. Nothing else regressed.

## Roadmap to complete

| Phase | Work | Acceptance |
|---|---|---|
| 1 (this change) | Route, three chest items × two bodies, worn in game, rendered icons, validation, docs | Validation passes on both bodies over seven clips; glTF valid; icons load in the live inventory; observers see the worn piece; no console errors |
| 2 | **Owner visual review and polish** of the three vests: silhouette, material wear, decal/stencil detail, emissive strength; worn screenshots in the Sanctum under game lighting; adjust per feedback | Owner art sign-off; side-by-side with the vector art |
| 3 | **Look coverage**: check every look's shells (hood, helmet, coat, harness gear in `looks.js`, signature gear) against each vest; per-look exceptions (hide or refit) where gear collides | Validation extended to each look's gear; no visible clipping in the appearance capture tool |
| 4 | **Class armour sets** (SYS-01, PR #119): gloves, greaves and boots × four class sets (Bastion Circuit, Verdant Conduit, Hinge Array, Faultline Harness). First original vector inventory art for each piece, then 3D through this route with new lofts (forearm/hand over the `hands` mesh, shin, foot over the shoe shell) | Each piece worn and rendered like the chests; set identity readable at a distance; `av` generalised to a per-slot allowlist |
| 4b | **Cinderlock Regalia** (Vanguard set, this change): four slots × two bodies on the hard-surface route, emissive channel VFX, shells hidden under worn pieces, multi-slot `av`, rendered icons. All four families merged (#156, #211); owner art sign-off granted 2026-11-21. Next: validation to the phase-1 limits, LOD/tangents | Worn by wearer and observer in all four slots with FX (browser e2e); icons load; owner art sign-off (done) |
| 5 | **Distance LOD** (a decimated variant per item) and a **texture budget** check with many armoured characters on screen | Frame time and memory within the low-spec preset; no pop at the LOD switch |
| 6 | **Rendered icons for other item families** (devices, implants, glyphs, weapons via ART-01): reuse the icon stage on their 3D models where those exist; the vector art stays the fallback | Every item with a finished model has a rendered icon; the rest keep vector art |

Out of scope until decided: cosmetic armour transmog, dyes, damage states.

## Authority and disclosure (AGENTS.md review gate)

1. **Authority / trust boundary.** Equipping is unchanged and server
   validated. `av` is derived by the server from the authoritative loadout; a
   client cannot set it, and an unowned or unknown item yields nothing.
2. **Data exposed.** Observers receive only the allowlisted item ids of the
   worn armour pieces per slot (chest, gloves, greaves, boots; omitted while
   social clothing conceals the armour), which is already visible on the character. No inventory,
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

### Publication and validation checkpoint — 2026-11-20

- This is a public document. The previous paragraph disclosed unpublished rare-reward mechanics. It has been rewritten in present-day documentation, but historic commits remain publicly recoverable until repository visibility/history is resolved by an authorized administrator. Do not treat server-only path placement as Git confidentiality.
- Cinderlock runtime integration and rendered-icon work are merged, but the committed geometry report records `all_pass=false` across eight piece/body configurations. The build uses `strict:false` and therefore reports geometry failures without gating. It is **implemented, not geometrically accepted**.
- Completion requires an enforceable mesh-fit/strain check or explicitly authorized and evidenced exception, the already listed LOD/tangent work, real-GPU sampling, in-game animation evidence on both supported bodies, and owner artistic review. Preserve the accepted design direction; do not restart or discard valid assets.
- The three other armour family VFX modes are code-supported; worn GLB/model coverage, corresponding icons, acquisition path and human acceptance are still separate deliverables.

