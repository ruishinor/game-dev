# 16 — Combat VFX engine (particles, sigils, shells, beams)

These are simulated review perspectives, not independent human reviews.

Scope: `client/src/vfx/` and its wiring into `client/src/main.js`. The engine is
presentation only; no server, rules, timing, range or authority code changed.

- **Art:** effects now read by discipline through their *shape*, with colour as
  a secondary cue:
  - kinetic: segmented capacitor sigil, crescents and shock walls
  - resonance: runic sigils and hex shells
  - restorative: cell-colony sigils, rising crosses and spores
  - survey: measurement sigils, scan bubbles and drilling beams
  - hostile: hazard stripes, scorch and dust

  This follows the Listening Stone reference (layered circuit rings). The first
  browser pass showed over-opaque sphere shells that hid the wearer, so those
  were reduced. Ubiquitous neon is still a risk if several casts overlap.
  Re-check this after the full capture.
- **Technical art:** two instanced draw calls for all particles. Velocity
  stretching is done in the vertex shader. All textures are seeded canvas
  textures generated once. Decals follow the terrain only when the point stands
  on it (platforms stay flat).
- **Runtime:**
  - hard caps: 1800 + 420 particles and 40 shader items
  - flash lights are fixed at creation and absent below quality 2
  - quality 0 keeps the legacy path

  There are no GPU timings yet.
- **UX:** area effects draw their radius from the same server radius as before,
  so ground readability is kept. The hostile telegraph keeps its fill-over-time
  meaning and gains an animated hazard sigil. Reduced motion removes spin, swirl
  and jitter and thins particles. Bolt impacts now land on arrival rather than at launch.
- **Adversarial:**
  - NaN or huge coordinates and missing endpoints are ignored
  - a recipe that throws during a tick is retired
  - effects whose target despawned keep the last valid transform
  - dispose is idempotent
  - capacity overflow is counted, never unbounded
- **Retrospective:** a WebGL post-process bloom was rejected, because it would
  mean new vendor addons, a CSP allow-list change and a full-screen cost on
  weak GPUs. Halo sprites and additive cores were used instead. The existing
  authored `LiveCasts` layer was kept rather than replaced. Whether to keep both
  layers should be decided after the full visual review.

Executed: 10 Node tests (in a 124/124 suite on Node 24). Vanguard browser capture
showed no page errors. Other classes have not been inspected in browser yet.
No final art approval.

## Full capture and tuning pass

All 20 ability frames for the four professions were captured in
`docs/evidence/vfx/after/` and compared with `before/`. Every recipe renders
without page errors.

Adversarial findings and fixes:
- The Overgrowth Surge dome was a milky hemisphere hiding the fight. It is
  now a faint boundary.
- Controlled Blast washed the frame out to white (flare 1.4× radius, light
  intensity 30). The flare is now capped at 4 m and the light halved.
- Enemy melee fans were larger and more opaque than player strikes. They are now
  smaller and fainter, so the player's crescents stay dominant.

Retrospective:
- The capture harness had to keep the staged player alive, because software
  frames take seconds while several enemies are aggroed. This is harness setup
  only.
- The authored `LiveCasts` lines still draw underneath. In captures they add
  engineered structure rather than clutter, so they are kept.
- Remaining risk: several large casts overlapping in a group fight. This has
  not been captured.

## Coverage pass: no effect left on the original look

Brief: every effect without a new-engine version kept its original look, so close
those gaps and keep up with the rest of the integrated line.

**Audit** (every `fx.*`, `authored()` and status path in `main.js` at quality ≥ 1):
- Inside `onEvent`, every event and `fx` kind already had a recipe. The fallback
  only fires for kinds that are not yet known.
- The real gaps were outside the event switch:

| Gap | Fix |
|---|---|
| Statuses: `ward`, `hot`, `bond`, `corrode` and `sap` were invisible; `root` showed only static legacy vines | `StatusVfx` (`client/src/vfx/status.js`) draws each status for exactly as long as the server's buff list reports it. Each has a distinct shape (see `status.js`). |
| Enemy wind-ups (`tele`) only filled a cast bar | Energy converges on the caster for the real channel time, with a hazard sigil and a release flare |
| Item and material gains (`loot` events and gain messages) had no visual | Gold acquisition motes and a sigil, deduplicated |
| Player defeat had no visual | Grey dust, a guttering shell and fading embers |
| Sinter ecology kinds (`alarm`, `guard`, `molt`, `repel`, `pounce`) from `feat/attunement-asset-production` | Dormant recipes |

**Engine:** persistent auras owned by the caller (cap 48). They follow an
entity and are torn down at quality 0.

**Guard:** a coverage test scans `server/sim` for every emitted `fx` kind,
adds every enemy special from `shared/content.js`, and fails if any lacks a
recipe. A new server effect therefore cannot silently fall back to the
original look.

**Adversarial:**
- Status handles are released when the buff ends, or when the entity dies,
  leaves view or is removed, or quality drops to 0. This is tested.
- Wind-ups are bounded by the server's channel time (capped at 8 s).
- Acquisition is deduplicated across the paired `loot` event and gain message.
- Every new path is presentation only.

**Retrospective — not merging `feat/attunement-asset-production`:** a trial
merge conflicted in `ai.js` (line-of-sight semantics), `ui.js` (target status
and neutral logic), `scene.js` and tests. Those are gameplay reconciliations
that the preview integrator has always handled in dedicated commits, so the
merge was aborted. Its effect kinds were covered instead.

**Browser:**
- 22 frames in `docs/evidence/vfx/after/`, including a real Sentinel wind-up
  followed by Arc Pulse, and the status layer on hostiles.
- Seen in passing, outside this scope: preview's radio panel overlaps the top
  of the HUD during play.

No final art approval.
