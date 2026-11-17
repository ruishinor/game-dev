# 02 — Kinetic capacitor harness

Reference: reinforced plate, kinetic buffering and visible power hardware; extends existing Vanguard equipment. Each module is local, static and independently mountable: spine to spine_03, shoulder to each upperarm, coil to each lowerarm, knee to each calf, visor to Head. Do not attach the whole harness to one bone. Coil axis X matches bind-pose arm. Existing charge animation remains authoritative.

Simulated roundtable:
- Art: functional storage rails and amber indicators; avoid a solid glowing body.
- Modelling: split five parts for joints. Open forearm annulus avoids a solid cylinder through the arm. Rear rack has exposed capacity indicators.
- Runtime: rigid part instances, shared materials; no alpha. Do not animate whole coil geometry as if it changed hit volume.
- UX: rear power state is potentially readable in third person; actual mode indication must not rely on colour alone.
- Adversarial: check budget, finite geometry, invalid module, deterministic output. Shoulder/knee fit and model vs armour clipping unverified.
- Retrospective: simplified force apparatus to rigid single-bone components instead of an unvalidated powered exoskeleton. Do not replace existing equipment until attachment and charge-state review.

Executed checks: finite positions, unit normals, accessor ranges, GLB header and lengths, triangle budgets, per-file extent, repeat byte equality, invalid input rejection. Neutral software preview generated. This is not a WebGL render, compatibility test or visual acceptance.
- capacitor_spine: 624 triangles, 7 material batches, 65720 bytes; bounds -0.095, -0.176, -0.144 to 0.095, 0.176, 0.012 m.
- capacitor_shoulder: 168 triangles, 5 material batches, 20360 bytes; bounds -0.095, -0.040, -0.095 to 0.095, 0.077, 0.108 m.
- capacitor_coil: 1368 triangles, 4 material batches, 134832 bytes; bounds -0.060, -0.076, -0.076 to 0.060, 0.097, 0.076 m.
- capacitor_knee: 124 triangles, 4 material batches, 15268 bytes; bounds -0.063, -0.065, -0.017 to 0.063, 0.065, 0.047 m.
- capacitor_visor: 112 triangles, 3 material batches, 13456 bytes; bounds -0.075, -0.017, -0.028 to 0.075, 0.017, 0.019 m.

## Visual revision v2
Five original rigid modules retain mount axes/IDs; layered service rails, insulated coil collars, fasteners, shoulder and knee rail geometry and segmented visor added. Embedded PBR maps and true chamfers. Art: prioritize believable hardware with restrained lights. Modeling: keep open annulus and separate joints. UX: retain module function; tiny details may disappear at gameplay distance. Adversarial: structural, extent, budget and deterministic bytes checked, no rig fit proof. Retrospective: this remains a stylized refinement, not concept-art fidelity; textured WebGL review pending.
- capacitor_spine: 1464 triangles, 18 maps.
- capacitor_shoulder: 636 triangles, 15 maps.
- capacitor_coil: 2120 triangles, 12 maps.
- capacitor_knee: 412 triangles, 15 maps.
- capacitor_visor: 352 triangles, 9 maps.
