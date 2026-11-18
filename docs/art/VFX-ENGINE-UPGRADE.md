# VFX engine upgrade: motion, trails, lightning, comfort settings

Branch `feat/vfx-engine-upgrade`, based on `preview/playtest-brineworks` @ `1bdd89a`.
Everything here is presentation only. Effects start from authoritative server
events (`client/src/vfx/combat.js`) and expire on their own. Nothing reads or
changes simulation state.

## Audit of the existing engine (`client/src/vfx/engine.js`)

- **Already in place**:
  - Two instanced CPU particle pools: velocity stretch, gravity, drag,
    attraction and swirl.
  - Pooled shader layers: terrain sigils, shocks, scorch, hazard telegraphs,
    jittering beams, swept arcs, fresnel/hex shells, areas and auras.
  - Flash lights, created once.
  - Staged timelines (anticipation to residue).
  - Quality and reduced-motion budgets.
- **Missing**:
  - Organic motion (everything moved ballistically).
  - Soft contact of smoke with the ground.
  - Continuous trails. Projectiles were particle dots.
  - Electrical discharge with structure.
  - A player-facing control for effect intensity or flashes.

## Added

| Capability | API | Cost |
|---|---|---|
| Curl-noise turbulence | `burst({ turb, turbScale })` | A divergence-free trigonometric curl field, time-advected, applied in the CPU step. No extra draws. |
| Ground soft-fade | `burst({ soft })`; alpha particles default to 0.35 m | One `groundHeight` call per flagged particle |
| Ribbon trails | `trail({ follow, length, life, fade, width, color, color2, style })`; styles: energy, smoke, organic (beaded pulses) | A camera-facing strip of 32 points, expanded in the vertex shader. One draw each, pooled (`MAX_RIBBONS` = 24); the oldest is recycled. |
| Branching lightning | `lightning({ from, to, life, rate, jag, branches })` | Midpoint-displacement channel plus forks, re-struck at `rate`. Forks are dropped below high quality and under reduced motion. |
| Effect intensity | `setIntensity(level, calmFlashes)` | Scales emission, particle, ribbon and shader-layer alpha, and flash lights. Hostile telegraphs are exempt (`track(..., warning)`), so warnings never dim. |

## Applied to gameplay

- **Projectiles**: every bolt now leaves a discipline-shaped trail.
  - Kinetic and hostile: hot streak.
  - Symbiotech: beaded organic filament.
  - Keeper: a double resonance ribbon.
  - Surveyor: a thin trace.
  - Per-frame ember particles drop from 3 to 2.
- **Graviton Tether**: forked violet discharge along the pull, on top of the
  beam.
- **Discharge**: three short arcs earth from the capacitor core to the ground
  ring before the shock wall.
- **Restorative rising motes and kinetic dust**: turbulence. Dust also
  soft-fades into the ground.
- **Listening Stone** (identity kept):
  - Slow inscribed resonance waves travel outward from the base while someone
    is near. The cadence eases slightly at full intensity rather than speeding
    up, which keeps the established slower maximum.
  - A soft scrolling light column around the shaft.
  - Motes eddy on their orbits.
  - The existing rings, arcs, debris and beam are unchanged.
- **Settings**: Ability effects (Full, Reduced, Minimal) and "Limit bright
  flashes" are stored per browser. The panel states that enemy warnings stay
  fully visible.

## Verification

- `node --test test/vfx-engine.test.js`: 24/24. New checks cover:
  - trail follow, fade and pooling;
  - lightning channel plus forks, cleanup, and no forks under reduced motion;
  - bounded turbulence;
  - intensity scaling with telegraph exemption.
- `node tools/vfx-capture.mjs` produces in-game frames. They are SwiftShader
  software renders, so they show appearance, not performance.

## Limits

- The simulation is still CPU. With pool caps of 1,800 + 420 particles, the
  measured bottleneck is fill, not simulation, so moving it to the GPU was
  not justified yet.
- Soft particles use terrain height, not a depth prepass, so contact with
  props is still hard-edged.
- There is no screen-space distortion (heat haze, refraction). It needs a
  scene colour copy that the renderer does not yet produce.
