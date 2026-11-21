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

// Severance Soldier squads in Cinderlock armour: a sergeant walks the route
// and two soldiers hold a wedge behind it (formation slots in the leader's
// heading frame: [side, back] metres). Followers carry the same route as a
// fallback for when their sergeant is down or engaged.
const SQUADS = [
  // the Severed Pass: east of the central massif, north and back
  ['Severed Pass', [[40, -52], [40, -30], [38, 0], [40, 30], [40, 50], [40, 30], [38, 0], [40, -30]]],
  // the Causeway: the south canyon below the sentinels' beat
  ['Causeway', [[-26, -92], [-24, -60], [-26, -30], [-28, -6], [-26, -30], [-24, -60]]],
  // the gate approach: a sweep across the basin below the stair
  ['Gate', [[-34, 92], [-16, 104], [16, 104], [34, 92], [16, 104], [-16, 104]]],
];
const SQUAD_SLOTS = [null, [1.9, -2.1], [-1.9, -2.1]];

const ROSTER = [
  ...PATROLS.map(([type, name, dl, route, start]) => ({ type, name, dl, route, start })),
  ...SQUADS.flatMap(([, route], q) => SQUAD_SLOTS.map((slot, k) => ({
    type: 'severance_soldier', name: k ? 'Severance Soldier' : 'Severance Sergeant', dl: k ? 0 : 1, route, start: 0, squad: q, slot, rank: k,
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
    game.enemies.push(e);
    game.ents.set(e.id, e);
    out.push(e);
  }
  return out;
}
