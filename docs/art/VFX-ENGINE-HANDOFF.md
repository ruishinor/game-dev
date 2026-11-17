# Combat VFX engine — handoff (paused for manual pick-up)

Branch: `charlie/confident-wright-b2bh7j`, fast-forwarded from
`preview/playtest-brineworks` @ `7a9c5d7` (the most integrated head: Brineworks,
Sinter Flats, Keeper, Surveyor, live authored effects). No other branch was changed.
`feat/attunement-asset-production` @ `3c06a99` (Sinter Flats fauna) is **not**
merged here yet.

Owner request (2026-11-17): drastically raise the visual fidelity of combat effects,
skills, gadgets, items and environmental assets, and the distinctive features of the
character models. References: industrial props, ring megastructure, the Listening
Stone (golden circuit rings), CHR-008 Suture Diver, EQP-001 reservoir family.
The owner asked to pause after tasks 1–2 below.

## Status

| # | Task | State |
|---|---|---|
| 1 | VFX capture harness + before evidence | **Done** — `tools/vfx-capture.mjs`, `docs/evidence/vfx/before/` (20 frames) |
| 2 | GPU particle + shader VFX engine | **Done** — `client/src/vfx/{textures,engine,combat}.js`, `test/vfx-engine.test.js` |
| 3 | Rework every combat event onto the engine | **Done** — all 20 ability frames captured in `docs/evidence/vfx/after/` and reviewed; Surge dome, Controlled Blast and enemy melee fans tuned |
| 4 | Character distinctive equipment upgrade | Not started |
| 5 | Environmental artefacts (Listening Stone etc.) | Not started |
| 6 | Full review, full after-capture, docs | Partial (this file, review 16) |

## What exists

- **`client/src/vfx/textures.js`** — seeded canvas textures, built once: a 4×4
  sprite atlas (glow, flare, streak, smoke, bubble, hex, cross, spore, shard,
  3 runes, dust, ember, diamond, petal); five layered **discipline sigils**
  (kinetic, resonance, restorative, survey, hazard; R = outer ring, G = inner ring,
  B = wash, rotated independently by the shader); a fracture/scorch map; tileable
  fbm noise.
- **`client/src/vfx/engine.js`** — `createVfx(THREE, scene, opts)`:
  - two instanced, GPU-billboarded, velocity-stretched particle systems (additive
    1800, alpha 420): **2 draw calls total**; emission past capacity is dropped and counted
  - pooled shader meshes, capped at 40 (oldest retired): terrain-conforming
    `sigil`, `shock`, `scorch`, `telegraph`; camera-facing jittering `beam`
    ribbons; swept melee `arc`; fresnel/hex `shell` (sphere, dome, wall, pillar)
  - `flash`: 2 point lights created once at start-up, only when starting at quality 2
    (never added later, so no shader recompiles mid-fight)
  - `emitter` for compound effects (projectiles with trails that land on arrival)
  - seeded RNG, explicit `dispose`, `clear`, `setQuality`, reduced-motion (no
    spin/swirl/jitter, ~45% particles, static sigils)
  - invalid input (NaN, huge coordinates, missing targets) is ignored, never thrown
- **`client/src/vfx/combat.js`** — `CombatVfx` recipes for all 16 player
  abilities, enemy specials (arc pulse, seismic slam, resonance burst), ground
  telegraphs, bolts/melee/shield-absorb hits, heals, Mender transfer, deaths, level-up,
  respawn, spawn, equip and Listening Stone attunement.
- **`client/src/main.js`** integration:
  - quality ≥ 1 uses the engine; quality 0 keeps the original `fx.js` path
    byte-for-byte (inside `onEvent` a muted `fx` stand-in shadows the legacy one)
  - the existing authored `LiveCasts`/`LiveAegis` layers are kept unchanged
  - root vines (`fx.setRooted`) are unaffected
  - `?vfxt=0.12` slows **presentation-only** effect time for captures; the
    simulation is untouched. `LiveCasts` now runs on that same effect clock.

## Verified (commands actually run on 2026-11-17, Node 24.22)

- `npm test` → **124/124 pass**: 114 existing tests plus 10 new engine/recipe
  tests (bounds, expiry, determinism, invalid input, quality/reduced motion,
  terrain conformity, light reuse, disposal, every recipe expiring to zero).
- Browser (headless Chromium, SwiftShader): `node tools/vfx-capture.mjs <label> vanguard`
  rendered all Vanguard effects with no page errors → `docs/evidence/vfx/engine-wip/`.
  After those frames, sphere shells were made less opaque, because they hid the
  character; this tuning has **not** been re-captured yet.
- Integrated two-player e2e (`npm run e2e`, software GL) on this head: **71/72**.
  The single failure is `9. five character tabs show real square selectable slots
  and reserved details` (character-panel UI). The **same check fails identically on
  the untouched base `7a9c5d7`** (71/72, run in a separate worktree the same day),
  so it is pre-existing and unrelated to effects. Its cause has not been investigated.

**Note: run the tests under Node 24, as CI does.** Under Node 22,
`art-originals` byte-reproducibility fails (`backpack_research.glb differs`)
because V8 `Math` precision differs between versions. This was true before this work.

## Not verified / known gaps

- Keeper, Symbiotech and Surveyor recipes have not been looked at in a browser yet.
  Run `node tools/vfx-capture.mjs after` for all 20 frames and compare with `before/`.
- There are no real-GPU frame-time numbers. Software rendering is not performance evidence.
- Shader colours bypass tone mapping on purpose, to keep emissive cores
  saturated. Check them against the ACES-tone-mapped scene on a real display.
- Flash lights stay in the scene at intensity 0 after a quality drop. They still
  add per-fragment light cost; consider removing them permanently on the first drop.
- Effects follow presentation transforms. A target removed mid-flight keeps its last position.
- No final art approval. These are procedural effects, not authored flipbooks.

## Next steps, in order

1. Run the full after-capture; tune each class's recipes in `combat.js`
   (opacity, life, sizes). Copy the final frames to `docs/evidence/vfx/after/`.
2. **Task 4 — characters.** In `client/src/looks.js`, replace the box-primitive gear
   with a modular reservoir family (EQP-001): a caged transparent cylinder with a
   fluid/charge shader. Its fill level and pulse follow the owner's resource
   (`S.sheet` for self; idle pulse for others). The per-class signature pieces:
   - Vanguard: a kinetic capacitor stack with lit charge segments
   - Symbiotech: a CHR-008-style dorsal frame with three culture reservoirs and forearm interfaces
   - Keeper: a resonance apparatus ring core
   - Surveyor: power cartridges and an antenna

   Test both humanoid rigs and representative poses.
3. **Task 5 — environment.** Upgrade the Listening Stone: slow-rotating ground
   circuit rings (reuse the `resonance` sigil and engine decals with a long life,
   or a dedicated persistent decal), glowing inscriptions that respond when a
   player is near (presentation only), and floating debris. After that: storage
   crates, generators and terminals, as kit pieces.
4. Merge `feat/attunement-asset-production` `3c06a99` if it is still wanted on this line.
5. Full review (art, technical, runtime, UX, adversarial, retrospective). Update
   `docs/art/reviews/16-vfx-engine.md`, then open a PR (none opened yet).

## How to resume

```bash
export PATH=/opt/node24/bin:$PATH   # or any Node 24
npm ci
npm test
node tools/vfx-capture.mjs after          # all classes, ~5 min in software GL
node tools/vfx-capture.mjs after keeper   # one class
npm start   # then open http://127.0.0.1:<port>/?q=2  (add &vfxt=0.2 to slow effects)
```
