# Development diagnostics

One-off probes used while building the visual fidelity and appearance work.
None run in CI. Run them from the repo root with Node 24.

| Script | What it does | Found |
|---|---|---|
| `contact-sheet.py` | Tiles evidence frames into one review image (needs Pillow) | Used for every visual review in `docs/art/reviews/` |
| `measure-skull.mjs` | Skull ellipsoid from rest-pose skinned Head vertices, per frame | Static fallbacks in `client/src/appearance-render.js` `HEAD` |
| `measure-head-glb.mjs` | Head bounds straight from the GLBs (node space) | Showed that GLB space ≠ gear space |
| `probe-bones.mjs` | Inverse-bind joint positions of a live humanoid | Showed that skinning space ≠ gear space, which led to the runtime `measureSkull` |
| `diagnose-character-tabs.mjs` | Per-tab conditions of e2e check 9 | Root cause: uppercase `.kicker` with case-sensitive `innerText` matches |

`measure-skull.mjs` and `probe-bones.mjs` reflect intermediate states. The game now measures the skull itself at character creation (`characters.js` `measureSkull`).
