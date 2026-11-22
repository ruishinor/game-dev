# Sanctum Warden archive reconstruction — pending visual acceptance

Branch: `feat/sanctum-warden-archive-rifles-20261122` / PR #246.

## Exact source lineage

Source-only owner archive: `assets/source-archives/glb-low-poly-models-building-blocks.zip`, SHA-256 `a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43`. Exact member: `glb-low-poly-models-building-blocks/model - FPS Survival Forest Outpost.glb`.

The source donor groups are:
- `097-weapon-scout-carbine`: 7 component nodes, assigned to three Wardens.
- `098-weapon-marksman-rifle`: 8 component nodes, assigned to one Warden.

A strict server-side exporter validates the whole source ZIP and extracts *only* these two groups into local `.asset-cache` GLBs. The 94 MB ZIP is not served. The browser accesses only the named isolated GLBs through explicit HTTP routes. Do not misrepresent source models as CC0: the archive has no verified independent per-model license. This PR does not confer third-party redistribution approval.

## Implementation

The weapon-presentation layer adds original receiver, rail, barrel lining, muzzle hardware, vents, optic housing and bronze resonance clamps to the source geometry, together with graphite/black PBR material reconstruction. The optic and status diode have subdued, independently animated emissive VFX. The original `halo_construct` skeleton, vertical ring, security armour, existing four optic colour variants, watches and server-authoritative placement all remain. The original guard stave remains a **fallback** when a rifle model cannot load. The civilian quartermaster keeps the existing white/sash look and behavior. Wardens remain neutral scene NPCs; the new rifles neither shoot nor inflict damage. No server combat mechanics have been changed.

## Clothing and armour review

The archive includes `141-figure-armoured-heavy` (a rigid low-poly soldier/armour group) and a separate Clothing Rail and Wardrobe pack (rigid coats and jackets on hangers). Neither is directly compatible with the Halo Construct's 67-bone humanoid rig, distinctive ring head or existing sculpted bronze-and-graphite security fit-out. Replacing the fitted clothing with either would be a likely visual and animation regression. Keep the existing sculpted armour. Potential future *detail donors* are individual removable plating, fittings, radio housings and duty textiles, rebuilt and conformed to the Halo rig with weighted deformation checks, not wholesale imported characters or rigid coats.

## Validation and acceptance

Source selection and bounded geometry have unit coverage in `test/warden-rifle-source.test.js`. The selected models use no new UI slots, loot/economy state, server privileges, attack events or VFX network messages. No raw archive HTTP mount is added.

**NOT YET VISUALLY ACCEPTED:** inspect actual rendered Warden silhouettes, front/side/back, weapon resting and moving, shoulder/chest clearance, sight orientation, low-light material response and emissive contrast; verify 1280×800, 1920×1080, 2560×1440 and TV/large-scale views; verify 4 Wardens' draw calls/frame budget on representative integrated GPU and on reduced-motion settings. The server-only source validator and browser model load may pass while the weapon looks wrong; do not use CI as a substitute for visual inspection.
