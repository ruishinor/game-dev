// The Scrapyard garrison (Severance Expanse). Server-only: composition, levels,
// posts and the elite's multipliers are not shipped to clients (they see only
// the enemies they meet). Garrison members hold posts inside the palisade
// rather than walking routes; they leash to their post (ai.js anchorOf).
import { ENEMIES } from '../../shared/content.js';
import { SALVAGE_CAMP as C } from '../../shared/severance-gate.js';
import { resetEnemy } from './ai.js';

// [type, name, level offset or absolute level, post (u, v from the camp centre), elite]
const GARRISON = [
  ['sentinel', 'Scrapyard Sentinel', { dl: 2 }, [4, -1.5]],
  ['sentinel', 'Scrapyard Sentinel', { dl: 2 }, [1.5, 3.2]],
  ['turret_drone', 'Yard Drone', { dl: 1 }, [-4.8, -4.4]],
  ['turret_drone', 'Yard Drone', { dl: 1 }, [3.6, 4.2]],
  // the elite holds the forge: heavier, harder-hitting, root-immune, holds its post
  ['sentinel', 'Forge Overseer', { level: 5 }, [-2.6, 0.5], { hp: 3.4, dmg: 1.55, size: 1.35 }],
];

export const SALVAGE_GARRISON = Object.freeze(GARRISON.map(([type, name, lv, [u, v], elite]) => Object.freeze({
  type, name, level: lv.level ?? ENEMIES[type].level + lv.dl,
  post: Object.freeze({ x: C.x + u, z: C.z + v }),
  elite: elite ? Object.freeze({ ...elite }) : null,
})));

/** Spawn the garrison once (persistent shared world, not per-visit). */
export function spawnSalvageCamp(game) {
  const out = [];
  for (const g of SALVAGE_GARRISON) {
    const def = ENEMIES[g.type];
    const e = { id: game.nextId++, kind: 'enemy', type: g.type, name: g.name, level: g.level, radius: def.radius * (g.elite?.size ?? 1),
      home: { ...g.post }, route: null, patrol: false, form: null, metaVer: 1, severanceCamp: true,
      vx: g.elite ? 'salvage_elite' : 'salvage', ...(g.elite ? { elite: { hp: g.elite.hp, dmg: g.elite.dmg } } : {}) };
    // face the entrance (east)
    e.yaw = Math.PI / 2;
    resetEnemy(game, e);
    game.enemies.push(e);
    game.ents.set(e.id, e);
    out.push(e);
  }
  return out;
}
