# The Severance Gate — production and integration record

The monumental dungeon entrance of the Severance Expanse. The owner's assignment of 2026-11-19 directs this work, and from 2026-11-19 it leads Severance Expanse zone and dungeon development. The owner's concept sheets are the primary visual reference. They stay in the git-ignored `art-source/severance-gate/source/`; their SHA-256 hashes and provenance are recorded in `tools/asset-pipeline/assets/severance_gate/asset.json`. Evidence captures are delivered to the owner privately rather than committed to this public repository (see [AGENTS.md](../../AGENTS.md)).

## Method

The pipeline's new `reference-driven-architecture` kind (`tools/asset-pipeline/asset_pipeline/architecture.py`) follows the Stillpoint methodology. Each stage is resumable and hash-cached.

| Stage | What it does |
|---|---|
| `ingest` | Verifies the sheets against their recorded hashes and crops the front, rear, side and top views. |
| `measure` | Segments the front elevation from its blueprint background and measures the silhouette per row at a declared 28 m height. Results: base width 15.97 m, crown 7.4 m, plinth top 4.67 m, taper 0.463 (`outputs/constraints.json`). |
| `build` | `blender/severance_gate.py`, Blender 5.3 as a Python module, CPU only. Covers authored geometry, unwraps, Cycles bakes, the numpy material composite, LOD scenes, export, and `gate-metrics.json`. |
| `optimize` | The project's glTF Transform recipe (meshopt and WebP), keeping UV1 for the runtime. |
| `validate` | Khronos validator, material inventory, and the measured base width against the built one. The deviation is 0.8 %. |
| `render` | `blender/severance_gate_render.py` renders evidence views of the exported runtime file. |

The method is reference-constrained modelling, not photogrammetry: illustrations carry no camera model. The dimensions come from the measurements above. The carving, materials and effects are original authored work. No external art pack or donor mesh is used in the gate. The approach pocket's outcrops reuse the existing CC0 nature-kit rocks, which are already in the asset ledger.

Rebuild: `python -m asset_pipeline all --asset severance_gate`, run from `tools/asset-pipeline`. The full bake takes about 25 minutes on two CPU cores. `severance_gate.py` also accepts `{"recomposite": true}` to re-run the colour composite from the saved bake fields, and `{"export_only": "<blend>"}` to re-export.

## Asset

The asset frame is metres, with the front facing glTF +Z.

| Element | Built |
|---|---|
| Monolith | 28 m tall. Tapers from 16.1 × 13.6 m at the plinth to 7.4 × 7.2 m at the crown, with chamfered arrises and a base course. |
| Passage | Boolean-carved through the body: 4.4 m wide, 9.8 m clear height, four recessed arch orders at the mouth, seven rib arches narrowing toward the portal chamber. |
| Front carving | Four elongated hexagonal rune panels (lip and recessed field) with emissive glyph inlays, a spine recess, a nested stadium niche, and a channel network (panel outlines, pilasters, chevrons, arris ribs). |
| Other faces | Rear: a nested-arch slot and engraved dim inscriptions. Sides: a Y-split channel and course lines. |
| Crown | Hollow shaft with notches on all four faces. The energy column rises from it. |
| Weathering | 46 chipped arrises, nine fracture lines, debris, and a missing corner block whose pieces lie in front of the plinth. |
| Foundation | Two segmented tiers of individually irregular blocks (4.6 m). A 23-step stair (0.2 m rise, 0.38 m tread, 6 m wide) with cheek walls and capstones, a landing and two lamps. |
| Fragments | Ten levitating fracture shards, each a separate node so the runtime can animate them. |
| Ruins | Broken pillar, stump, fallen monolith, arch fragment, paving and an inscribed stele. They share the base atlas. |

| | Near | Mid | Far | Ruins |
|---|---:|---:|---:|---:|
| Triangles | 22.8k | 10.9k | 2.9k | 0.7k |

Materials:

- `SG_Stone_Body` and `SG_Stone_Base`: unique 2048² atlases (albedo, ORM with baked AO, tangent-space normal). The composite comes from baked procedural fields: mineral tone, gated fractures, convex-edge wear, chip pits, lichen on upward faces, and recess and ground grime.
- `SG_Rune`, `SG_RuneDim`, `SG_Channel`, `SG_Lamp`: emissive fallbacks. The runtime replaces them with animated shaders whose UVs encode panel, glyph progress and flow distance.

GLB size is 4.4 MB. The Khronos validator reports 0 errors and 0 warnings, and tangents are exported.

## Placement and gameplay contract

`shared/severance-gate.js` positions everything from one anchor, `SEVERANCE_GATE` (position plus a quarter-turn yaw). That covers the axis-aligned collision footprint, the walkable stair ramp (within 0.11 m of every tread), the landing and passage floor, the camera roof over the passage, and the interaction anchors.

The surrounding area is currently a bounded, disconnected `severance_expanse` region (`SEVERANCE_POCKET`). It is an 87 m approach from an arrival terrace past ruins and outcrops, enclosed by a ridge, with darker, warmer fog. Moving the gate into a larger Expanse map means changing the anchor, not the footprint.

