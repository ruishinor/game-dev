# Handoff — 2026-11-20 (Claude, Severance / Sanctum track)

The session stopped at the owner's usage cap. This file records the exact state of the work so the next session can continue without repeating anything.

## Branches and PRs

| Branch | PR | State |
|---|---|---|
| `charlie/bold-noether-f8gbb9` | #170, #177, #179 | **Merged.** Combat cadence and crown removal (#170), Phase Scar rift rebuild (#177), resonant veins (#179). |
| `claude/expanse-scrapyard` | #189 | **Open.** Head `f88037f`; all CI checks were queued when the session stopped. `npm test` passed 550/550 locally. Merge only when every check is green. |
| `claude/severance-soldiers` | none | **Handed off.** The owner moved the Severance Soldiers to a parallel effort. This branch is a reference only: do not merge it or continue it without owner direction. |
| `claude/sanctum-architecture` | none yet | **In progress.** The kit asset is committed but not yet integrated. This file is on this branch. |

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
- **Next increment.**
  - Restyle the service props (terminals, crates, cables, fabricator) in the same language.
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

Not started. The owner's decision is three races, Human, Velari and Augmented, which retire Colonist and Mirekin. Existing `race: 'mirekin'` saves need an explicit migration in `shared/appearance.js` `normalizeAppearance`. PR #180 changes `client/src/looks.js`, so coordinate with it.

## Verification commands

- `npm test`: the full Node suite. The last runs passed 550/550 on #189 and 557/557 on the soldiers branch.
- `node test/e2e/rift.mjs`: passes locally. In this environment the vendor e2e takes about 22 min. Its CI failures on #179 were classified as environmental, after a same-environment A/B run passed on both branches.
