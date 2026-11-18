# Attunement — playable vertical slice

**Proprietary project — all rights reserved.** Repository visibility does not grant permission to reuse or commercialize protected Attunement materials. See [LICENSE](LICENSE). Third-party materials retain their own terms.

Attunement is a third-person browser MMORPG prototype. The Lattice Sanctum and surrounding Verdigris Reach support two playable classes, companion commands, combat, equipment and persistent characters in a shared world.

This branch contains the first playable slice. For the current build and its setup and controls, see the [Brineworks playtest](https://github.com/ruishinor/game-dev/tree/preview/playtest-brineworks).

```bash
npm ci
npm test
npm start
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Use WASD to move, right-drag to steer, left-drag to orbit, and the wheel to zoom. Tab or click selects a target, 1–4 use abilities, Shift+1–3 command the companion, F interacts, and C opens the build panel.

See the [handoff](docs/HANDOFF.md) for architecture, verification and known limits, and the [game concept](docs/Attunement-Game-Concept.md) for design intent.