| Step | Route |
|---|---|
| Reach → Expanse | The calibrated Phase Scar (existing checks) leads to the Expanse arrival terrace. |
| Expanse → Annex | Walk up the stairs and through the passage to the portal, then press F. The server requires the gate to be `active`, the player to be calibrated, alive and out of combat, within range, and with line of sight from inside the passage. |
| Annex → Expanse | The Annex arrival gate returns travellers to the foot of the Severance Gate. |
| Expanse → Reach | The arrival beacon returns to the Reach beside the Phase Scar. |

The Phase Annex encounters are opened by the first gate traversal and are not reset by later ones. A reconnect or restart from the Expanse places the character safely in the Reach.

The gate phase is server-owned. A living player within 120 m wakes it (`dormant` → `resonating` for 6.5 s → `active`); 40 s without presence returns it to `dormant`. Only the phase is replicated. Traversal emits one region-scoped cue; the full response plays at most once per 8 s, and further travellers inside that window trigger a minor response.

## Runtime presentation

`client/src/severance-gate.js` (landmark) and `client/src/severance-pocket.js` (terrain, outcrops, ruins).

| Band | Camera distance | Content |
|---|---|---|
| Near | < 60 m | Full geometry and all effect layers. |
| Mid | < 160 m | Simplified geometry; no mist, embers or discharges. |
| Far | ≥ 160 m | Silhouette, wide emissive channels, runes and the column. |

Bands switch with 8 m hysteresis. The landmark is hidden and not updated outside the region, and its GLB is fetched only on entering the region.

Effects, all derived locally from the replicated phase:

- A three-layer tunnel vortex with filaments and a convergence core.
- A sequential rune activation (lower panels first, glyph by glyph) witnessed once when the gate wakes; a client arriving at an active gate does not replay it.
- Channel pulses travelling outward from the portal.
- A three-layer celestial column from the crown with spiralling motes.
- Three inclined glyph rings, with intermittent ring-to-monolith links.
- Levitating fragments that rise with the gate.
- Lightning discharges between fragments, crown and panels, and chamber and vortex (one every 2.5–7 s).
- Ground fissures and resonance waves, masked off the plinth and stairs.
- Low mist and embers.
- One warm portal light, created once so the gate waking never recompiles shaders.

Traversal adds a vortex flare, a channel wavefront, a shock and sparks, then returns to the active state.

Fixed bounds: 240 embers, 260 column motes, three rings, three mist layers, one light. Reduced motion scales effect time to 0.15 and stops waves and discharges. The player's effect-intensity and calm-flash settings scale and suppress the flare. Quality 0 drops particles, rings, haze and the light.

## Verification (2026-11-19)

- `npm test`: 389 pass, 0 fail (Node 22). `test/severance-gate.test.js` covers:
  - GLB validity and versioned URL; scenes, parts and budgets; UV1 and tangents.
  - Agreement between the asset bounds, `gate-metrics.json` and the shared footprint.
  - Physical traversal from arrival to portal; stair ramp accuracy; blocked plinth and passage walls; camera roof.
  - Region bounds, labels and line-of-sight isolation.
  - Phase machine; travel validation (forged location, outside the passage, resonating, combat, uncalibrated); throttling; Annex return; beacon return; Phase Scar route; reconnect.
  - Landmark region gating, band hysteresis, activation sequence, stabilization, bounds, disposal; HTTP route and non-exposure of sources.
- Updated `test/rift-annex.test.js`, `test/companion-transit.test.js` and the browser flow `test/e2e/rift.mjs`. The browser flow covers the Phase Scar, the Expanse, the GLB rendered, the gate active, real W input through the passage, F into the Annex, return to the gate, and the beacon back to the Reach.
- In-game captures with `node tools/severance-capture.mjs <dir>` (SwiftShader, 1100×620, quality 2):
  - 18 views: arrival long-distance, approach, stairs dormant, resonating and active, three-quarter, side, rear with the column, player scale, landing, passage, threshold, top-down, an observer before and during a traversal, and the Annex after a real F traversal.
  - Landmark draw calls: 29 (mid) and 30 (near). Landmark triangles: 15.3k (mid) and 27.2k (near).
  - Renderer totals in the region: 145–171 calls and 166k–216k triangles. These include the Reach, which is still drawn although it is beyond the fog.
- Software-WebGL frame rates (1–3 fps) are not performance evidence. No real-GPU measurement has been taken.

## Open items

- Real-GPU profiling of the Expanse, and culling of the far-away Reach while in a disconnected region.
- Screen-space distortion around the vortex is not implemented. The vortex's depth comes from parallax layers.
- Environmental audio for the landmark is not implemented. The existing audio system has no positional sources yet.
- Independent visual acceptance against the concept art.
- The Expanse beyond the approach: Expedition Outpost, patrols, resources and the Foundry interior (see [SEVERANCE-ROADMAP](SEVERANCE-ROADMAP.md) on the Severance branch). The Phase Annex stands in as the dungeon interior until the Foundry exists.
