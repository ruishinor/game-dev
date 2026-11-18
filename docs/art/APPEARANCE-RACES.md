# Appearance and races: player-chosen frame, origin, skin and hair

Branch `feat/appearance-races`, stacked on `feat/character-fidelity`. This is
roadmap item INT-03: it recovers the isolated `charlie/character-appearance`
work. Ported from that branch:

- the validated appearance schema, adapted;
- server persistence and relay;
- the schema and network tests.

Its mannequin-era renderer (`appearance-render.js`) is **not** ported. The
MakeHuman faces from `feat/character-fidelity` draw the appearance instead.

## Schema (`shared/appearance.js`, shared by server and client)

The schema is one compact string, `frame.race.skin.hair.hairColour`.

- **Frame**: masculine (`humanoid_m`) or feminine (`humanoid_f`).
  - It is independent of the outfit.
  - Arm-mounted gear is moved along the arm for the other frame (hand reach
    is 0.739 m masculine and 0.645 m feminine). This covers both legacy gear
    and the merged gear-kit pieces.
- **Origin (race)**:
  - **Colonist (human)**: nine skin tones; shaved, close crop, field crop or
    swept back hair.
  - **Veyran**: established lore (Red Rucker, "Veyran Burdenkeeper"). Smooth,
    featureless and crimson; hairless. The smooth head carries fine contour
    tracery that brightens with exertion and when struck.
  - **Mirekin**: from the isolated branch, following the concept's
    "biologically altered forms". Mottled bloom-altered skin with plates,
    slow-pulsing bioluminescent veins, and a segmented chitin crest along the
    skull midline (built as its own shell in the asset build). Shaved or
    short hair only.
- **Race-bound outfits**: Red Rucker is always a Veyran (`LOOK_RACE`).
- **Hair colour**: nine, including two dyes.
- **Validation**: per field, with race rules applied last. Hostile input
  falls back field by field. Saves made before appearance existed keep their
  outfit's body. Hooded outfits default to no hair, so their hoods stay up as
  before.

Identity (face shape, age, stubble) still comes from the character name, so
two characters with the same choices are still different people.

## Presentation rules

- Choosing hair (or the Mirekin crest) lowers the outfit's hood, so the hair
  is visible.
- Helmets still hide the head.
- NPC outfits without a stored appearance keep their pinned faces.

## Graphics presets

The face cost scales with the existing preset:

| Preset | Eyes | Hair | Face detail (eyes, lashes, teeth) |
|---|---|---|---|
| High | clear-coated | all shell layers | within 12 m |
| Medium | standard material | up to 3 layers | within 8 m |
| Low | standard material | innermost layer | within 4 m |

## Trust boundary

- The server stores one normalised string per character. It never changes
  stats, abilities or rules; a test asserts identical stats.
- It is relayed as entity meta `ap`, in the sheet and in the account roster.
- The client only draws it.

## Verification

- `test/appearance.test.js` covers round trips, legacy defaults, hostile
  input, race rules and race-bound outfits.
- The `appearance:` test in `test/net.test.js` covers storage, relay,
  validation, unchanged stats, survival across a restart, and correction of
  tampered or missing saved values.
- `node tools/dev/appearance-capture.mjs <dir>` creates characters through the
  real creation UI pickers and photographs each combination in-game
  (software WebGL, appearance only).

## Limits

- There are no long hair styles; ponytails, braids and locs need card
  geometry.
- The Mirekin crest follows the scalp mesh resolution, which is about 1 cm.
- There is no in-game appearance editor after creation yet.
