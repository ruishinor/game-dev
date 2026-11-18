// Shared fixtures for simulation tests.
import { Game } from '../server/sim/game.js';
import { mulberry32 } from '../shared/world.js';

let n = 0;
export function makeChar(cls, over = {}) {
  n += 1;
  return {
    id: `char-${n}`,
    tokenHash: 'x',
    name: `Tester${String.fromCharCode(65 + (n % 26))}`,
    cls,
    level: 1,
    xp: 0,
    inventory: [],
    equipped: { device: null, implant: null, glyph: null },
    attunements: [],
    quest: { step: 0, progress: 0 },
    pos: null,
    hp: 0,
    petMode: 'triage',
    ...over,
  };
}

export function makeGame(seed = 7) {
  return new Game({ rng: mulberry32(seed), relicRng:()=>.999999 });
}

/** Advance the simulation in 50ms ticks, collecting every event. */
export function run(game, ms, sink) {
  for (let t = 0; t < ms; t += 50) {
    game.tick(50);
    if (sink) {
      sink.push(...game.events);
      for (const p of game.players.values()) for (const e of p.outbox) sink.push({ ...e, to: p.id });
    }
    game.endTick();
  }
}

export function place(ent, x, z) {
  ent.x = x;
  ent.z = z;
  if (ent.companion) {
    ent.companion.x = x + 1.5;
    ent.companion.z = z - 1.5;
  }
}

export const enemyOf = (game, type, i = 0) => game.enemies.filter((e) => e.type === type)[i];

/** Put a player next to an enemy with every other enemy out of the way. */
export function isolate(game, enemy) {
  for (const e of game.enemies) {
    if (e !== enemy) {
      e.state = 'dead';
      e.respawnAt = Infinity;
      e.deadAt = -1e9;
    }
  }
}
