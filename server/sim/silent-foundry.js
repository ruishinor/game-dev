// The Silent Foundry behind the Severance Gate. Server-only: encounter
// composition and placement, progress rules, the cache reward and travel.
// Clients see the enemies they meet and the outcome of their own actions.
import { ENEMIES } from '../../shared/content.js';
import { dist, hasLineOfSight } from '../../shared/world.js';
import { SILENT_FOUNDRY as F, inSilentFoundry } from '../../shared/silent-foundry.js';
import { resetEnemy } from './ai.js';
import { ELITE } from './enemy-levels.js';

const deny = (reason) => ({ ok: false, reason });
// [type, name, level, u, v, elite] relative to the Foundry centre. Levels follow
// the dungeon band (enemy-levels.js REGION_LEVELS, 8-11). Eight of the fourteen
// guards are elites, in addition to the Overseer.
const E = true;
const ENCOUNTER = [
  // Fabrication Hall: reactivated press tenders
  ['sentinel', 'Press Sentinel', 8, -7, 70, E], ['skitter', 'Slag Skitter', 8, 6, 68], ['skitter', 'Slag Skitter', 8, -3, 62], ['sentinel', 'Press Sentinel', 8, 8, 58, E],
  // Cultivation Vault: what grew in the vats
  ['faultstalker', 'Vat Stalker', 9, 0, 44, E], ['skitter', 'Culture Swarmer', 9, -4, 32], ['skitter', 'Culture Swarmer', 9, 4, 30], ['faultstalker', 'Vat Stalker', 9, 0, 14, E],
  // Harmonic Chamber: the resonator's wardens
  ['turret_drone', 'Harmonic Drone', 10, -7, -10], ['turret_drone', 'Harmonic Drone', 10, 7, -10], ['sentinel', 'Resonant Sentinel', 10, -6, -44, E], ['sentinel', 'Resonant Sentinel', 10, 6, -44, E],
  // Excavation Depths: the overseer and its diggers
  ['faultstalker', 'Depth Borer', 11, -6, -68, E], ['faultstalker', 'Depth Borer', 11, 8, -76, E],
  ['warden', 'Foundry Overseer', 11, 0, -84],
];
const OVERSEER = 'Foundry Overseer';
// The Overseer's own attacks (server-only definitions; clients see telegraphs and impacts).
export const OVERSEER_SPECIALS = Object.freeze([
  Object.freeze({ id: 'overseer_press_slam', name: 'Press Slam', cd: 11000, first: 4000, windup: 2000, radius: 6, dmg: 48, at: 'target' }),
  Object.freeze({ id: 'overseer_slag_wave', name: 'Slag Wave', cd: 15000, first: 9000, windup: 2600, radius: 11, dmg: 38, at: 'self' }),
  Object.freeze({ id: 'overseer_resonant_overload', name: 'Resonant Overload', cd: 21000, first: 15500, windup: 3200, radius: 40, dmg: 24, at: 'all' }),
]);
const CACHE = Object.freeze({ id: 'resonance_fragment', count: 4 });

export function foundryArrival() { return { x: F.arrival.x, z: F.arrival.z }; }

/** Persistent shared encounter, spawned with the first traveller (not per visit). */
export function openFoundry(game) {
  if (game.foundryOpened) return;
  for (const [type, name, level, u, v, elite] of ENCOUNTER) {
    const def = ENEMIES[type];
    const e = { id: game.nextId++, kind: 'enemy', type, name, level, radius: def.radius, home: { x: F.x + u, z: F.z + v },
      route: null, form: null, metaVer: 1, foundryEncounter: true, overseer: name === OVERSEER, vx: 'foundry',
      ...(elite ? { elite: { hp: ELITE.hp, dmg: ELITE.dmg } } : {}) };
    if (e.overseer) e.specials = OVERSEER_SPECIALS;
    resetEnemy(game, e);
    game.enemies.push(e);
    game.ents.set(e.id, e);
  }
  game.foundryOpened = true;
}

/** Progress: bit 1 any Foundry encounter, bit 2 the Overseer. Returns true when handled. */
export function recordFoundryKill(game, p, enemy) {
  if (!enemy.foundryEncounter) return false;
  const prior = p.char.foundryProgress || 0;
  p.char.foundryProgress = prior | (enemy.overseer ? 2 : 1);
  if (prior !== p.char.foundryProgress) {
    game.markDirty(p);
    game.message(p, 'info', p.char.foundryProgress === 3 ? 'The Foundry Overseer has fallen. The Depths recovery cache unlocks for you.' : 'Foundry encounter recorded.');
  }
  return true;
}

export function claimFoundryCache(game, p, obj, { grantSalvage, inCombat }) {
  if (!inSilentFoundry(p.x, p.z) || dist(p, obj) > 4 || !hasLineOfSight(p, obj) || inCombat(game, p) || p.autoOn) return deny('Disengage and approach the recovery cache.');
  if (p.char.foundryClaimed === true) return deny('You have already recovered this cache.');
  if (p.char.foundryProgress !== 3) return deny('Fight through the Foundry and defeat the Foundry Overseer first.');
  p.char.foundryClaimed = true;
  if (!grantSalvage(game, p, CACHE.id, CACHE.count)) { p.char.foundryClaimed = false; return deny('Clear space for four Resonance fragments.'); }
  game.markDirty(p);
  game.message(p, 'gain', 'Depths recovery cache claimed: 4 Resonance fragments.');
  return { ok: true };
}

/** The Foundry's return portal leads back to the foot of the Severance Gate. */
export function leaveFoundry(game, p, obj, gateFront) {
  if (p.dead) return deny('You are defeated.');
  if (!inSilentFoundry(p.x, p.z) || dist(p, obj) > 5 || !hasLineOfSight(p, obj)) return deny('Approach the return portal.');
  if (p.autoOn || game.time < p.combatUntil || p.buffs.some((b) => b.k === 'root' && b.until > game.time)) return deny('Disengage before travel.');
  game.transferPlayer(p, gateFront());
  game.message(p, 'info', 'You emerge before the Severance Gate.');
  return { ok: true };
}
