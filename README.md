# Attunement — vertical slice

**Proprietary project — all rights reserved.** Public visibility does not grant a general license to reuse or commercialize protected Attunement materials. See [LICENSE](LICENSE). Third-party materials retain their own terms.

Attunement is a playable third-person browser MMORPG prototype. The Three.js client renders rigged GLB characters, VFX, and the Lattice Sanctum and Sporefield. The Node simulation owns combat, companions, equipment, crafting, quests and persistence. The playtest roster includes Kinetic Vanguard, Symbiotech Conductor, Aegis Keeper and Brine Surveyor.

```bash
npm ci
npm start
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). `PORT`, `HOST` and `DATA_FILE` override the defaults. Use a second browser context or a different `?slot=NAME` to test multiplayer locally. Character creation offers cosmetic appearances such as Red Rucker.

See the [handoff](docs/HANDOFF.md) for verification and known limits. For current SHA-pinned roadmap, requirement ownership, test evidence and acceptance gaps, use the [canonical delivery register](docs/DELIVERY-REGISTER.md) and its [five-track verification gates](docs/VERIFICATION-GATES.md); older roadmap checkpoints are historical.

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
| F1 | Target yourself |
| Esc | Dismiss the active panel; open or close the corner menu when no panel is open (also clears current targeting) |
| M | Open the World Atlas; press M again to close it (unless editing a map field) |
| 1 – 9 | Available abilities (class dependent) |
| Z | Switch weapon: melee ↔ ranged (every class; an empty slot uses the innate attack; works in combat) |
| G | Electrical Combat Rod: joined ↔ dual batons (rod drawn, out of combat) |
| X | Sit down / stand up (moving, attacking or abilities stand you up) |
| Shift + 1 – 5 | Companion: Triage / Bond / Attack / Follow / Stay |
| F | Interact |
| V | Reset the camera behind you |
| C / I | Character and Loadout / Inventory |
| B | Build Planner and Workshop |
| J | Codex |
| R | Toggle auto-attack |
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

The visual asset ledger records CC0 donors, creators and checksums. See the [visual pipeline](docs/ASSETS.md) and [prerecorded voice credits](docs/art/VOICE-CREDITS.md) for their respective terms.

## Documents

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, verification, known issues, next steps
- [`docs/art/VISUAL-FIDELITY-REVISION.md`](docs/art/VISUAL-FIDELITY-REVISION.md) — visual fidelity targets and asset review evidence
- [`docs/ASSETS.md`](docs/ASSETS.md) — asset credits, licences and pipeline
- [`docs/ENGINEERING_EXTRACTION.md`](docs/ENGINEERING_EXTRACTION.md) — techniques taken from open-source WoW browser clients
- [`docs/Attunement-Game-Concept.md`](docs/Attunement-Game-Concept.md) — design brief
