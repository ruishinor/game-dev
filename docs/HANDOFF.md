# Attunement handoff

Read [AGENTS.md](../AGENTS.md) before changing code or promoting a preview. Apply its server-authority, disclosure and publication rules.

## What runs

- `client/` runs the Three.js scene, camera, input, targeting, HUD and effects. It predicts local movement from shared rules, reconciles to server input acknowledgements and interpolates remote entities.
- `server/sim/` owns movement, combat, companion modes, directives, equipment validation and progression. The two classes are Kinetic Vanguard and Symbiotech Conductor.
- `server/net.js` processes intent over WebSocket and publishes snapshots. `server/store.js` persists characters in an atomic JSON file. The local server also serves the browser client. `PORT`, `HOST` and `DATA_FILE` override its defaults.

## Verification

- `npm test` runs the simulation and the live HTTP, WebSocket and persistence integration tests.
- `test/e2e/play.mjs` exercises two Chromium contexts against the same server. This branch does not declare Playwright as an npm dependency. Use a development checkout that provides Playwright and its Chromium browser to run the script.
- The current default branch is the first playable slice. The separate `preview/playtest-brineworks` line contains later presentation and gameplay integrations with their own checks. Use the exact branch and test run when reporting results.

## Known limits

The default branch uses procedural visuals. No hardware performance target or public deployment has been verified. All connected clients receive world snapshots, and the JSON store is intended for local prototype use. Balance has bot coverage and still needs human play. Treat release and public hosting as separate work.
