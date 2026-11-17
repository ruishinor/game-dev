# Attunement — handoff

> **Standing review requirement (2026-11-18):** Read [AGENTS.md](../AGENTS.md) before planning, implementation, review and handoff. Apply its server-authority, minimum-disclosure, repository-hygiene and publication gate to all relevant work.

Work stopped early (usage limit) partway through the first vertical slice.
This file states exactly what exists, what was verified, and what remains.

## Summary

| Area | State |
| --- | --- |
| Shared rules + content (`shared/`) | Written, covered by passing tests |
| Authoritative simulation (`server/sim/`) | Written, covered by passing tests |
| Persistence (`server/store.js`) | Written, **not yet verified** (its tests live in the hanging file below) |
| HTTP + WebSocket layer (`server/net.js`, `server/index.js`) | Written, **not verified** — integration tests hang |
| Browser client (`client/`) | **Not started.** No rendering, input, camera or UI exists |
| Browser / two-session gameplay checks | **Not performed** (nothing to open) |

**The slice is not playable. None of the 13 acceptance criteria are met end
to end**, because every one of them requires the browser client. What exists
is the server half of criteria 4–13 (combat, classes, companion, build
system, shared world, persistence).

## Verification actually performed

- `node --test test/sim.test.js` — **41 passed, 0 failed** (last run before
  handoff). Drives the simulation directly with a deterministic clock/RNG.
  Covers: movement and collision, server input budget (speed-hack bound),
  ability range/cooldown/GCD/resource checks, damage, healing, threat, enemy
  aggro/leash/evade/respawn, telegraphed specials, player defeat/respawn,
  all three companion modes and command validation, equip/unequip validation
  and skill dependencies, all four glyphs, augmentation scaling of both the
  ability and the companion, the directive chain, encounter scaling, and
  bot-driven balance checks of the Vault Warden.
- `test/net.test.js` — **written but failing/hanging; treat as unverified.**
  The HTTP test fails as expected (no `client/index.html`). The remaining
  tests (two sockets in one world, forged-message rejection, rate limiting,
  persistence across restart, session takeover, disconnect mid-fight, store
  tamper handling) time out without reporting a result. Cause not
  investigated. Suspects, in order: `startServer().close()` not resolving
  (HTTP keep-alive / `wss.close` ordering), or the test `Client.create`
  never receiving `welcome`. First step: run a single test with
  `node --test --test-name-pattern="names" test/net.test.js` and add logging
  in `NetServer.onMessage`.
- Nothing was run in a browser. No screenshots, no manual play.

One real bug was found and fixed by the tests (directives never advanced);
expect more of that kind in the untested network layer.

## What is implemented (server side)

- **World** (`shared/world.js`): The Verdigris Reach — Sanctum safe zone,
  Sporefield, Derelict Relay, Resonance Vault, a hidden obelisk hollow;
  deterministic terrain height function, prop/collider list, and the fixed
  60 Hz movement step shared by server and (future) client prediction.
- **Classes** (`shared/content.js`): Kinetic Vanguard (defender; stores
  damage as Charge, Graviton Tether pull/taunt, Kinetic Ward, Discharge) and
  Symbiotech Conductor (healer/support; Neural Lash debuff, Mending Graft,
  Spore Snare root, Overgrowth Surge).
- **Companion** (`server/sim/companion.js`): Mender Symbiote with three
  owner-selected modes — Triage (auto-heals the most injured ally), Bond
  (attaches to an ally: regen + damage reduction), Harry (attacks the
  owner's target, makes it take more damage).
- **Build system** (`shared/build.js`): Device → skill → Implant requirement
  chain; Attunement (from the obelisk) gates glyphs; one glyph slot with
  glyphs that change ability or companion behaviour. Whole-loadout
  validation on every equip/unequip.
- **Enemies** (`server/sim/ai.js`): Mire Skitter, Rogue Sentinel
  (telegraphed, dodgeable Arc Pulse), Vault Warden (elite; scales with
  engaged players; solo-able only with the right build per the bot tests).
- **Progression** (`server/sim/progress.js`): XP/levels 1–5, personal loot,
  a 7-step directive chain that hands out the build pieces in order.
- **Networking** (`server/net.js`): token auth (hash stored only), message
  validation, rate limiting, session takeover, 20 Hz snapshots + events.
  Protocol is documented by the `switch` in `onGameMessage` and by
  `Game.buildRows/privateState/sheet`.

## Technical decisions

- **Node + `ws`, plain ES modules, no build step.** Client is intended to
  load Three.js straight from `/vendor/three/three.module.js` (already
  mounted by the static server) and import `/shared/*.js` directly, so rules
  are literally the same code on both sides.
- **Server-authoritative everything.** Clients send intents only (movement
  inputs with sequence numbers, target id, ability id, pet command, equip).
  Movement is input-replay with a per-player step budget; the client is
  meant to predict with `stepMove` and reconcile on `y.ack`.
- **Simulation has no I/O** (`Game.tick(dtMs)`), so it is testable with a
  fake clock.
- **Persistence is one JSON file, atomic write.** Fine for tens of players;
  not a database.
- **No interest management or delta compression.** Every client gets every
  entity each tick. Acceptable for the stated 5–25 population; unmeasured.

## Next steps, in order

1. Make `test/net.test.js` pass (or find the server bug it is exposing).
2. Write the client under `client/` (planned layout: `index.html`,
   `src/main.js`, `net.js`, `input.js`, `camera.js`, `scene.js`,
   `models.js`, `fx.js`, `ui.js`). Needs: login/character creation,
   WoW-style controls (WASD, RMB steer, LMB orbit, wheel zoom, Tab/click
   target, 1–4 abilities, Shift+1–3 pet modes, C build panel, F interact),
   prediction + reconciliation, remote interpolation, camera collision,
   unit frames, action bar with cooldowns, companion frame, build panel,
   directive tracker, combat text, death/respawn overlay.
3. Two-browser Playwright run (Chromium is preinstalled in the cloud
   environment) and record real evidence against the 13 acceptance criteria.
4. Then the adversarial review the brief asks for.

## Known issues and unverified assumptions

- Network layer and store are unverified (see above).
- Balance numbers come from simple bots, not human play.
- Companions cannot be attacked; abilities need no facing; no line of sight.
- Disconnecting mid-fight has no penalty beyond keeping current health.
- No per-IP limits on character creation (global cap of 500 only); no
  WebSocket origin check (auth is a token in the message, not a cookie).
- Not production-ready; not deployed anywhere.
