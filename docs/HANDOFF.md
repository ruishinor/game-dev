# Attunement — handoff

> **Latest (2026-11-17):** combat VFX engine work is paused for manual pick-up on
> branch `charlie/confident-wright-b2bh7j`. Start with
> [`art/VFX-ENGINE-HANDOFF.md`](art/VFX-ENGINE-HANDOFF.md). The text below is older.

Last updated 2026-11-16, at a pause in the visual-upgrade assignment
(branch `ccr-9a6736d4-kufz9x`). Work stopped for usage limits, not for a
blocker. This file says what exists, what was verified, and what to do next.

## State in one paragraph

The game is **playable and unchanged in behaviour**: server-authoritative
simulation, WebSocket multiplayer, the Three.js client, two classes, companion,
build system and persistence all work as at commit `7638a58`. A complete GLB
asset pipeline and the client modules that use it now exist and are verified
in isolation, **but the game itself does not use them yet** — `client/src/main.js`
and `client/src/scene.js` still draw the old procedural models and world. The
next step is wiring, not invention.

## Verified (commands actually run on 2026-11-16)

| Check | Result |
| --- | --- |
| `npm test` (simulation + network, 49 tests) | 49 pass, exit 0 — run after all changes below |
| `npm run e2e` (two real browsers, 49 checks) | 49 pass, exit 0 — run on the **unmodified** game only (baseline). **Not re-run since**; `index.html`, `server/index.js` and the `look` field changed afterwards |
| `npm run assets:fetch` | All 8 source files match their recorded SHA-256 |
| `npm run assets:build` | 13 outputs, 5.97 MB, exit 0 |
| `npm run assets:preview` | 6 contact sheets, no script errors, no procedural fallbacks, exit 0 |
| Static server | GLB/WebP served; loader modules allow-listed; `/assets/`, `/tools/`, `/.asset-cache/` and traversal return 404 (checked by hand, not yet in a test) |

Rendering was only ever done in headless Chromium with software WebGL. There
are **no real-GPU performance numbers** and **no human has played either
version**. Screenshots are agent evidence, not acceptance.

## What is new

- **Asset pipeline** — `assets/sources.json` (provenance ledger),
  `assets/recipe.mjs`, `tools/assets/{fetch,build,preview}.mjs`,
  `tools/assets/lib/*`. See [`ASSETS.md`](ASSETS.md).
- **Built assets** — `client/assets/` (committed, all CC0-derived or original).
- **Client modules, not yet used by the game**
  - `client/src/assets.js` — manifest, promise-cached bundle loading, shared
    instances, disposal.
  - `client/src/animator.js` — base loop + prioritised one-shots on
    `THREE.AnimationMixer`, upper-body layering, distance-based update interval.
  - `client/src/looks.js` — appearance data and bone-attached gear:
    `vanguard_plate`, `red_rucker`, `conductor`, `archivist`.
  - `client/src/characters.js` — `createModel(assets, meta)`: GLB humanoids,
    Mire Skitter, Mender Symbiote, Sentinel, Warden, each falling back to the
    procedural model in `models.js` if an asset is missing.
  - `client/preview.html` + `client/src/preview.js` — browser asset preview.
- **Server** (`server/index.js`) — `.glb`/`.webp` MIME types; an allow-listed
  `/vendor/three-addons/` mount (4 files); CSP extended with the import map's
  hash, `wasm-unsafe-eval` (Meshopt decoder) and `blob:` (embedded textures);
  immutable caching for `/client/assets/*?v=<hash>`.
- **Cosmetic `look`** — `shared/content.js` `LOOKS`; stored per character
  (`server/store.js`), accepted on `create` (`server/net.js`), sent as `a` in
  entity meta and in the sheet (`server/sim/game.js`). Never affects rules.
  Unknown values fall back to the class default.
- **Research** — [`ENGINEERING_EXTRACTION.md`](ENGINEERING_EXTRACTION.md):
  what was taken from VanillaGL / Wowser Scene / benilla, with source paths.
- **Evidence** — `docs/evidence/before/` (8 baseline screenshots),
  `docs/evidence/assets/` (contact sheets).

## Next steps, in order

