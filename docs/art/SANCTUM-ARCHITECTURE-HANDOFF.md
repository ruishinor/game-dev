# Handoff — 2026-11-21 (Claude, Severance / Sanctum track)

This file records the exact state of the work so the next session can continue without repeating anything.

## Branches and PRs

| Branch | PR | State |
|---|---|---|
| `charlie/bold-noether-f8gbb9` | #170, #177, #179 | **Merged.** Combat cadence and crown removal (#170), Phase Scar rift rebuild (#177), resonant veins (#179). |
| `claude/expanse-scrapyard` | #189 | **Merged** (2026-11-21). |
| `claude/vfx-lab` | #205 | **Merged.** The VFX inspection lab (`client/vfx-lab.html`) and `tools/vfx-lab-capture.mjs`. |
| `claude/rift-polish` | #208 | **Merged.** Rift profile core and night-readable vanes. |
| `claude/sanctum-architecture` | #203 | **Merged.** The kit is integrated: deck, pylons, arches, spire, spans, arrival hall and service console. At q=0 the generic kit is kept. |
| `claude/races-foundation` | #209 | **Merged.** Human, Velari and Augmented replace Colonist and Mirekin (foundation). |
| `claude/severance-soldiers` | none | **Handed off.** The owner moved the Severance Soldiers to a parallel effort. This branch is a reference only: do not merge it or continue it without owner direction. |

## #189 Scrapyard: what it contains

- The camp, its kit (`salvage_camp.glb`), the server-only garrison with the Forge Overseer elite, and per-instance elite multipliers.
- Elite rewards: 2 Resonance fragments, plus an independent chance of an Uncommon item on its own RNG stream (the rate lives in the server loot table), and four new Uncommon items. The owner lifted the publication block for this.
- Camp VFX layers in `client/src/salvage-camp-fx.js`: scene-colour heat refraction, forge flame, slag channel, scorched ground, sparks, arcs and the floodlight.
- A fix that keeps kit node transforms when placing pieces.
- `tools/dev/` probe scripts.

## Severance Soldiers reference (`claude/severance-soldiers`, not merged)

Useful to the parallel effort:
- Four soldier kits, one per armour family:
  - Cinderlock / Vanguard: Cinder Cleave;
  - Vesperglass / Keeper: Vesper Ward;
  - Mycelial / Symbiotech: Spore Lash snare and Mycelial Mend;
  - Strataweave / Surveyor: Strata Charge.
- Five patrol loops validated with `tools/dev/patrol-routes.mjs`.
- Squad social pulls, and 24 m aggro against players below level 4.
- A snare implemented through `moveSpeedMul`, so client prediction stays in sync.
- An `armour-fx` family override.
- A simplified Cinderlock NPC LOD at about 40k triangles, against 120k for the full set (`tools/asset-pipeline/js/armour-lod.mjs`).
- The full Cinderlock set is about 160k triangles per armoured NPC including the body, which is not affordable at squad scale.

## Sanctum architecture: state and next steps

- **Done.** `tools/asset-pipeline/asset_pipeline/blender/sanctum_arch.py` builds `assets/sanctum_arch/outputs/sanctum_arch.glb` (2.5 MB) in the Gate's material language: weathered carved stone, bronze and teal channels. Its pieces:
  - `SA_Deck`: a 13.6 m platform with a stepped curb, radial flagstone courses over a mortar bed, a rosette, an inlay ring and spokes. Its top sits at y 0.47.
  - `SA_Pylon`: 5.4 m.
  - `SA_Arch`: piers on the existing gatepost colliders at x ±2.05, with the lintel around 4.3–5.1 m.
  - `SA_Beacon`: a spire of about 9.4 m. The beacon core still floats at 11.4 m.
  - `SA_Span`: a 4 m girder along local +y.

  The emissive inserts are `SA_Channel` and `SA_Lamp`.
