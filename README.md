# Attunement — vertical slice

Browser-based, third-person 3D MMORPG slice: an authoritative Node server and a
Three.js client. Two classes (Kinetic Vanguard, Symbiotech Conductor), a
companion, a build system, shared-world combat and persistence.

**Status:** playable prototype with primitive procedural graphics. A GLB asset
pipeline and animated character models are built and verified on their own but
not yet wired into the game — see [`docs/HANDOFF.md`](docs/HANDOFF.md) for the
exact state and next steps.

```bash
npm install
npm start        # http://127.0.0.1:8080  (PORT, HOST, DATA_FILE override)
npm test         # simulation + network tests
npm run e2e      # two real browsers playing together (needs Playwright + Chromium)
```

Two players on one computer: open the page twice, the second time with
`?slot=2`. Press **H** in game for controls.

Assets (only needed to change them; built files are committed):

```bash
npm run assets:fetch && npm run assets:build && npm run assets:preview
```

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, verification, next steps
- [`docs/ASSETS.md`](docs/ASSETS.md) — asset credits, licences and pipeline
- [`docs/ENGINEERING_EXTRACTION.md`](docs/ENGINEERING_EXTRACTION.md) — techniques taken from open-source WoW browser clients
- [`docs/Attunement-Game-Concept.md`](docs/Attunement-Game-Concept.md) — design brief
