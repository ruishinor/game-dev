# 18 — Listening Stone artefact and Surveyor field rig

These are simulated review perspectives, not independent human reviews.

Scope: `client/src/listening-stone.js` (it replaces the `obelisk` model mapping;
the original `makeObelisk` is retained), the deployable rig in `main.js`
`syncRig`/`animateRig`, `fieldRigDevice` in `gear-recipes.js`, and the engine's
persistent `area` API.

- **Art (Stone):** follows the owner's "Listening Stone" reference:
  - a noise-displaced basalt monolith with strata and golden circuit inscriptions
  - an embedded medallion carrying the resonance sigil
  - counter-rotating ground rings and tilted orbital arcs
  - orbiting debris stones and rising motes

  From a distance it stays restrained, with only the medallion glowing faintly.
  It wakes as a character approaches, matching "responsiveness to nearby
  characters" in the reference. The attunement sky beam keeps the resonance
  colour that the attunement event uses.
- **Art (rig):** the deployable now matches the Surveyor's worn equipment
  (shared paint, cartridges and a caged power cell), so the gadget visibly
  belongs to its owner. A survey sigil marks its real recharge radius.
- **Runtime:**
  - Stone: about 12 draw calls; debris is one instanced draw; one point light
    that was already present
  - rig: the shared gear kit plus one persistent decal
  - persistent areas are capped at 16, owned by the caller, and removed at quality 0
  - charge arcs to the owner are throttled to one every 0.75 s
- **UX:**
  - proximity only changes presentation (`st.near`); attunement and its range
    are unchanged
  - the original thin rig radius ring is kept at every quality as the
    functional indicator
  - the first pass's golden light flooded the rock hollow; it was cut to a
    local 9 m light
- **Adversarial:**
  - module-level fallback rig resources are now flagged `shared`; previously,
    per-rig disposal would have freed them for every later rig
  - a disposed area ignores further `set` calls, and `alive` lets the caller recreate it
  - the Stone now disposes its canvas textures; this leak was found in review
    and fixed
- **Retrospective:**
  - the Stone uses a dedicated module rather than more primitives in `models.js`
  - the rig reuses the gear kit instead of a second modelling path
  - the other industrial references (containers, generators, pipes,
    communication towers, terminals) are not addressed in this pass

Executed: 2 Node tests (rig bounds/budget, area lifecycle) and browser captures
in `docs/evidence/env/` and `docs/evidence/vfx/after/surveyor-*`. The Stone model
cannot be imported in Node, because it uses the browser vendor path, so its
evidence is browser-only. No final art approval.
