# Visual fidelity pass: effects, characters, gadgets, artefacts — handoff

Branch: `charlie/confident-wright-b2bh7j`, fast-forwarded from
`preview/playtest-brineworks` @ `7a9c5d7` (the most integrated head: Brineworks,
Sinter Flats, Keeper, Surveyor, live authored effects). No other branch was changed.
`feat/attunement-asset-production` @ `3c06a99` (Sinter Flats fauna) is **not**
merged here; that is a world/gameplay feature, outside this visual pass. No PR is
open.

Owner request (2026-11-17): drastically raise the visual fidelity of combat effects,
skills, gadgets, items and environmental assets, and the distinctive features of the
character models. References: industrial props, ring megastructure, the Listening
Stone (golden circuit rings), CHR-008 Suture Diver, EQP-001 reservoir family.

## Status

| # | Task | State |
|---|---|---|
| 1 | VFX capture harness + before evidence | **Done**: `tools/vfx-capture.mjs`, `docs/evidence/vfx/before/` |
| 2 | GPU particle + shader VFX engine | **Done**: `client/src/vfx/{textures,engine,combat}.js` |
| 3 | Every combat event on the engine | **Done**: 20 ability frames in `docs/evidence/vfx/after/`, tuned (review 16) |
| 4 | Character signature equipment | **Done, first pass**: `client/src/gear-{kit,recipes}.js`, `docs/evidence/gear/` (review 17) |
| 5 | Environment and gadgets | **Done**: the Listening Stone (`client/src/listening-stone.js`) and the Surveyor field rig, evidence in `docs/evidence/env/` (review 18). **Not done**: containers, generators, pipes, towers and terminals |
| 6 | Reviews, tests, docs | **Done** for this pass (reviews 16–18, this file) |

## What exists

**Effects** (`client/src/vfx/`), presentation only:
- **`textures.js`** — seeded canvas assets: a sprite atlas, five discipline
  sigils, a scorch map and noise.
- **`engine.js`** — `createVfx(THREE, scene, opts)`:
  - two instanced, velocity-stretched particle systems (2 draw calls)
  - pooled shader meshes (cap 40): terrain-conforming sigils, shocks, scorch and
    hazard telegraphs; jittering beams; swept arcs; fresnel/hex shells and pillars
  - 2 flash lights, created at start-up only at quality 2
  - projectile emitters
  - persistent caller-owned `area` decals (cap 16)
- **`combat.js`** — recipes for all 16 abilities, the enemy specials,
  telegraphs, hits, bolts (impact on arrival), heals, transfers, deaths,
  level-up, respawn, equip and attunement.
- **`main.js`** — quality ≥ 1 uses the engine; quality 0 keeps the original
  `fx.js` path unchanged. The `LiveCasts`/`LiveAegis` layers are kept.
  `?vfxt=<0.02..1>` slows presentation-only effect time for captures.

**Characters** (`client/src/gear-kit.js`, `gear-recipes.js`):
- Each look's gear is built once in bind-pose space, merged per bone and material,
  and shared by everyone wearing that look.
- The fluid, charge-segment and resonance-core shaders are per character. They
  follow the local player's own resource; other players show an idle level that
  rises in combat.
- **Signature pieces:**
  - Vanguard: kinetic accumulators and a charge cell
  - Conductor: a CHR-008 dorsal frame with three distinct cultures
  - Keeper: a resonance ring-core apparatus
  - Surveyor: cartridges, a power cell and a survey mast
- Overlapping legacy pieces were removed from `looks.js`. Coils, visors, the chest
  core, the respirator, the projector and the pouches were kept.

**World and gadgets:**
- **Listening Stone** (`listening-stone.js`, mapped to the `obelisk` model): an
  inscribed basalt monolith with a medallion, ground rings, orbital arcs,
  debris and motes. It brightens as the local player approaches (`st.near`,
  presentation only).
- **Field rig** (`main.js` `syncRig`/`animateRig`): a detailed deployable built
  from the gear kit.
  - a survey sigil on its real radius
  - throttled charge arcs to the owner when the owner is in range
  - the original radius ring and block fallback kept

**Tools:** `tools/vfx-capture.mjs`, `tools/gear-capture.mjs` and
`tools/env-capture.mjs` produce repeatable, labelled evidence under `docs/evidence/`.

## Verified (commands actually run on 2026-11-17, Node 24.22)

- `npm test`: **129/129 pass**. These are the 114 existing tests plus 15 new
  ones (11 engine/recipe, 4 gear/rig).
- Browser captures (headless Chromium, SwiftShader), with no page errors:
  - all 20 ability frames
  - 4 professions × 3 views of the gear, before and after
  - the Listening Stone far, near and close, before and after
  - the rig frames
- Integrated two-player e2e (`npm run e2e`): **72/72** after fixing check 9.
  Check 9 (`five character tabs show real square selectable slots and reserved
  details`) had failed since it was added in `99e7df1`, including on the base
  `7a9c5d7`. Root cause: the test matched `/Reserved slot/` against
  `innerText`, which returns *rendered* text, and the `.kicker` style uppercases
  it to `RESERVED SLOT`. The UI was correct. The match is now case-insensitive,
  and the check reports which condition failed on which tab.
- **Use Node 24, as CI does.** Under Node 22 the `art-originals` byte-reproducibility
  test fails because of V8 `Math` precision. This was already the case before this work.

## Not verified / known gaps

- No real-GPU frame times. Software rendering is not performance evidence.
- Gear clipping has been checked in the idle pose only. Run, attack and cast poses
  have not been inspected.
- Bodies, faces and anatomy are still the stock mannequin. This is the largest
  remaining character gap.
- Group fights with several overlapping large casts have not been captured.
- Shader colours bypass tone mapping on purpose. Check them on a real display.
- Flash lights stay in the scene, at intensity 0, after a quality drop.
- No final art approval anywhere. These are procedural assets, not sculpted or
  authored ones.

## Next steps, in order

1. Inspect gear in motion (run, attack, cast) on both rigs and fix any clipping.
   One way to do this: extend `tools/gear-capture.mjs` to trigger abilities.
2. Profile on a real GPU (`npm run profile`, `ATTUNEMENT_GPU=1`). If draw calls
   matter, collapse each look's gear into one skinned mesh per material
   (about 8 draws instead of 13–22).
3. Industrial kit props from the references (storage containers, generators,
   pipe runs, communication towers, terminals), built as gear-kit recipes on
   world objects, starting at Brineworks.
4. Character bodies: helmets and face plates per profession, and cloth layers
   over the mannequin.
5. Decide whether to keep the authored `LiveCasts` line layer alongside the engine.
6. Open a PR into `preview/playtest-brineworks` (if the repository has a PR template, follow its layout).

## How to resume

```bash
export PATH=/opt/node24/bin:$PATH   # or any Node 24
npm ci
npm test
node tools/vfx-capture.mjs after [filter]   # ability frames, ~5 min for all
node tools/gear-capture.mjs after           # profession close-ups
node tools/env-capture.mjs after            # Listening Stone near/far
npm run e2e                                 # integrated two-player playtest (~10 min)
npm start   # then open http://127.0.0.1:<port>/?q=2  (add &vfxt=0.2 to slow effects)
```
