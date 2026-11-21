// Native patrols of the Severance Expanse. Server-only: routes, composition and
// levels are not shipped to clients (they see only the enemies they meet).
// Each patrol reuses an existing enemy rig and combat definition under its own
// name, walks an authored route, leashes to the point where it broke off its
// route (ai.js anchorOf), and never enters the Expedition Outpost safe zone.
import { ENEMIES } from '../../shared/content.js';
import { SEVERANCE_EXPANSE as E } from '../../shared/severance-gate.js';
import { resetEnemy } from './ai.js';

const at = ([u, v]) => ({ x: E.x + u, z: E.z + v });
// [type, name, level offset, route (u, v relative to the region centre), start offset along the route]
const PATROLS = [
  // the Causeway of Sentinels: two sentinels walk the west canyon, under the colossal ring
  ['sentinel', 'Causeway Sentinel', 1, [[-30, -100], [-42, -60], [-48, -20], [-48, 26], [-50, 62], [-48, 26], [-46, -20], [-40, -60]], 0],
  ['sentinel', 'Causeway Sentinel', 1, [[-30, -100], [-42, -60], [-48, -20], [-48, 26], [-50, 62], [-48, 26], [-46, -20], [-40, -60]], 4],
  // the Severed Pass: an ash stalker crosses between the routes
  ['faultstalker', 'Ash Stalker', 1, [[-28, -6], [-12, -2], [12, -6], [28, -4], [12, -6], [-12, -2]], 0],
  // the Amber Flats: a skitter brood circles among the crystals
  ['skitter', 'Shard Skitter', 1, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 0],
  ['skitter', 'Shard Skitter', 1, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 2],
  ['skitter', 'Shard Skitter', 1, [[30, -20], [56, -24], [78, 0], [62, 30], [36, 34], [24, 8]], 4],
  // the ceremonial approach: drones hold the gate basin
  ['turret_drone', 'Gate Drone', 1, [[-22, 64], [-18, 82], [-24, 102], [-18, 82]], 0],
  ['turret_drone', 'Gate Drone', 1, [[22, 64], [18, 82], [24, 102], [18, 82]], 0],
];

// Severance Soldier squads in Cinderlock armour roam long loops through the
// Expanse. A soldier walks point on the route; a second soldier and the
// sergeant hold formation slots behind it in its heading frame ([side, back]
// metres): the sergeant walks at the rear and hangs back in a fight while its
// soldiers are up. Followers carry the same route as a fallback for when the
// point is down or engaged. Loops were path-planned on a 1 m grid with a
// 3 m formation corridor clear of colliders, the outpost and the arrival.
const SQUADS = [
  ['Far West', [[-136, -150], [-136, -60], [-138, 3], [-134, 40], [-136, 130], [-110, 160], [-80, 130], [-77, 115], [-62, 90], [-70, 40], [-63, 6], [-60, 0], [-58, -2], [-67, -84], [-70, -90], [-100, -150]], 0],
  ['Causeway', [[-26, -92], [-24, -61], [-23, -60], [-30, -40], [-28, -6], [-28, 27], [-30, 30], [-40, 40], [-50, 62], [-44, 95], [-40, 100], [-20, 100], [-28, 40], [-26, -30], [-23, -65], [-26, -89]], 4],
  ['Severed Pass', [[40, -52], [40, 0], [40, 50], [32, 73], [22, 86], [0, 100], [-7, 84], [-10, 80], [2, 75], [6, 72], [8, 69], [13, 41], [13, 37], [17, 29], [38, -20]], 0],
  ['Amber Flats', [[56, -56], [92, -54], [100, -50], [136, -20], [140, 40], [140, 100], [100, 112], [80, 103], [70, 90], [60, 20], [50, -20], [51, -32], [57, -38]], 3],
  ['Gate Basin', [[-110, 165], [0, 168], [110, 165], [120, 110], [76, 103], [70, 100], [42, 103], [7, 102], [0, 96], [-13, 93], [-70, 100], [-120, 110]], 6],
];
// point, flank soldier, sergeant at the rear
const SQUAD_SLOTS = [null, [1.8, -2.2], [-0.6, -4.6]];

const ROSTER = [
  ...PATROLS.map(([type, name, dl, route, start]) => ({ type, name, dl, route, start })),
  ...SQUADS.flatMap(([, route, start], q) => SQUAD_SLOTS.map((slot, k) => ({
    type: 'severance_soldier', name: k === 2 ? 'Severance Sergeant' : 'Severance Soldier', dl: k === 2 ? 1 : 0, route, start, squad: q, slot, rank: k,
  }))),
];

export const SEVERANCE_PATROLS = Object.freeze(ROSTER.map(({ type, name, dl, route, start, squad, slot, rank }) => {
  const pts = route.map(at);
  const r = [...pts.slice(start), ...pts.slice(0, start)];
  return Object.freeze({ type, name, level: ENEMIES[type].level + dl, route: Object.freeze(r),
    ...(squad !== undefined ? { squad, rank, slot: slot ? Object.freeze({ side: slot[0], back: slot[1] }) : null } : {}) });
}));

/** World position of a formation slot behind `lead` (yaw: forward = (sin, cos)). */
export function squadSlot(lead, slot) {
  const s = Math.sin(lead.yaw || 0), c = Math.cos(lead.yaw || 0);
  return { x: lead.x + slot.side * c + slot.back * s, z: lead.z - slot.side * s + slot.back * c };
}

/** Spawn the Expanse patrols once (persistent shared world, not per-visit). */
export function spawnSeverancePatrols(game) {
  const out = [];
  const leads = new Map();
  for (const p of SEVERANCE_PATROLS) {
    const def = ENEMIES[p.type];
    const lead = p.slot ? leads.get(p.squad) : null;
    const e = { id: game.nextId++, kind: 'enemy', type: p.type, name: p.name, level: p.level, radius: def.radius,
      home: { ...p.route[0] }, route: p.route.map((q) => ({ ...q })), patrol: true, form: null, metaVer: 1, severancePatrol: true };
    // regional enemies reuse older rigs under an ash look; soldiers are their own models
    if (p.type !== 'severance_soldier') e.vx = 'ash';
    if (p.rank === 2) e.rearguard = true;
    if (lead) {
      e.lead = lead.id;
      e.slot = { ...p.slot };
      // start in the wedge, facing along the route
      lead.yaw = Math.atan2(p.route[1].x - p.route[0].x, p.route[1].z - p.route[0].z);
      e.home = squadSlot(lead, e.slot);
      e.yaw = lead.yaw;
      // the squad does not vent its reactors in unison
      if (def.specials) e.specials = def.specials.map((sp) => ({ ...sp, first: sp.first + 1700 * p.rank }));
    }
    resetEnemy(game, e);
    if (p.squad !== undefined && !p.slot) leads.set(p.squad, e);
    if (lead) lead.squad = [...(lead.squad || [lead.id]), e.id];
    game.enemies.push(e);
    game.ents.set(e.id, e);
    out.push(e);
  }
  return out;
}
