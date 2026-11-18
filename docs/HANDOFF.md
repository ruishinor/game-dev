# Attunement playtest handoff

Read [AGENTS.md](../AGENTS.md) for the standing server-authority, minimum-disclosure and publication review gate.

## Current implementation

- The Three.js browser client runs the Sanctum, Sporefield and surrounding zones. `client/src/main.js` manages input, prediction, reconciliation and snapshot interpolation. `scene.js` builds the environment, batches static placements and fades foreground occluders. `camera.js` places the camera using terrain and solid geometry.
- `client/src/assets.js` loads the versioned GLB manifest, validates required kit contents and shares geometry and textures. Animated entities use a per-instance skeleton and AnimationMixer. Cosmetic looks use named bone attachments. See [assets and provenance](ASSETS.md).
- The Node server owns combat, progression, persistent characters, economy and inventory. The WebSocket client submits intent and renders acknowledged outcomes. Scene props in the reference area use the existing collision and heightfield data. The reference-scene change adds no client payload fields or static mounts.

## Verification

Run `npm test` for simulation, networking and asset contracts, and `npm run e2e` for two independent Chromium contexts. The latter compares both clients' observed enemy health with the server value and checks creation and persistence. Use `npm run capture` for matched scripted views and `npm run profile` to measure the active browser renderer. Compare against the applicable branch and commit, since the default branch is an earlier slice.

The [rendering extraction matrix](art/MMO-RENDERING-EXTRACTION.md) records the reference implementations, decisions and risks. The [art review records](art/reviews/) document the original asset work. New screenshots used to evaluate this branch remain separate from historical reference captures.

## Known limits

The scene uses stylized game-ready donors and Attunement-specific compositions. Humanoid close-ups, creature fidelity and animation variation remain below the long-term art target. Desktop hardware performance and independent human play remain to be verified. The profile's default software renderer is useful for comparing submitted work across matched views. The JSON store and whole-world snapshots suit the current local playtest.
