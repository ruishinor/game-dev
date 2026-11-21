// Native patrols of the Severance Expanse. Server-only: routes, composition and
// levels are not shipped to clients (they see only the enemies they meet).
// Each patrol reuses an existing enemy rig and combat definition under its own
// name, walks an authored route, leashes to the point where it broke off its
// route (ai.js anchorOf), and never enters the Expedition Outpost safe zone.
import { ENEMIES } from '../../shared/content.js';
import { SEVERANCE_EXPANSE as E } from '../../shared/severance-gate.js';
import { resetEnemy } from './ai.js';

const at = ([u, v]) => ({ x: E.x + u, z: E.z + v });
// [type, name, level, route (u, v relative to the region centre), start offset along the route]
// Levels follow the Expanse band (enemy-levels.js REGION_LEVELS, 5-12): easiest
// on the Amber Flats near the arrival, hardest on the gate approach.
const PATROLS = [
  // the Causeway of Sentinels: two sentinels walk the west canyon, under the colossal ring
  ['sentinel', 'Causeway Sentinel', 8, [[-30, -100], [-42, -60], [-48, -20], [-48, 26], [-50, 62], [-48, 26], [-46, -20], [-40, -60]], 0],
  ['sentinel', 'Causeway Sentinel', 8, [[-30, -100], [-42, -60], [-48, -20], [-48, 26], [-50, 62], [-48, 26], [-46, -20], [-40, -60]], 4],
  // the Severed Pass: an ash stalker crosses between the routes
  ['faultstalker', 'Ash Stalker', 7, [[-28, -6], [-12, -2], [12, -6], [28, -4], [12, -6], [-12, -2]], 0],
  // the Amber Flats: a skitter brood circles among the crystals
  ['skitter', 'Shard Skitter', 5, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 0],
  ['skitter', 'Shard Skitter', 6, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 2],
  ['skitter', 'Shard Skitter', 6, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 4],
  // the ceremonial approach: drones hold the gate basin
  ['turret_drone', 'Gate Drone', 10, [[-22, 64], [-18, 82], [-24, 102], [-18, 82]], 0],
  ['turret_drone', 'Gate Drone', 10, [[22, 64], [18, 82], [24, 102], [18, 82]], 0],
];

export const SEVERANCE_PATROLS = Object.freeze(PATROLS.map(([type, name, level, route, start]) => {
  const pts = route.map(at);
  const r = [...pts.slice(start), ...pts.slice(0, start)];
  return Object.freeze({ type, name, level, route: Object.freeze(r) });
}));

/** Spawn the Expanse patrols once (persistent shared world, not per-visit). */
export function spawnSeverancePatrols(game) {
  const out = [];
  for (const p of SEVERANCE_PATROLS) {
    const def = ENEMIES[p.type];
    const e = { id: game.nextId++, kind: 'enemy', type: p.type, name: p.name, level: p.level, radius: def.radius,
      home: { ...p.route[0] }, route: p.route.map((q) => ({ ...q })), patrol: true, form: null, metaVer: 1, severancePatrol: true, vx: 'ash' };
    resetEnemy(game, e);
    game.enemies.push(e);
    game.ents.set(e.id, e);
    out.push(e);
  }
  return out;
}