1. **Wire models into the game** (`client/src/main.js`).
   - Create one `Assets`, `await assets.init()` and
     `assets.preload([...CHARACTER_BUNDLES, 'sanctum', 'nature'])` before
     `buildWorld`; show progress on the login card and keep **Enter** disabled
     until done (the e2e clicks `#enter` and will wait).
   - `addEntity`: replace `MODEL_FACTORIES[meta.c]()` with
     `createModel(assets, meta)`; `removeEntity`: call `model.dispose?.()`.
   - Events: where `s.attack = 1` / `s.castAnim = 1` / `d.hit = 1` are set,
     also call `model.trigger?.('attack' | 'cast' | 'hit', e.ab || e.k)`.
   - `updateEntities`: pass `fwd` (velocity · facing, for backpedal) and
     `interval` (`animationInterval(distance, inView, changed)`) in `st`; add a
     per-entity frustum sphere test and set `holder.visible` from it (skinned
     meshes have `frustumCulled = false`).
   - Set `scene.environment = makeEnvironment(renderer)` (already in
     `scene.js`) — the kit's metals are black without it.
   - Login: offer `LOOKS[cls]` when a class has more than one and pass the
     choice to `net.create(name, cls, look)`.
2. **Rebuild the scene** (`client/src/scene.js`): map each `PROPS` type to kit
   pieces (see the plan in `ENGINEERING_EXTRACTION.md` rows 11, 13, 14) —
   Sanctum from `sanctum.glb` (platform tiles, `Column_Hollow` pylons,
   `Column_Large_Straight` beacon, consoles, crates, lights); Sporefield from
   `nature.glb` (scaled `Mushroom_Common` as spore trees, `pod`, twisted trees
   at the edge, ground cover). Keep `shared/world.js` colliders as they are.
   Textured terrain: `ground_albedo` × existing vertex colours + `ground_normal`.
3. **Camera and readability** (`client/src/camera.js`): camera collides with
   terrain and architecture only; vegetation and pylons fade when they cross
   the camera→player line.
4. **Tests**: add a network test for `look` (stored, relayed, invalid falls
   back); add an asset test (every manifest entry exists, has a ledger source,
   humanoid has the clips `characters.js` names); add the new static-file
   rules to the existing HTTP test. In `test/e2e/play.mjs`, the check
   "11. the other session sees the same enemy health" passes on
   `e.row.h <= hp + 1`, a threshold, not agreement with the server — compare
   B's value with `Math.ceil(sk.hp)` once both have settled.
5. **Validate**: `npm test`, `npm run e2e` (expect to adapt nothing but timing;
   investigate anything else), new screenshots into `docs/evidence/after/`,
   compare with `before/`.
6. **Deliver**: update README controls/known issues, open a PR. Do not merge
   with a failing check.

## Known rough edges in the new assets

- Red Rucker: rucksack straps stand off the torso; the painted muscle lines
  are faint; the mannequin's joint panels are visible as slightly darker bands.
  Shape, colour, shorts, star, shoes and pack follow the owner's references;
  the abdominal definition of the illustrations does not come through yet.
- Clothing shells have open edges (a 1–2 cm gap is visible up close).
- A humanoid is ~15–20k triangles, about 10k of them in the hands. No LOD.
- The Sentinel and Warden share one walker model at different scale and tint.
- Animation timing (`start`, `timeScale` in `characters.js`
  `HUMANOID_ACTIONS`) was chosen from stills and has not been seen in motion.

## Environment notes for the next session

- Asset hosts are only reachable from the cloud environment named `game-dev`
  (it allows opengameart.org, quaternius.com, polyhaven hosts and Google
  Drive). `.asset-cache/` is not committed; `npm run assets:fetch` restores it
  (about 270 MB). Node's `fetch` ignores the proxy there, so the script falls
  back to `curl` automatically.
- kenney.nl and poly.pizza answered HTTP 403 even when allowed; not needed.
- The owner's Red Rucker reference images arrived as an upload in the session
  and are deliberately **not** in the repository.

## Unchanged facts from the original slice

- **World** (`shared/world.js`): The Verdigris Reach — Sanctum, Sporefield,
  Derelict Relay, Resonance Vault, a hidden obelisk; deterministic terrain and
  colliders shared by server and client prediction.
- **Classes / companion / build system / enemies / progression**: see
  `shared/content.js`, `shared/build.js`, `server/sim/`.
- **Decisions**: Node + `ws`, plain ES modules, no build step for the game;
  server-authoritative everything; simulation has no I/O; persistence is one
  JSON file with atomic writes; no interest management (fine for 5–25 players).
- **Known gameplay limits**: balance comes from bots, not people; companions
  cannot be attacked; no facing or line-of-sight rules; no per-IP creation
  limit; no WebSocket origin check. Not production-ready; not deployed.
