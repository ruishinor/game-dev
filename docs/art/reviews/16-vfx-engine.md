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