- **Integrated (2026-11-21).** Steps 1–3 below are done: the route, the preload with fallback, and the scene swaps for the deck, pylons, spans, road arches with zone-tinted lamps, and the beacon spire, with a slow pulse on the channels. `test/sanctum-arch.test.js` covers the asset hash and validity, the pieces, the fallback contract and the route. In-game captures were taken.
- **Arrival hall (2026-11-21), done.** It now uses the same language: `SA_HallWall`, `SA_HallPillar`, `SA_HallLintel` and `SA_HallCanopy` replace the procedural walls, columns, lintels and canopy when the kit loads. Colliders are unchanged.
- **Service console (2026-11-21), done.** `SA_Console` (a stone plinth, two carved lecterns, bronze-framed teal panels facing the beacon) replaces the generic computers and cable. The storage cases keep their own builder because the playable preview e2e asserts their structure; the fabricator has its own dedicated model.
- **Capture tool.** `tools/sanctum-capture.mjs` now pauses the software client while the server moves the fixture (as the e2e fixtures do), restores health each shot, and takes the Sanctum shots before the road shots, so every position is confirmed. Shot 05 frames the service console.
- **CI notes (2026-11-21).**
  - The playable preview e2e looks up `arrival:threshold-arch`. The hall kit holders keep the procedural names, and a test pins this.
  - The focused e2e (`--follow-inventory`, q=0) enters within 20 s. The kit's three 2048 px maps and material program pushed entry over that limit under software GL, so q=0 keeps the generic kit. Afterwards, dispatched runs passed 3/3, against 1/2 before.
  - The vendor heartbeat eviction and the rift poll that misses the brief "opening" phase are known environmental flakes. Re-run once; investigate if they repeat.
- **Next increment.**
  - Give the deck stronger material contrast; it reads pale under the bright ambient light.
  - Tune the night lighting.
- **Original plan:**
  1. Add a server route for `/client/assets/sanctum_arch.glb`, pointing at the pipeline output. Use the same pattern as `phase_scar.glb`; do not add a manifest entry, because the asset tests require files under `client/assets/`.
  2. In `client/src/main.js`, after the preload, set `assets.sanctumArch = await assets.loader.loadAsync(URL).catch(() => null)`, the same way the Mender prototype is preloaded.
  3. In `client/src/scene.js`, when `assets.sanctumArch` exists, swap each generic piece for its kit piece:

     | Current (generic kit) | Replacement |
     |---|---|
     | `buildSanctum`: base disc, Platform tiles, inlay and rim rings | `SA_Deck` at y 0 |
     | `Column_MetalSupport` spans | one `SA_Span` per span, scaled to the span length |
     | road `Door_Frame_Square` | `SA_Arch`, keeping its occluders, with its lamp tinted to the zone colour |
     | `pylon` builder | `SA_Pylon`, keeping its occluder and dropping the glow cap |
     | `beacon` builder: `Platform_Round1` and column | `SA_Beacon`, keeping the core, rings, beam, light and floor lights |

     Place pieces with a holder or `applyMatrix4` on a clone, never by overwriting the node position. Quantisation stores the offset and scale there; that exact bug sank the Scrapyard pieces before #189.
  4. Leave the arrival hall, colliders, safe zone and services unchanged. Nothing may be stacked on any roof. PR #180 (cinematic selection) reuses the original `sanctum` kit, so keep that kit untouched.
  5. Capture with `node tools/sanctum-capture.mjs <dir>`. The before set is in the session scratchpad and is not in Git. Add a test for the route, the asset hash and the fallback.

## Character and race overhaul

**Foundation merged (#209).**
- `RACES` are now Human (the Colonist race, renamed; the id `human` is unchanged), Velari and Augmented.
- `RETIRED_RACES` migrates Mirekin saves to Velari. `server/store.js` normalises appearances on load.
- The skin shader in `client/src/face.js` carries the race features:
  - **Velari:** faceted crystal with glowing seams, cool subsurface scatter and an iridescent crystal crest.
  - **Augmented:** an alloy temple and cheek plate with status nodes and an ocular ring. These are placed relative to each character's baked nose tip, because identity morphs move the face several centimetres.
- Captures: `node tools/dev/appearance-capture.mjs <dir> velari|augmented`. Each combination takes about 5 minutes under software GL.

**Next, toward the owner's target quality:**
- modelled race geometry (Velari crystal growths, physical Augmented implant meshes);
- hair cards;
- facial detail and new animation;
- a calmer Velari facet pattern, which still reads busy.

The race lookbook PDF was not available in the session container. PR #180 (selection) changes `client/src/looks.js` and does not reference the retired races.

## Verification commands

- `npm test`: the full Node suite. The last runs passed 550/550 on #189 and 557/557 on the soldiers branch.
- `node test/e2e/rift.mjs`: passes locally. In this environment the vendor e2e takes about 22 min. Its CI failures on #179 were classified as environmental, after a same-environment A/B run passed on both branches.
