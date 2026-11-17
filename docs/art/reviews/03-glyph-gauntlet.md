# 03 — Glyph projection gauntlet

Reference: Counterglyphs / The Unstrike, arm-mounted interface. Local X-aligned cuff with two open bracelets, dorsal housing, selector and tip emitter. Separate left/right versions; attach only to lower arm, not hand.

Simulated roundtable:
- Art: recognizable working instrument rather than magic bracer; restrained cyan emitter and ochre rails.
- Modelling: open cuffs, mirrored distal emitter, no rigid geometry spanning wrist.
- Runtime: flat-shaded static model; emitter geometry independent from the actual spell effect.
- UX: emitter faces the hand end; no implication that firing is tied to a particular input or class.
- Adversarial: invalid hand rejected; fit through all forearm poses and clipping against clothing remain open.
- Retrospective: traded intricate moving mechanical fingers for a single-bone attachment. A mechanical cuff is feasible with present rig.

Executed checks: GLB structure, accessor ranges, finite positions and unit normals, repeat byte equality, extent and triangle budget, invalid input rejection. Neutral software preview generated, not WebGL or final art acceptance.
- glyph_gauntlet_right: 1152 triangles, 8 material batches, 117284 bytes; bounds -0.149, -0.068, -0.069 to 0.105, 0.108, 0.069 m.
- glyph_gauntlet_left: 1152 triangles, 8 material batches, 117276 bytes; bounds -0.105, -0.068, -0.069 to 0.149, 0.108, 0.069 m.
