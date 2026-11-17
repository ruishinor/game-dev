# 17 — Signature profession equipment (EQP-001 reservoir family)

These are simulated review perspectives, not independent human reviews.

Scope: `client/src/gear-kit.js`, `client/src/gear-recipes.js`, the integration in
`characters.js`, and slimmed legacy builders in `looks.js`. Presentation only.
Looks, profession rules and saved characters are unchanged.

- **Art:** the four professions now differ by silhouette, read from behind at
  gameplay distance, not only by tint:
  - Vanguard: banded kinetic accumulators and a glass charge cell
  - Conductor: a CHR-008 dorsal frame with three caged cultures whose interiors
    differ (strands, bubbles, particulate)
  - Keeper: a resonance ring core in a chrome frame (EQP-001 "resonance apparatus")
  - Surveyor: ribbed cartridges, a power cell and a survey mast

  Worn paint (chipped edges, seams, hazard bands, stencils, a medical cross)
  replaces flat colour. Emission stays restrained: there are lamps and fluids,
  but no glowing armour. The bodies are still the stock mannequin. Faces,
  anatomy and cloth were not addressed, and are the next major gap.
- **Modelling and rigging:** gear is built in bind-pose space and parented
  rigidly to `spine_03`, `Head`, `pelvis`, upper arms and forearms.
  - Shoulder pieces first stood up beside the head. Their inner edge sat inside
    the shoulder joint, so it swung upward in the idle pose. They now start
    outside the joint.
  - Clipping has been checked in idle only, from the back, front and three-quarter
    views (`docs/evidence/gear/`). Run, attack and cast poses, and both body
    rigs in motion, are **not** yet inspected.
- **Runtime:**
  - each look is built once, merged per (bone, material) and shared by every
    wearer
  - the only per-character materials are the fluid, segment and core shaders
  - per look: 13–22 draw calls and 3.6k–6.2k triangles (budget-tested); about
    +10–30 scene draw calls and +10k triangles per visible character in capture
  - not GPU-profiled

  Optimisation left open: one skinned mesh per material would cut the draw
  calls to about 8 per look.
- **UX:**
  - the local player's charge cell and segment column follow their own
    resource fraction
  - other players show an idle level that rises in combat; they never receive
    someone else's resource value
- **Adversarial:**
  - non-finite time or charge inputs are clamped
  - shared resources are flagged so that `disposeInstance` frees only the
    per-character shaders (tested)
  - a recipe failure logs a warning and leaves the character with its legacy gear
- **Retrospective:** merging per bone was chosen over separate meshes after the
  first Vanguard pass exceeded the 22-call budget (25 draw calls); materials
  were consolidated rather than the budget raised. Overlapping legacy pieces
  were removed instead of being layered under the new gear.

Executed: 4 Node tests. These cover bounds, finiteness, budgets, known bones,
sharing, per-owner state and disposal. Browser capture showed no page errors.
No final art approval.
