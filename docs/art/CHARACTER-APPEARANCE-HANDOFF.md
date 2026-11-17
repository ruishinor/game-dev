# Character appearance and fidelity — handoff (paused for manual pick-up)

Paused on 2026-11-17 at the owner's request. Everything below is committed and
pushed. This file is the plan of record for the rest of the work.

## Branches and PR

| Branch | Purpose | State |
|---|---|---|
| `charlie/confident-wright-b2bh7j` | Visual fidelity pass: effects engine, signature gear, Listening Stone, field rig | **PR [#12](https://github.com/ruishinor/game-dev/pull/12) open** into `preview/playtest-brineworks`. Not merged (see below). |
| `charlie/character-appearance` | **This work**: appearance system (frame, race, skin, hair, faces) | Isolated branch. It is cut from `a2a1665` and already merges in `c0ad1af` from the PR branch. No PR yet. |

### PR #12 merge status: not merged, because the CI gate is not green

| Check | Result |
|---|---|
| CI `test` (Node) | Pass |
| CI `playable` (`test/e2e/preview-expansion.mjs`), first run | Failed at `assert.ok(tank)`, line 253 |
| Fix for that failure: `c0ad1af` | Polls for the Keeper's server-side player, like `tools/capture.mjs` does |
| CI `playable`, rerun after the fix | **Cancelled** after about 12 minutes; no result |

**Local results** on the PR head (Node 24, software GL):

| Suite | Result |
|---|---|
| `npm test` | 155/155 |
| `test/e2e/play.mjs` | 72/72 |
| `test/e2e/preview-expansion.mjs` | Pass |
| `test/e2e/art-originals.mjs` | Pass |

**Context:** the `playable` job fails on every recent PR, including #11 and #7. On the base `232aa02` it fails earlier, at the uppercase tutorial assertion fixed in `a2a1665`. Line 253 had therefore never been reached in CI before.

**To finish the merge:**
1. Re-run the `playable` job on PR #12.
2. If it times out, consider raising `timeout-minutes` in `.github/workflows/preview-expansion.yml`, since my branch adds rendering load.
3. If it fails, read the log, then fix or report.
4. Merge only when it is green.

## Goal (owner request)

On an isolated branch:
- upgrade character visual fidelity throughout;
- make characters visually distinct from each other;
- offer options for hair, gender, (distinct) class and (distinct) race.

The visual target is the attached concept art: painterly, weathered colonists, layered utility clothing, hair in braids and locs, visible faces. Draw on `docs/Attunement-Game-Concept.md` where relevant (Character Creation: identity, appearance, origin, specialization).

## Done on `charlie/character-appearance`

### 1. Appearance schema — `shared/appearance.js`

One compact validated string, `frame.race.skin.hair.hairColour` (for example `f.human.2.ponytail.1`), shared by server and client.

- **Frames:** masculine `m` (`humanoid_m`) and feminine `f` (`humanoid_f`).
- **Colonist (human):** 6 skin tones; all 8 hair styles.
- **Veyran:** existing lore (smooth, featureless, crimson); hairless, with face tracery in place of a face.
- **Mirekin:** new; altered by the biotech bloom, per the concept's "biologically altered forms". Mottled skin, bioluminescent veins, a chitin crest, and a limited set of hair styles.
- **Hair:**
  - 8 styles: none, crop, undercut, ponytail, bun, braids, locs, mohawk.
  - 9 colours, including two dyes.
- **Validation:** per-field fallback and race rules. Legacy defaults per look keep every existing character's body unchanged.

### 2. Server — `store.js`, `net.js`, `game.js`

- Appearance is persisted on load and on create (both create paths), and relayed as entity meta `ap`, in the character sheet and in the account roster.
- Tampered and legacy saves are corrected.
- Tests: `test/appearance.test.js` and the `appearance:` test in `test/net.test.js`.

### 3. Renderer — `client/src/appearance-render.js`

- **Head features:**
  - Colonist and Mirekin: nose, ears and brow ridge.
  - Veyran: swept-back cranium.
  - Mirekin: chitin crest, cheek plates and luminous nodules.
- **Painted faces:**
  - eyes, brows in the hair colour, nose and mouth shading;
  - Mirekin: glowing irises and veins;
  - Veyran: tracery.
- **Hair:** a scalp cap; the style pieces (tails, bun, braids, locs, ridge); alpha-tested **tufts** for a fibrous outline.
- **Sharing:** geometry and materials are cached and flagged shared.

### 4. Integration — `client/src/characters.js`

- The frame chooses the body under any outfit, and the race sets the skin.
- **Skull fit:** measured at rest from the skinned head vertices, stored as an ellipsoid plus a **36×18 radial map**, so hair and the face mask follow the real head.
- **Head coverings:**
  - hoods are lowered to a collar when hair is worn;
  - helmets show only hair tails.
- Arm gear (legacy and merged signature gear) is remapped along the arm per frame (hand x is 0.739 for `m`, 0.645 for `f`).

### 5. Evidence tool — `tools/appearance-capture.mjs`

- It injects the appearance into the create message.
- It captures body, back, portrait and profile frames for 10 combinations.
- Work-in-progress frames are in `docs/evidence/appearance/wip/`.

## Known issues (seen in the last capture), fix first

1. **Mohawk tufts float:** they sit as a detached cloud above the head. In the `T.mohawk` entry of `hairGeometry`, lower `lift` (0.03 → ~0.012) and `rise` (0.6 → ~0.3), and keep the ridge scalp `lift` consistent.
2. **Veyran cranium pierces hoods and helmets.** Either:
   - skip the cranium when the look is covered (`covered === 'helmet'`, or the hood is not lowered), or
   - lower the hood for Veyran too.

   Add a test for this.
3. **Faces are often hidden by class gear:** the Conductor respirator, Surveyor goggles, Keeper visor and the Vanguard helmet. This keeps the classes distinct, but consider an appearance option to stow headgear or visor (cosmetic only), so faces and hair show. The concept art shows faces.
4. **Hair still reads stylized** next to the painterly references. It needs a root-to-tip colour gradient, more tufts on long styles, and a little sheen (or `MeshPhysicalMaterial` sheen at quality 2 only).
5. **Clipping in motion:** checked in idle only. Run, attack and cast poses are not checked, and long styles (locs, ponytail, braids) may meet the dorsal gear.

## Remaining plan, in order

1. **Fix the known issues 1–2** above. Re-run `node tools/appearance-capture.mjs wip` and inspect the portrait, profile, body and back frames.
2. **Task 11 — class outfit fidelity:**
   - **Textures:** procedural worn fabric, leather and plate canvas textures for the shells, per class, replacing the flat colours in `LOOK_DEFS` (`looks.js`): weave, seams, grime, edge wear.
   - **Layered pieces from the concept art,** as gear-kit recipes, so the classes are also distinct in cloth:
     - scarves and cowls;
     - utility belts with pouches;
     - gloves;
     - knee pads;
     - a hooded mantle for the Surveyor.
   - Keep the per-look budgets tested (`test/gear-kit.test.js`).
3. **Task 12 — character creation UI:**
   - Pickers on the login card for:
     - frame (Masculine / Feminine);
     - race (3 cards with blurbs);
     - skin swatches (per race);
     - hair style (filtered by race);
     - hair colour.
   - Send `appearance` with `create` and `account_create_character` (the server already accepts it).
   - Default selections must equal the look default, so `test/e2e/play.mjs` is unaffected.
   - Optional: live portrait (`client/src/portraits.js`; pass `ap` in the meta).
4. **Task 13 — evidence and reviews:**
   - **Evidence:** run `appearance-capture` to a final `after` label, and add a before set from the PR branch.
   - **Review record:** write `docs/art/reviews/19-character-appearance.md`. Cover art, rigging and clipping, runtime (draw calls per character: hair +1–3, face +1, features +1–3), UX, adversarial and retrospective.
   - **Tests:** run `npm test` and both e2e suites, then push.
   - **PR:** open one from `charlie/character-appearance` into `preview/playtest-brineworks` (after #12 lands, or stacked on it).

## How to resume

```bash
git fetch origin && git checkout charlie/character-appearance
export PATH=/opt/node24/bin:$PATH   # any Node 24 (CI uses 24; Node 22 breaks art-originals byte checks)
npm ci
npm test                                         # 162 pass at pause time
node tools/appearance-capture.mjs wip            # ~6 min, software GL
node tools/appearance-capture.mjs wip mirekin    # one subset
node test/e2e/play.mjs                           # integrated playtest (~12 min)
node test/e2e/preview-expansion.mjs              # CI 'playable' gate
```

**Tips:**
- Don't run other heavy jobs during the e2e suites. Turning in them is frame-time based, and CPU contention once produced a false beacon-collision failure.
- Earlier, larger context: `docs/art/VFX-ENGINE-HANDOFF.md`.
