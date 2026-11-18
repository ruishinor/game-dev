# Discharge and Resonant Aegis composition

Base was Brineworks `eda2bce`. Existing art review 16 already covers textures,
emitter budgets and authoritative event coverage. This pass adds a bounded
presentation timeline to that engine and revises two live effect recipes.

| Problem | Inspected implementation and license | Transfer into Attunement | Validation |
| --- | --- | --- | --- |
| Several primitive lifetimes start together | Three.js r187 animation mixer and action source, MIT | Take discrete cue times and a caller-owned clock. Schedule up to 12 authored stages without importing a second animation system. | Ordering, simultaneous cues, cancellation and 24-timeline capacity checks. |
| Enqueueing from an emitter can evict the item being iterated | Attunement engine's transient item array, proprietary | Iterate a bounded snapshot over an insertion-ordered Set; retire resources once. | Full-capacity emitter regression and pooled light demotion. |
| Field contact has no spatial feedback | Attunement `live-aegis.js` and shell shader, proprietary | Use the same visual dome radius and localize a propagating band around the incoming direction when the server reports absorption. | Confirmed server hit, literal shield reduction and browser-shader inspection. |

Discharge now breaks into an amber core release, a thin terrain-conforming
front with a brighter filament and offset echo, and a cooling imprint. Aegis
starts at the ground and builds a blue field that reads separately from the
warm release. The impact follows the shield receiver, and the localized
reaction remains visible when the hit removes the last shield point. The
ground effect uses the server radius. Neither the visual radius nor the
timeline participates in targeting, mitigation, health or movement.

Run these stages against a local, ephemeral server with the locked Playwright
dependencies and installed Chromium. Frames are kept locally under
`docs/evidence/vfx/<label>/` under the repository evidence policy.

```sh
node tools/vfx-capture.mjs composition-final discharge-stages
node tools/vfx-capture.mjs composition-final aegis-stages
node tools/vfx-capture.mjs composition-final concurrent-stages
npm test
```

Observed in Chrome/SwiftShader at quality 2, 960 × 600. The amber front and
blue field remain legible at gameplay distance and when two clients cast
together. The mixed frame peaked at 11 transient items, 237 particles and two
timelines in the captured samples. At 1.77 s the discharge scorch still fades
and the sequence and particles have retired. The Aegis fixture extends the
life of the already-granted shield for software capture, then sends a real
12-point shield-only hit through `dealDamage`. The UI and shield pool confirm
absorption. The scheduled discharge previously competed with an older purple
arc layer, so the richer recipe now owns the effect and a full pool can still
fall back to the old path. The concurrent frame has readable silhouettes, but
overlap between two Aegis grids is still busy and the terrain ring has limited
thickness on dark ground. Assessed at about 6/10 for this slice. Hardware GPU
timing, larger groups and uninterrupted full-speed motion footage are open.

Authority/disclosure review. Client code consumes the existing event stream
and entity transforms. The inspection switch steps presentation time only.
No new payload, directory mount, dependency, asset license or player data is
introduced. Server regressions and the effect lifecycle are covered by the
Node suite. The staged browser uses synthetic guest players.
