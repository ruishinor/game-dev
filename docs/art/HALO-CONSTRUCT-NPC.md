# Halo Construct NPC race — production and integration record

Status: merged (#122). Vendor revised 2026-11-21 (below). Technical validation below.

## What is in the game

| Role | World object | Where | Look |
|---|---|---|---|
| Sanctum Warden ×4 | `sanctum_guard_1..4` (new, `shared/world.js` `SANCTUM_GUARDS`) | radius 16 m, bearings 15°/105°/200°/280°, yaw = bearing (outward) | vertical open ring, security uniform, warden stave |
| Vendor | `quartermaster` (unchanged id, name, position −5.6, −1.8, services) | inside the Sanctum, as before | the guard body and vertical ring in a painted livery (white shell, ebony mechanism and base garments), blue sash only |

| Warden | x | z | yaw (rad) | equipment | optic tint |
|---|---:|---:|---:|---|---|
| `sanctum_guard_1` | 4.141 | 15.455 | 0.2618 | pouches, radio | cool blue |
| `sanctum_guard_2` | 15.455 | −4.141 | 1.8326 | pouches, baton | amber |
| `sanctum_guard_3` | −5.472 | −15.035 | −2.7925 | radio, baton | pale green |
| `sanctum_guard_4` | −15.757 | 2.778 | −1.3963 | pouches, radio, baton | warm white |

Placement was solved against the shared world data, not chosen by hand:
every candidate on the r = 16 m circle was tested for ≥ 5 m from each road
centreline, ≥ 1.4 m from colliders, ≥ 2 m from objects, outside other zones
and ≤ 0.12 m ground variation within 0.6 m; four bearings with ≥ 80° spacing
were picked with extra road margin (≥ 5.9 m). The wardens are appended after
the rift-site search so no existing placement moves (verified: rift site
unchanged at (30, 46)). They are ordinary objects, so they are movement
colliders like Venn and the quartermaster, carry a nameplate, and are sent
to every client by the server; the server adds their fixed facing to the
object metadata (`y`, `v`). Right-clicking one returns "The warden keeps
watch over the approach." with no state change: no combat, aggro, patrol,
dialogue, safe-zone rule or service was added. The client places them at
their authored facing immediately and never turns them toward players.

The vendor's trade, buy-back, repair, prices and server authority are
untouched (`server/sim/vendor.js` unchanged); only its presentation changed.
It turns its ring toward a nearby customer, switches to the conversational
clip while engaged (the existing `talking` signal), and plays the `Interact`
gesture when a trade window opens. Archivist Venn is not migrated (separate
decision).

## Owner direction applied (2026-11-21): vendor on the guard model

The horizontal-ring vendor read as disfigured. The vendor now uses the
warden's body and vertical ring (no ring remap; the horizontal variant is no
longer shipped) in a painted livery: the shell repainted a clean white with
its own relative shading, mechanism and base garments ebony, optics kept
(`materials.paint`, a second base-colour map on `body_paint` /
`ring_vertical_paint`; same geometry, UVs, normal and ORM maps). Its
clothing is a blue sash only: shoulder sash, knot, two tails and the brass
buckle (`sash_blue`); the waist wrap and the olive shoulder plate are
removed. Services, position, behaviour and clips are unchanged.

## Owner direction applied (2026-11-19)

- Clean the accepted GLB: remove the baked-in utility kit (cross-harness,
  chest brush pouch, belt pouches, bedroll, magnifier, front flap) and build
  on a clean crop-top-and-shorts base matching the clean-base references.
- Vendor: the sash look exactly (sash and olive shoulder plate), one variation
  for this role only. The original utility clothing belongs to a
  crafting/service role (not implemented; future decision).
- Dark patches on the shell that are not gear, armour or clothing become
  smooth ivory.
