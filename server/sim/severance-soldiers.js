// Severance Soldier patrols (Severance Expanse). Server-only: routes,
// compositions, levels and the Overseers' multipliers are not shipped to
// clients. Five armoured squads roam outside the safe shelters; every squad
// marches one shared loop in a loose column (each member's route is the loop
// shifted by its formation offset), pulls together (ai.js squad social) and is
// led by an elite Severance Overseer.
import { ENEMIES } from '../../shared/content.js';
import { SEVERANCE_EXPANSE as E } from '../../shared/severance-gate.js';
import { COLLIDERS, OBJECTS } from '../../shared/world.js';
import { resetEnemy } from './ai.js';

const V = 'severance_vanguard', K = 'severance_keeper', M = 'severance_symbiote', S = 'severance_surveyor';
// Loops (u, v from the Expanse centre) validated clear of colliders, the
// outpost, the Scrapyard, the arrival terrace and the gate approach
// (tools/dev/patrol-routes.mjs; test/severance-soldiers.test.js).
const SQUADS = [
  ['west_plain', [[-44, 20], [-54, 36], [-76, 40], [-93, 29], [-93, 11], [-76, 0], [-54, 4]], [V, V, K, M]],
  ['east_flats', [[122, -20], [114, -6], [95, -3], [80, -12], [80, -28], [95, -37], [114, -34]], [V, K, M, S, S]],
  ['south_dunes', [[6, -95], [-4, -79], [-26, -75], [-43, -86], [-43, -104], [-27, -116], [-4, -111]], [V, M, S]],
  ['north_west', [[-53, 95], [-63, 105], [-80, 112], [-95, 103], [-95, 87], [-80, 78], [-61, 81]], [V, V, K, M, S, S]],
  ['lakebed', [[66, -35], [61, -25], [46, -23], [36, -29], [36, -41], [46, -47], [60, -45]], [V, K, S, M]],
];
const OVERSEER = Object.freeze({ type: V, name: 'Severance Overseer', level: 5, elite: Object.freeze({ hp: 1.8, dmg: 1.25, size: 1.15 }) });
// loose column offsets (metres), leader first
const FORMATION = [[0, 0], [1.4, -1.2], [-1.4, -1.2], [0, -2.4], [1.6, -3.4], [-1.6, -3.4], [0, -4.6]];

const BLOCKERS = [...COLLIDERS, ...OBJECTS.filter((o) => !o.embedded && Number.isFinite(o.r))];
const clearance = (x, z) => {
  let m = Infinity;
  for (const c of BLOCKERS) m = Math.min(m, c.r !== undefined ? Math.hypot(x - c.x, z - c.z) - c.r : Math.max(Math.abs(x - c.x) - c.hw, Math.abs(z - c.z) - c.hd));
  return m;
};
/** The loop shifted by a formation offset, shrunk (full, half, none) until every segment is clear. */
function offsetRoute(pts, [dx, dz]) {
  for (const k of [1, 0.5, 0]) {
    const r = pts.map((q) => ({ x: q.x + dx * k, z: q.z + dz * k }));
    const ok = r.every((a, i) => { const b = r[(i + 1) % r.length]; for (let t = 0; t <= 20; t++) if (clearance(a.x + (b.x - a.x) * t / 20, a.z + (b.z - a.z) * t / 20) < 0.9) return false; return true; });
    if (ok || k === 0) return r;
  }
}

export const SEVERANCE_SQUADS = Object.freeze(SQUADS.map(([key, loop, members], si) => {
  const roster = [OVERSEER, ...members.map((type) => ({ type, name: ENEMIES[type].name, level: ENEMIES[type].level, elite: null }))];
  const start = si * 2 % loop.length;
  const pts = loop.map(([u, v]) => ({ x: E.x + u, z: E.z + v }));
  const ordered = [...pts.slice(start), ...pts.slice(0, start)];
  return Object.freeze({
    key,
    members: Object.freeze(roster.map((m, i) => Object.freeze({
      ...m, route: Object.freeze(offsetRoute(ordered, FORMATION[i]).map((q) => Object.freeze(q))),
    }))),
  });
}));

/** Spawn every squad once (persistent shared world, not per-visit). */
export function spawnSeveranceSoldiers(game) {
  const out = [];
  for (const sq of SEVERANCE_SQUADS) {
    for (const m of sq.members) {
      const def = ENEMIES[m.type];
      const e = { id: game.nextId++, kind: 'enemy', type: m.type, name: m.name, level: m.level, radius: def.radius * (m.elite?.size ?? 1),
        home: { ...m.route[0] }, route: m.route.map((q) => ({ ...q })), patrol: true, form: null, metaVer: 1,
        severanceSoldier: true, squad: sq.key, ...(m.elite ? { elite: { hp: m.elite.hp, dmg: m.elite.dmg }, size: m.elite.size } : {}) };
      resetEnemy(game, e);
      game.enemies.push(e);
      game.ents.set(e.id, e);
      out.push(e);
    }
  }
  return out;
}
