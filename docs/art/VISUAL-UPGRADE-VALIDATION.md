# Visual upgrade — reconciliation and validation (2026-11-18)

Branch `ccr-9a6736d4-kufz9x`, rebased in content onto `preview/playtest-brineworks`.

## Reconciliation

- The 2026-11-16 handoff (checkpoint `e5129fd`) was out of date. All later
  visual-upgrade work (GLB characters and creatures `b106078`, foreground fade
  `662fcb9`, culling/batching, VFX, gear) had already been committed, pushed and
  consolidated into `preview/playtest-brineworks`.
- Before this pass the branch tip `5f22d33` equalled brineworks commit `3667435`
  plus the AGENTS.md gate, which was also already in brineworks. The branch held
  nothing unique, and the session workspace had no uncommitted work.
  Brineworks was 131 commits ahead.
- Brineworks was merged in (`439520b`, tree identical to brineworks `1bdd89a`).
  Nothing was reset or discarded.

## Prior findings, re-checked against current code

| Finding | Status |
| --- | --- |
| Preview accepts missing models or clips | Resolved earlier: `tools/assets/preview.mjs` fails on a missing model, missing clip or procedural fallback |
| Playwright missing from devDependencies | Resolved earlier: `playwright` 1.63.0 is declared |
| Per-instance disposal ownership | Sound: bundle geometry and materials are flagged shared on load, `cloneMaterials` copies are owned, and `disposeInstance` frees only owned resources |
| Multiplayer assertion uses a threshold | Resolved earlier: e2e check 11 compares both clients with the exact server health |
| Unexpected procedural fallbacks | Detected for every entity with a GLB spec (preview, capture, e2e "renderer GLB"). The Sinter, Rift and Kestrel entities are procedural **by design** (no GLB spec exists), and the client's `model` field does not distinguish that from a fallback |
| Rig compatibility validation incomplete | **Was real; fixed.** `humanoid_f` plays `humanoid_m`'s clips, and gear attaches by bone name, but nothing tested either. Added an asset test (all 52 animated bones and every attachment bone exist on both bodies with the same parent; mutation-checked). A missing attachment bone now logs an error instead of dropping gear silently |
| Browser tests use only nonstandard mouse mode | **Was real, and hid a bug; fixed.** See below |

## Defects found and fixed in this pass

1. **Pointer-lock steering stopped after a few pixels (default input).**
   Chromium sends a cursor-warp `mousemove` as the lock engages: before
   `pointerlockchange`, with `buttons = 0` and a delta of several hundred
   pixels. `client/src/input.js` treated it as a button released off-screen and
   ended the drag. Every e2e session used `?nolock=1`, so this never surfaced
   in tests.

   Fix: track the pending lock request, and drop `buttons = 0` moves while a
   lock is pending or held. `mouseup` is always delivered in that state. The
   fix also removes the warp spike. The Red Rucker e2e session now uses the
   default configuration and checks three things: the lock holds, locked
   deltas steer the camera and the character together, and mouse-up releases
   the lock.

   Limitation: this was seen in headless Chromium. Headless synthetic moves
   cannot express relative motion under lock, so the check delivers locked
   deltas as `mousemove` events. Real-browser behaviour on the owner's laptop
   is unverified.
2. **Mire Skitters rendered dark brown, not pale chitin.** The donor material's
   metalness map averages 95% metal, which leaves almost no diffuse response.
   Under the Sporefield's dim sky the `0xf0e2cc` tint ("so it stands out")
   barely showed, and distant skitters were dark specks. Creature specs can now
   set `metalness` (it scales the map), and the skitter uses 0.3. Distant
   skitters now read against the violet ground. No lights, geometry or effects
   were added.
3. **`npm run capture` could never finish.** `join()` pauses existing clients,
   and the combat step then waited for paused client A to draw. `frames()` now
   unpauses the client it waits on. A harness-only keep-alive stops software
   frame times from letting the fight kill the players. That had produced death
   screens in the "Kinetic Ward" and "enemy destroyed" shots, so `shot()` now
   fails if the photographed player is dead. The final shot finishes A's actual
   Tab target rather than an assumed one.

## Verification (this session, software WebGL / SwiftShader)

| Command | Result |
| --- | --- |
| `npm test` | 272/272, exit 0 (final tree) |
| `npm run e2e` | 73/73, exit 0 (final tree; adds the default-input check) |
| `npm run capture` | 13/13 views, exit 0 (previously failed at view 07) |
| `npm run profile -- 2,0` | exit 0; software timings below |

Matched views are kept locally in `docs/evidence/visual-pass-2026-11-18/`.
That directory is git-ignored by the repository's evidence policy.

### Performance (software rendering — not a hardware result)

| Scene | Tier | Median interval | CPU frame fn | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Sanctum | 2 | 1483 ms | 53 ms | 644 | 446k |
| Sporefield | 2 | 1017 ms | 59 ms | 338 | 352k |
| Sanctum | 0 | 483 ms | 55 ms | 381 | 180k |
| Sporefield | 0 | 267 ms | 26 ms | 168 | 139k |

Rasterization dominates the software frame. The draw-call and triangle counts
are renderer-independent and moderate. The provisional target (30 fps minimum
on a Ryzen 7 8845HS / Radeon 780M at 1280×800) is **unverified** and needs the
owner to run `ATTUNEMENT_GPU=1 ATTUNEMENT_HEADED=1 npm run profile`. No
optimisation was made without a hardware measurement.

## Visual assessment (agent-inspected stills; not owner acceptance)

The Anarchy Online benchmark is **not** claimed as met. No side-by-side
comparison against AO reference captures was made in this session.

- **Sanctum**: the strongest area. The ring floor, beacon and pylon lattice read
  as one deliberate design. Gateway pillars frame and sometimes dominate the
  interior views (shots 03 and 04), but they do not cover the player.
- **Sporefield**: the mushroom trees are distinctive, but every one has the same
  shape and scale. The blue ground-cover patches read as flat decals. Varying
  scale, lean and cap tint per instance would address this at no draw-call cost.
- **Combat readability**: improved for skitters (above). Ability VFX (Kinetic
  Ward dome and glyph, Mending Graft) read clearly. Remaining issue: the selected
  enemy is identifiable only through the target frame and nameplate, with no
  clear in-world selection marker at gameplay distance. Creatures near the
  camera can also fill the lower-left foreground.
- **Characters**: class silhouettes and gear read at gameplay distance. Close-up
  humanoid and creature fidelity and animation variety remain below the
  long-term target (see HANDOFF known limits). Animation is unreviewed in
  motion: stills only, and no recordings were made.

## AGENTS.md review gate

1. **Authority and trust boundary**: unchanged. All changes are client
   presentation, input handling, tests and dev tooling. The server still
   computes every outcome. The capture keep-alive mutates server state from
   the dev harness only, as the e2e harness already does.
2. **Exposure**: no new payload fields, static mounts or modules served to the
   browser. The skitter `metalness` value is presentation metadata.
3. **Abuse cases**: input changes affect only local camera deltas, which the
   server validates as movement intent as before.
4. **Verification and limitations**: as listed above. Real-GPU performance,
   real-browser pointer lock, animation in motion and human play are unverified.

## Next steps (highest value first)

1. Owner: run the GPU profile and one play session on the laptop. Confirm that
   right-drag steering feels continuous with pointer lock.
2. Add an in-world selection marker for the current target (client-only, from
   existing `S.target`).
3. Per-instance variation for Sporefield flora (scale, lean, tint).
4. Short motion recordings of locomotion, attacks, casts, hit reactions and
   death for animation review.