- Role-variation sheet: vendor with the horizontal ring; security as a
  sculpted bronze guard with a long arm in an alert stance. A modern rifle
  was not used (brief: no generic modern soldiers; no weapon model exists on
  `main`); the wardens carry an authored warden stave.

## Production (pipeline route `imported-mechanical-humanoid`)

Command: `python -m asset_pipeline all --asset halo_construct` (config
`tools/asset-pipeline/assets/halo_construct/asset.json`; stage table in
`tools/asset-pipeline/README.md`). Stage times on this 2-core CPU machine:
analyze 3 s, clean 86 s, materials 38 s, wardrobe 120 s, rig 1 s, export
1 s, validate 4 s, evidence 567 s, baseline 345 s.

- **Source**: `client/character-assets/halo_construct.glb`, SHA-256
  `02853bfd…a32036`, 7,861,284 bytes, 167,664 triangles — read-only, verified
  by `inspect` and by `test/halo-construct.test.js`.
- **Landmarks** from the mesh: crotch 0.765 m, arm junction 1.335 m; dark
  coupling bands — elbows 1.206/1.193, wrists 0.937/0.931, knees 0.588,
  ankles 0.171; hips ±0.105 m.
- **Cleaning**: 20,720 vertices moved > 2 mm (max 94 mm, the flap/pouches)
  onto a fitted body envelope; voxel remesh (3 mm) to one manifold,
  639,812 → 28,290 triangles with the ring, hands and feet at 2× density.
  Colour re-baked from the source onto a compact atlas (missed rays carry a
  sentinel; 204,614 sentinel/margin texels filled from the mirrored source
  or inpainting); surfaces a removed accessory covered take colour from the
  X-mirrored source.
- **Materials** (inferred, not recovered — the source atlas is a projection
  of lit turntable frames): authored crop top and shorts (object-space weave,
  hems), shell warmed toward ivory with baked cavity shading partly divided
  out by AO, 18.9 % of texels cleaned from dark blotches to ivory, mechanism
  kept dark (17.4 %: couplings, neck, central abdominal struts, optics,
  soles), roughness/metal by class, optics emission ×0.8 tinted per NPC.
- **Wardrobes**: lofted from dense body samples so they follow the anatomy;
  Blender solidify, bevels, procedural PBR baked to one 1024² atlas per
  outfit. Security: bronze cuirass (keel, V-hem; neck and abdominal
  mechanism left exposed), layered graphite/bronze pauldrons, graphite
  vambraces, duty belt with brass buckle, bronze tassets, ochre ring
  insignia, swappable pouches/radio/baton, warden stave. Vendor: navy waist
  wrap, shoulder sash over the left shoulder, knot and two tails at the left
  hip, brass shoulder buckle, two-lame olive plate on the right shoulder.
- **Ring variant**: the vertical ring is remapped along its own centreline
  ellipse (0.077 × 0.125 m → 0.145 × 0.082 m) keeping cross-section,
  aperture and the optical units; aperture 0.0155 m² (vertical) and
  0.0187 m² (horizontal).
- **Rig**: the project humanoid skeleton (67 joints, same names and rest
  rotations, so existing clips drive it unchanged), fitted to the landmarks
  with root scale k = 0.9387 solved so feet stand on the ground in
  `Idle_Loop`. Bind pose = the source pose (reproduced exactly). Weights are
  rigid per segment with narrow blends only at couplings (elbow 2 cm,
  wrist 1.5 cm, knee 2 cm, ankle 1.5 cm, spine 3 cm, neck 2 cm) and wider
  cloth blends at hips/shoulders; influences < 2 % pruned. 78.5 % of body
  vertices are bound to exactly one bone. Plates are rigid to one bone;
  cloth takes weights from the nearest body vertices; the stave is authored
  at the right hand's grip in the guard pose and bound to the pelvis.
