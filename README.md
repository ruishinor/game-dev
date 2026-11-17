# Attunement — vertical slice

**Proprietary project — all rights reserved.** Public visibility does not grant a general license to reuse or commercialize protected Attunement materials. See [LICENSE](LICENSE). Third-party materials retain their own terms.

Browser-based, third-person 3D MMORPG slice: an authoritative Node server and a
Three.js client. Two classes (Kinetic Vanguard, Symbiotech Conductor), a
companion, a build system, shared-world combat and persistence, drawn with
rigged, animated GLB characters in a kit-built Lattice Sanctum and Sporefield.

**Status:** playable prototype. Not production-ready, not deployed, and not yet
played or accepted by a person — see [`docs/HANDOFF.md`](docs/HANDOFF.md) for
what is verified and what is not, and
[`docs/VISUAL_REVIEW.md`](docs/VISUAL_REVIEW.md) for an honest assessment of
the visuals.

```bash
npm install
npm start        # http://127.0.0.1:8080  (PORT, HOST, DATA_FILE override)
```

Two players on one computer: open the page twice, the second time with
`?slot=2`. A Vanguard can choose the **Red Rucker** appearance at character
creation; it changes how the character looks, never how it plays.

## Controls

| Input | Action |
| --- | --- |
| W / S | Run forward / back |
| A / D | Turn (strafe while holding the right mouse button) |
| Q / E | Strafe |
| Space | Jump |
| Right-drag | Steer: turn the camera and your character |
| Left-drag | Look around without turning |
| Both buttons | Run forward |
| Wheel | Zoom |
| Click / Tab | Select a target / next enemy |
| Right-click | Attack an enemy, or use an object |
| F1 / Esc | Target yourself / clear the target |
| 1 – 4 | Abilities |
| Shift + 1 – 3 | Companion: Triage / Bond / Harry |
| F | Interact |
| V | Reset the camera behind you |
| C | Build: devices, implants, glyphs |
| H | Controls |
| Enter | Chat |

Things between the camera and your character or target (giant fungi, pylons,
gateways) fade out rather than pushing the camera around; the camera is only
stopped by terrain, walls and boulders.

## Address options

| Option | Effect |
| --- | --- |
| `?slot=NAME` | A separate saved character per name (several players on one machine) |
| `?q=0`, `1`, `2` | Start at a quality tier: 2 = everything, 1 = no shadows, 0 = low-spec (no image-based lighting or normal maps, thinner ground cover, lower resolution). Without it the game starts at 2 and steps down if it cannot hold 26 fps |
| `&qlock=1` | Keep the chosen tier instead of adapting |
| `?nolock=1` | Do not capture the mouse while steering |
| `?glb=none` | The original procedural graphics (kept as a fallback and for comparison) |
| `?rfps=N` | Draw at most N frames a second while game logic keeps running (for very slow renderers) |

## Checks

```bash
npm test                  # simulation, network and asset tests (Node only)
npx playwright install chromium   # once, for the browser checks below
npm run e2e               # two real browsers playing together
npm run capture           # fixed-viewpoint screenshots -> docs/evidence/after/
npm run capture -- before # the same viewpoints with the original graphics
npm run profile           # frame timings per scene and quality tier
```

The browser tools use software WebGL by default, which is very slow and says
nothing about real performance. To use the machine's GPU:

```bash
ATTUNEMENT_GPU=1 ATTUNEMENT_HEADED=1 npm run profile
```

(PowerShell: `$env:ATTUNEMENT_GPU=1; $env:ATTUNEMENT_HEADED=1; npm run profile`.)

## Assets

Built assets are committed, so none of this is needed to play:

```bash
npm run assets:fetch && npm run assets:build && npm run assets:preview
```

Every third-party asset is CC0; sources, creators and checksums are in
[`assets/sources.json`](assets/sources.json).

## Documents

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, verification, known issues, next steps
- [`docs/VISUAL_REVIEW.md`](docs/VISUAL_REVIEW.md) — visual assessment against the classic Anarchy Online benchmark
- [`docs/ASSETS.md`](docs/ASSETS.md) — asset credits, licences and pipeline
- [`docs/ENGINEERING_EXTRACTION.md`](docs/ENGINEERING_EXTRACTION.md) — techniques taken from open-source WoW browser clients
- [`docs/Attunement-Game-Concept.md`](docs/Attunement-Game-Concept.md) — design brief
