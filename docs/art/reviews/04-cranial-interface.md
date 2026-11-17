# 04 — Curved cranial neural interface

Reference V/VI, AUG-046: curved mechanical rail near temple/ear, several interface points and short rear extension. Model origin near temple, outward X; mirrored variants, Head-bone attachment only.

Simulated roundtable:
- Art: small visible prosthetic rather than massive helmet or glowing face.
- Modelling: open partial arc, connector housings; no full metallic band obstructing eye.
- Runtime: geometry detail intended for inspection; scale-down or hide at distance.
- UX: preserve face and hairstyle; use optional appearance attachment, not identity/trait locking.
- Adversarial: correct side matters; skin and ear clipping unresolved. Head-specific offsets required rather than a hardcoded universal position.
- Retrospective: rejected extensive full-head web because mannequin head contours and facial animations have not been validated.

Executed checks: GLB structure, accessor ranges, finite positions and unit normals, repeat byte equality, extent and triangle budget, invalid input rejection. Neutral software preview generated, not WebGL or final art acceptance.
- cranial_interface_right: 672 triangles, 3 material batches, 67248 bytes; bounds -0.025, -0.079, -0.040 to -0.001, 0.046, 0.047 m.
- cranial_interface_left: 672 triangles, 3 material batches, 67240 bytes; bounds 0.001, -0.079, -0.045 to 0.025, 0.046, 0.047 m.

## Cross-package retrospective
The neutral inspection showed a disconnected lower rail and a mirrored ring orientation that changed fore/aft placement. Added explicit bridges from the rail to both endpoints and held the ring orientation constant across mirrored X sides. Regenerated, structurally checked and compared mirrored bounds; still requires real head fit.
- cranial_interface_right: 728 triangles, 72624 bytes.
- cranial_interface_left: 728 triangles, 72616 bytes.

## Visual revision v2
Kept low-profile partial rail and temple origin; smoothed contacts, added insulated lead, soft-contact pads, recessed indicators and a ceramic service cover. Embedded material maps and minimized brightness. Simulated review: art—recognizable wearable interface without head-enclosing bulk; modeling—mirrored bounds checked, skin fit unknown; runtime—small static geometry; UX—details primarily inspectable up close; adversarial—repeat bytes and structural checks; retrospective—avoid detail density that cannot be read at normal camera distance. Actual fit and artistic acceptance pending.
- cranial_interface_right: 2176 triangles, 12 maps.
- cranial_interface_left: 2176 triangles, 12 maps.
