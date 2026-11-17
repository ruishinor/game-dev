# Attunement — vertical slice (work in progress)

**Proprietary project — all rights reserved.** Public visibility does not grant a general license to reuse or commercialize protected Attunement materials. See [LICENSE](LICENSE). Third-party materials retain their own terms.

Browser-based, third-person 3D MMORPG slice. **Status: server-side game is
implemented and unit-tested; the browser client has not been written yet, so
the game is NOT playable.** See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the
exact state, what is verified, and what to do next.

```bash
npm install
```

```bash
npm test
```

```bash
npm start
```

`npm start` runs the server on http://127.0.0.1:8080 (`PORT`, `HOST`,
`DATA_FILE` env vars override). It will serve a 404 for `/` until
`client/index.html` exists.

The design brief is in [`docs/Attunement-Game-Concept.md`](docs/Attunement-Game-Concept.md).
