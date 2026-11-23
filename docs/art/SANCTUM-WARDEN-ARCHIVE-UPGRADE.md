# Sanctum Warden archive reconstruction — pending visual acceptance

Historical rifle reconstruction: `feat/sanctum-warden-archive-rifles-20261122` / PR #246. Current integrated configuration: #293 (alternating primary weapons) and #288 (published fitted lower armor).

## Exact source lineage

Source-only owner archive: `assets/source-archives/glb-low-poly-models-building-blocks.zip`, SHA-256 `a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43`. Exact member: `glb-low-poly-models-building-blocks/model - FPS Survival Forest Outpost.glb`.

The source donor groups are:
- `097-weapon-scout-carbine`: 7 component nodes, equipped on Warden 1.
- `098-weapon-marksman-rifle`: 8 component nodes, equipped on Warden 3.
- Wardens 2 and 4 carry the joined fully energized combat rod, not either rifle.

A strict server-side exporter validates the whole source ZIP and extracts *only* these two groups into local `.asset-cache` GLBs. The 94 MB ZIP is not served. The browser accesses only the named isolated GLBs through explicit HTTP routes. Do not misrepresent source models as CC0. The owner has explicitly authorized use of this archive in Attunement's development repository and normal asset pipeline (see current `AGENTS.md`); retain provenance and investigate any specific evidenced conflicting rights issue, rather than imposing a speculative source-origin hold.

## Implementation

The weapon-presentation layer adds original receiver, rail, barrel lining, muzzle hardware, vents, optic housing and bronze resonance clamps to the source geometry, together with graphite/black PBR material reconstruction. The optic and status diode have subdued, independently animated emissive VFX. The original `halo_construct` skeleton, vertical ring, security armour, existing four optic colour variants, watches and server-authoritative placement all remain. The original guard stave remains a **fallback** if the assigned rifle or rod cannot be fitted. The civilian quartermaster keeps the existing white/sash look and behavior. Wardens remain neutral scene NPCs; the new rifles neither shoot nor inflict damage. No server combat mechanics have been changed.

## Clothing and armour review

The archive includes `141-figure-armoured-heavy` (a rigid low-poly soldier/armour group) and a separate Clothing Rail and Wardrobe pack (rigid coats and jackets on hangers). Neither is directly compatible with the Halo Construct's 67-bone humanoid rig, distinctive ring head or existing sculpted bronze-and-graphite security fit-out. Replacing the fitted clothing with either would be a likely visual and animation regression. Keep the existing sculpted armour. Potential future *detail donors* are individual removable plating, fittings, radio housings and duty textiles, rebuilt and conformed to the Halo rig with weighted deformation checks, not wholesale imported characters or rigid coats.

## Validation and acceptance

Source selection and bounded geometry have unit coverage in `test/warden-rifle-source.test.js`. The selected models use no new UI slots, loot/economy state, server privileges, attack events or VFX network messages. No raw archive HTTP mount is added.

**NOT YET VISUALLY ACCEPTED:** inspect actual rendered Warden silhouettes, front/side/back, weapon resting and moving, shoulder/chest clearance, sight orientation, low-light material response and emissive contrast; verify 1280×800, 1920×1080, 2560×1440 and TV/large-scale views; verify 4 Wardens' draw calls/frame budget on representative integrated GPU and on reduced-motion settings. The server-only source validator and browser model load may pass while the weapon looks wrong; do not use CI as a substitute for visual inspection.

## 2026-11-22 grip-fitting recovery

The owner's six actual gameplay screenshots showed rifle models loaded but hovering across the waist while both hands hung independently. The prior chest-offset implementation did not align either hand. The recovery adds explicit rifle grip/support anchors, reuses the existing two-bone arm solver on the animated Halo rig, tries a bounded set of low-ready poses, and refuses to display an unfitted waist-level weapon. It exposes measured grip errors to the existing read-only browser evidence hook and requires all four real Wardens to have two hands within 35 mm of their weapon anchors. The existing static guard watch clip and non-combat/server authority remain intact.

