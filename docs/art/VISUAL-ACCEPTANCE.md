# Visual acceptance matrix (2026-11-18)

This is a structured review aid, not a measurement. The scale runs 0 to 5:

- 0: broken
- 1: technical prototype
- 2: functional but underdeveloped
- 3: coherent independent quality
- 4: strong professional quality
- 5: comparable to the selected commercial reference

All evidence was rendered in-game with SwiftShader software WebGL; nothing
here is offline or post-processed. The reference games were not
screen-captured under matched conditions in this environment, so the
benchmark columns are reviewer judgement against publicly known gameplay
presentation and are marked as such.

| Dimension (weight) | Before | After | vs modern WoW (minimum) | vs Ashes of Creation (aspiration) | Evidence |
|---|---|---|---|---|---|
| Facial anatomy and geometry (15%) | 0: no faces (mannequins) | 2.5: anatomically plausible MakeHuman heads; 22 identity shapes; stylised base topology | Approaching: proportion and readability are there, artistic stylisation is not | Substantially below: no sculpted secondary forms or scanned detail | `tools/dev/face-capture.mjs` (local, git-ignored) |
| Facial materials, eyes, hair (15%) | 0 | 2: tinted irises, wrap-scatter skin, painted brows and stubble, shell hair (short styles only) | Below: hair range and brow quality | Substantially below: no strand hair, SSS or skin microdetail at close range | same |
| Racial differentiation and identity (15%) | 1: two mannequins, identity only through gear | 2.5: individual faces from name plus player-chosen frame, skin and hair; Colonist, Veyran (smooth crimson, tracery) and Mirekin (mottled, veins, chitin crest) differ in surface and silhouette at the head | Approaching for head identity. Below for body silhouette: all races share proportions and posture. | Below | `APPEARANCE-RACES.md`, `tools/dev/appearance-capture.mjs` |
| VFX sophistication and composition (20%) | 3: staged timelines, pooled layers | 3.5: turbulence, trails, branching lightning, intensity tiers | Meets or exceeds on composition and differentiation | Below: no GPU simulation, distortion or volumetrics | `tools/vfx-capture.mjs` (local) |
| Animation and physical presence (10%) | 2: library clips, no face | 2.5: blink, gaze, saccades, head look-at, expressions | Below: no bespoke locomotion or racial movement | Substantially below | captures |
| Lighting and materials (10%) | 2.5 | 2.5: unchanged except skin and eyes | Approaching | Below | — |
| Combat readability (5%) | 3 | 3.5: telegraphs protected from effect reduction | Meets | Approaching | tests |
| Environmental coherence (5%) | 3 | 3: Listening Stone layering only | Approaching | Below | — |
| Overall integration (5%) | 2 | 2.5 | Approaching | Below | — |

Character faces are scored on their own and are not offset by VFX strength.
Races were found on the isolated INT-03 branch after the first assessment.
Veyran is established lore; Mirekin comes from that branch's design and needs
owner confirmation.
The weakest areas, and the largest return on further work, are hair (card or
strand geometry for longer styles), skin close-up detail, and bespoke
locomotion.

## Measured cost (software GL only, 2026-11-18)

Both builds were measured back to back in the same container. Setup:
headless Chromium with SwiftShader software WebGL, 1280×720, the spawn hub,
quality locked. Frame time is the client's own `frameMs`, sampled at 10, 12
and 14 s after entering the world, while it was still settling.

- Baseline: `1bdd89a`, before this programme.
- Final: the rendering merged in #79.

This shows relative cost only. **It does not predict hardware-GPU frame
rates, and no hardware measurement has been taken.**

| Preset | Class | Frame ms, baseline | Frame ms, final | Triangles | Draw calls |
|---|---|---|---|---|---|
| High | Vanguard | 82 / 57 / 44 | 71 / 54 / 45 | 444k → 518k | 647 → 655 |
| High | Symbiotech | 102 / 71 / 52 | 72 / 52 / 40 | 454k → 545k | 659 → 676 |
| Medium | Vanguard | 63 / 47 / 36 | 47 / 37 / 32 | 290k → 327k | 405 → 411 |
| Medium | Symbiotech | 59 / 46 / 37 | 47 / 39 / 34 | 295k → 340k | 414 → 420 |
| Low | Vanguard | 17 / 18 / 20 | 13 / 14 / 13 | 187k → 223k | 387 → 387 |
| Low | Symbiotech | 17 / 18 / 18 | 19 / 17 / 19 | 191k → 236k | 394 → 396 |

Frame time stays within run-to-run noise of the baseline. Geometry rises
13–23% and draw calls by at most 3%.

## Status

- Faces (#73), the VFX engine (#74) and appearance with races (#79) are
  merged.
- Since #73, painted look maps on the body render for the first time,
  because the earlier build dropped body UVs. Red Rucker's head mark then
  read as a mouth, which #117 fixes.
- New painted body maps need an in-game check.
- The first owner-hardware measurement is the next performance step:
  `ATTUNEMENT_GPU=1 node tools/dev/face-capture.mjs <dir>`, or play and read
  the fps shown beside the latency indicator.
