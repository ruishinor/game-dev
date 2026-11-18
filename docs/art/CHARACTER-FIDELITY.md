# Character fidelity: realistic faces and bodies (progress record)

Branch `feat/character-fidelity`, based on `preview/playtest-brineworks` @ `1bdd89a`.
Read [AGENTS.md](../../AGENTS.md) first. Everything here is presentation only.

## What changed and why

The players and NPCs were Quaternius mannequins with no faces. They are now
CC0 MakeHuman bodies fitted to the existing animation rig, with faces you can
inspect up close.

- **Body**: the hm08 base mesh is shaped with macro targets: sex, age, muscle,
  weight and proportions. It is posed from MakeHuman's A-pose into the rig's
  T-pose by linear blend skinning with MakeHuman's CC0 weights, and stretched
  along each bone to the rig's joint positions. Every clip, gear attachment
  and server size stays unchanged. Clothing shells are cut from the new
  surface with the existing `SHELLS` rules.
- **Regions**: the neck-to-ankle "body" keeps atlas UVs, so the existing look
  textures and colours act as the undersuit. The feet use the look's `joints`
  part. The head and hands use MakeHuman UVs with skin maps.
- **Head**: 4.3k quads with 41 morph targets.
  - 19 expressions: blink, wide, squint, brows, smile, frown, jaw open,
    press, pucker, grimace, sneer. They are blended from MakeHuman's
    expression units.
  - 22 identity shapes: three heritage structure bases, age, jaw, chin,
    cheekbones, nose, lips, mouth, brow ridge, eyes, head width, fat,
    angularity, ears.
  - The build checks each shape's safe weight range against eyeball
    penetration (`extras.ranges`). Eyeballs follow the sockets
    (`extras.eyeShift`).
  - Teeth and lashes follow both the expression and the shape morphs.
- **Eyes**: the fitted high-poly eyeball sits on new `eye_l`/`eye_r` joints
  for gaze. The iris is a luminance layer tinted per character, with a
  clear-coated cornea and upper-lid occlusion.
- **Skin**: a procedural bake in UV space.
  - Albedo: regional colouring, lips, freckles.
  - Normal: pores, fine lines.
  - ORM: cavity AO, T-zone roughness.
  - Masks: brow, stubble, scalp, lips.
  - The client shader tints the bake per character, composites the hair
    masks with a strand grain, and adds a wrap-lighting subsurface term.
- **Hair**: three shell styles (`buzz`, `crop`, `swept`) are grown from the
  scalp. A bind-space strand shader cuts strands, with root darkening and
  clumping. Hair follows the head's shape morphs. Hooded looks fall back to
  `buzz`; helmeted and faceless looks hide the face.
- **Faceless and helmeted looks**: Red Rucker (faceless by owner design) and
  helmets keep the mannequin's smooth head, which ships as the
  `mannequin_head` and `helmet` shells.
- **Animation** (`client/src/face.js`):
  - Natural blink intervals, with occasional double blinks.
  - Saccades and gaze with clamped eye rotation.
  - Additive head look-at: NPCs look at a nearby player, the local player
    looks at the target.
  - Expressions from presentation state: combat, cast, attack, hit and
    death (eyes closed), plus talking NPC jaw movement.
- **Appearance**: deterministic from the character name, so every client draws
  the same face without server data. The name sets skin tone, hair and eye
  colour, hair style, brow density, stubble, age and identity weights. Looks
  can pin a preset with `LOOK_DEFS[look].face`.

## Provenance

`assets/sources.json` lists the source `makehuman`: all 141 files the build
reads, from commit `a8bc2d54…`, with SHA-256 hashes. The data is CC0 (upstream
LICENSE.md, section C). The readers here are independent of MakeHuman's AGPL
program code. Run `node tools/assets/makehuman-ledger.mjs` after changing which
targets the build uses.

## Verification

- `npm run assets:build -- humanoid_m humanoid_f skin_albedo skin_normal skin_orm skin_masks eye_albedo lash_alpha` regenerates the outputs.
- `node tools/dev/face-capture.mjs <dir>` renders matched in-game close-ups
  (front, three-quarter, side) and a gameplay-distance shot for every look.
  It uses SwiftShader software rendering, so the images are evidence of
  appearance only, not performance.
- `node tools/dev/glb-view.mjs <glb> <prefix> [clip]` renders an isolated
  turntable view.

## Known limits and next steps

- Hair is shell-based. Long styles (ponytails, braids, buns) need card
  geometry.
- The face uses MakeHuman's base topology; the close-up silhouette is
  stylised, not scanned.
- Skin detail is procedural. Pores read as grain at gameplay distance.
- There are no established races in the lore or code. Individual variation
  is human only. Adding races is an owner decision.
- No hardware GPU timing has been measured.
