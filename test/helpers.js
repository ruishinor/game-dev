// Shared fixtures for simulation tests.
import { Game } from '../server/sim/game.js';
import { mulberry32 } from '../shared/world.js';
import { inviteParty, answerParty } from '../server/sim/party.js';
import { tickInscription } from '../server/sim/progress.js';

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
  return new Game({ rng: mulberry32(seed), relicRng:()=>.999999, blueprintRng:()=>.999999, classArmourRng:()=>.999999 });
}

export function joinParty(game, owner, ...members) {
  for (const member of members) {
    if (!inviteParty(game, owner, member.id).ok || !answerParty(game, member, true).ok) {
      throw new Error('Could not establish the test party.');
    }
  }
}

export function finishInscription(game, player) {
  game.time = player.inscription.until;
  tickInscription(game, player);
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

// Phase Scar -> Severance Expanse -> Severance Gate -> Phase Annex, through the
// real interactions. The gate is first brought to its active phase by presence.
/** Phase Scar -> Expanse -> Severance Gate -> Silent Foundry. */
export async function travelToFoundry(game, player) {
  const { interact } = await import('../server/sim/progress.js');
  const { gateToWorld } = await import('../shared/severance-gate.js');
  const entry = game.rift.entry;
  place(player, entry.x, entry.z - 3.6);
  const scar = interact(game, player, entry.id);
  if (!scar.ok) return scar;
  const stand = gateToWorld(0, 0.5);
  place(player, stand.x, stand.z);
  game.severance.phase = 'active';
  return interact(game, player, game.severance.gate.id);
}