**Acceptance remains pending:** real browser screenshot evaluation of every variant in front, side and back views, animated movement and silhouette/clipping quality; model reshaping, wardrobe/finish integration and day/night GPU validation are separate outstanding work. Passing a numerical contact test is necessary but not sufficient for visual approval.

## 2026-11-23 P11 evidence and remaining deficiencies

Canonical starting commit `b0df1672d4ac8589c867cb1210600efbca51849d`. PR #288 merged the rebuilt optimized runtime `client/assets/halo_construct.glb` (2,320,596 bytes, 98,050 triangles, 10 meshes, 7 clips); it was not pipeline-only by its final head. Its exact-head Halo NPC browser integration and Node/pipeline workflows passed. The 1280×800 browser artifact from run 45087659938 includes real front, side, rear, gameplay and vendor frames and a JSON readout for all four outward-facing guard posts. Carbine support contact was 14.24 mm; marksman support contact 17.82 mm. Both rods reported two active corona sections and maximum electrical charge; all four reported zero pose failures in that capture run. The captured renderer was **SwiftShader**, not an integrated GPU performance measurement.

Visual review of the actual frames found that a combat-level neutral-idle corona can obscure the rod shaft; rifle shoulder/elbow poses also remain stiff and relatively forward-presented. P11 locally reduces the *NPC-only* idle corona width, emitter size and non-attack intensity while retaining full electrical charge and both active sections. The player rod, combat rules, NPC service/authority, source GLB and shared VFX engine are not changed by that adjustment. Reinspect fresh exact-head browser captures after the change: opacity assertions alone do not establish improvement to the rendered silhouette.

Outstanding: rifle wrist/shoulder choreography and hand penetration, an accurate multi-timepoint evaluation of the 10 s watch loop, shots under day/night and reduced-effects settings, additional desktop/TV resolutions, low-light material/outline review and integrated-GPU frame/draw-call profiling. The archived 2026-11-21 runtime numbers in `docs/art/HALO-CONSTRUCT-NPC.md` describe the earlier character bundle and are not the current published GLB.


## P11 rifle posture and animation-evidence pass (2026-11-23)

The initial neutral-rod VFX improvement (#319) keeps both fully energized halves and narrows excessive idle filaments/emitters without changing player VFX. Its actual SwiftShader browser artifact provides front/side/rear/gameplay comparisons; this does not substitute for day/night or hardware validation.

The follow-on rifle pass improves the same neutral guard rig rather than introducing combat AI or armature replacements: lower, less flared two-bone elbow poles for trigger/support arms, then a **maximum 0.28-radian** final wrist correction toward grip and fore-end directions. The wrist correction is applied **after** verified hand-target IK, preserving both physical hand anchor positions, and exposes per-hand applied/residual angles and elbow flare through `weaponFit`. Missing finger bones leave the hand intact. These are bounded posing adjustments, not proof of anatomically correct fingers on a rigid claw model.

`test/e2e/halo-npcs.mjs` now samples each real 10-second `Guard_Watch_Loop` at 2.5, 5, 7.5 and 10 seconds, checks authentic weapon attachment and contact continuity, records elbow/wrist-to-chest joint-centre **clearance proxies**, and captures additional frames at 5/10 s. These distances **cannot certify skinned-armor mesh nonpenetration**. A proper armor-clipping signoff requires manual inspection of the sampled front/side/rear/gameplay captures and, if ambiguous, vertex/triangle collision evaluation under actual skinning rather than treating joint clearance as geometric proof.

The same browser test records a single synchronous renderer CPU wall time, actual triangle/draw counts, drawing-buffer size and a screenshot at 1280×800, 1920×1080, 2560×1440 and 3840×2160 UI viewports. On CI SwiftShader, the 2560 viewport uses 0.75 pixel ratio and the 4K UI viewport uses **0.5 pixel ratio**, to bound software rendering cost. The reported time is not a measured GPU frame time, and the 4K layout check is not native-4K raster performance. Actual integrated GPU / desktop-TV native-4K FPS, frame pacing, VRAM and driver behaviour still require representative hardware. Do not use these CI numbers as hardware acceptance.

This section documents the **verification procedure and limitations**; do not mark it accepted until the exact-head workflow passes and the new image artifacts have been reviewed.
