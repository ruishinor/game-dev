// Propose clear patrol loops in the Expanse: each loop is a ring of waypoints
// snapped to clear ground; every segment is sampled for clearance.
import { SEVERANCE_EXPANSE as E, SALVAGE_CAMP as C, SEVERANCE_VEINS } from '../../shared/severance-gate.js';
import * as W from '../../shared/world.js';
const cols = [...W.COLLIDERS, ...W.OBJECTS.filter((o) => !o.embedded && Number.isFinite(o.r))];
const clearAt = (x, z) => Math.min(...cols.map((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) - c.r : Math.max(Math.abs(x - c.x) - c.hw, Math.abs(z - c.z) - c.hd))));
const ok = (x, z) => Math.abs(x - E.x) < E.hw - 18 && Math.abs(z - E.z) < E.hd - 18
  && Math.hypot(x - E.outpost.x, z - E.outpost.z) > E.outpost.r + 18
  && Math.hypot(x - C.x, z - C.z) > C.r + 10
  && Math.hypot(x - E.arrival.x, z - E.arrival.z) > 30
  && Math.hypot(x - E.x, z - (E.z + 125)) > 30
  && clearAt(x, z) > 2.5;
function snap(x, z) {
  if (ok(x, z)) return { x, z };
  for (let r = 1; r < 14; r += 1) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a / 16 * 6.283) * r, pz = z + Math.sin(a / 16 * 6.283) * r; if (ok(px, pz)) return { x: px, z: pz }; }
  return null;
}
const segOk = (a, b) => { for (let k = 0; k <= 30; k++) { const x = a.x + (b.x - a.x) * k / 30, z = a.z + (b.z - a.z) * k / 30; if (clearAt(x, z) < 1.4) return false; } return true; };
const loops = [['west-plain', -70, 20, 26], ['east-flats', 85, 40, 24], ['south-dunes', -20, -95, 26], ['north-west', -75, 95, 22], ['lakebed', 40, -40, 24]];
for (const [name, u, v, r] of loops) {
  const pts = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; const p = snap(E.x + u + Math.cos(a) * r, E.z + v + Math.sin(a) * r * 0.8); if (p) pts.push(p); }
  const segs = pts.map((p, i) => segOk(p, pts[(i + 1) % pts.length]));
  console.log(name, pts.length, 'segments ok', segs.filter(Boolean).length, JSON.stringify(pts.map((p) => [Math.round(p.x - E.x), Math.round(p.z - E.z)])));
}