- **Clips**: `Idle_Loop`, `Idle_FoldArms_Loop`, `Idle_Talking_Loop`,
  `Interact`, `Walk_Loop` (UAL, CC0, via `humanoid_m`), `Bind_Pose`, and the
  authored `Guard_Watch_Loop` (idle tiled to 10 s with a restrained ±24°
  head/optic scan). Wardens are desynchronised by phase and tempo.
- **Runtime GLB**: `client/assets/halo_construct.glb`, 2,152,464 bytes
  (19.9 MB before WebP/Meshopt), 72,074 triangles across all variant meshes,
  3 materials, 10 textures (9 × 1024², emissive 512²), 7 clips; Khronos
  validator 0 errors, 9 warnings (normal maps without tangents, as for the
  other characters). glTF-Transform's quantisation gives each skinned mesh
  its own skin with adjusted inverse bind matrices; all bind the same joints.

## Validation (measured)

| Check (validate stage, 12 frames per clip) | Result |
|---|---|
| Bind pose reproduces the cleaned body | max error 4e-16 m |
| Rigid shells stretch under any clip | 0 (single-bone vertices) |
| Lowest body point per clip | −5 mm (fold-arms) … +6 mm |
| Garment vertices inside the body (> 4 mm) | guard ≤ 2.3 %, vendor ≤ 6.1 % (fold-arms) |
| Coupling-band edge stretch, 99th percentile | 0.98–1.84 (×; at elbows/knees, by design) |
| Ring aperture open (front projection) | yes, both variants |

Node: `test/halo-construct.test.js` (placement, road/collider/slope
clearance, outward facing, collider behaviour, quartermaster unchanged,
server metadata and no-op interaction, asset contract, provenance and source
hash). Pipeline: `tools/asset-pipeline/tests/test_humanoid.py` (rig/bind,
weights, envelope, flattening locality, ring remap, GLB matrix layout, stage
key invalidation). Browser: `test/e2e/halo-npcs.mjs` (all four wardens drawn
as the Halo GLB at their shared positions and facing outward, vendor at its
post, screenshots, renderer statistics) and `test/e2e/vendor.mjs` (now also
requires the Halo vendor model).

Performance: per drawn NPC ≈ 48k triangles (body 23.7k + ring 4.5k +
wardrobe 18.2–19.7k + equipment/stave ≤ 1.4k) and 4–6 draw calls; the
existing humanoid bundle is 38k triangles. Decoded texture memory ≈ 50 MB
for the shared bundle (textures are shared, not per instance). Browser
measurements in CI use SwiftShader (software WebGL) and say nothing about
GPU frame rate; no GPU measurement was possible here.

## Provenance

`assets/owner-sources.json` (`halo_construct_owner`): owner-authorised, not
CC0; Meshy's terms permit derivatives on both plans, the plan used is not
recorded, so "Model created with Meshy (meshy.ai), CC BY 4.0 where
applicable" is carried (docs/ASSETS.md). Newly authored: base garments,
wardrobes, stave, materials, rig weights, guard clip, ring remap. Reused:
UAL skeleton and clips (CC0). Owner references (lookbook, sheets, Meshy
viewer recordings, generated pipeline illustration) are git-ignored under
`art-source/halo_construct/source/` and are not published; the pipeline
illustration is not used for geometry or texture.

## Known limitations

- The base shorts keep the source's full hip volume (the fused pouches were
  flattened, not re-sculpted); the lower-back mechanism texture is the
  source's reconstruction smear.
- Hands are rigid claws (no finger articulation); a few fused hand-to-hip
  contact faces were removed (52), leaving tiny openings at those contacts.
- Coupling bands stretch noticeably in deep bends (fold-arms); wardens never
  use those clips.
- Garment penetration up to 6 % of vendor wardrobe vertices in fold-arms
  (the vendor does not use that clip in game).
- No distance LOD; texture memory could drop further with KTX2.
- Only security and vendor roles exist; the utility-kit crafting role and the
  slimmer body variant are not implemented.
