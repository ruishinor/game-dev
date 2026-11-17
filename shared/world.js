// World geometry and movement rules shared by the server (authority) and the
// client (prediction). Everything here must stay deterministic and free of
// DOM / Node APIs so both sides compute identical results.

export const MOVE_HZ = 60;
export const MOVE_DT = 1 / MOVE_HZ;
export const RUN_SPEED = 7.0;
export const BACK_SPEED_MUL = 0.62;
export const JUMP_VELOCITY = 8.0;
export const GRAVITY = 22.0;
export const PLAYER_RADIUS = 0.45;

export const WORLD = {
  name: 'The Verdigris Reach',
  radius: 92,
  sanctum: { x: 0, z: 0, r: 13 },
  spawn: { x: 0, z: 7.5 },
};

export const ZONES = {
  sanctum: { x: 0, z: 0, r: 13, name: 'Lattice Sanctum' },
  sporefield: { x: -42, z: 26, r: 21, name: 'The Sporefield' },
  relay: { x: 44, z: 20, r: 19, name: 'Derelict Relay' },
  vault: { x: 6, z: -58, r: 17, name: 'Resonance Vault' },
  obelisk: { x: -57, z: -38, r: 8, name: 'The Listening Stone' },
  survey: { x: 43, z: -33, r: 17, name: 'Brineworks Cut' },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// Areas where the terrain is flattened so structures and arenas sit level.
const FLAT_AREAS = [
  { x: 0, z: 0, r: 15, f: 8, h: 0.4 },
  { x: ZONES.vault.x, z: ZONES.vault.z, r: 17, f: 9, h: -0.6 },
  { x: ZONES.relay.x, z: ZONES.relay.z, r: 15, f: 9, h: 0.8 },
  { x: ZONES.obelisk.x, z: ZONES.obelisk.z, r: 6, f: 6, h: 0.2 },
  { x: ZONES.survey.x, z: ZONES.survey.z, r: 10, f: 8, h: -1.8 },
];

/** Terrain height at a world position. Purely presentational for the server. */
export function groundHeight(x, z) {
  let h =
    1.7 * Math.sin(x * 0.043) * Math.cos(z * 0.051) +
    0.9 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.093 + 0.7) +
    0.35 * Math.sin(x * 0.27 + z * 0.19);
  // The sporefield sits in a shallow bog.
  const sx = x - ZONES.sporefield.x;
  const sz = z - ZONES.sporefield.z;
  h -= 1.6 * smooth(1 - Math.hypot(sx, sz) / 26);
  // A shallow excavated basin with an eroded rim, localized to the new site.
  const brineR = Math.hypot(x - ZONES.survey.x, z - ZONES.survey.z);
  h += 1.15 * smooth(1 - Math.abs(brineR - 17) / 5);
  for (const a of FLAT_AREAS) {
    const d = Math.hypot(x - a.x, z - a.z);
    const k = smooth(1 - (d - a.r) / a.f);
    h = h * (1 - k) + a.h * k;
  }
  // Basin walls rise steeply toward the world edge.
  const r = Math.hypot(x, z);
  const edge = r - (WORLD.radius - 9);
  if (edge > 0) h += edge * edge * 0.16;
  return h;
}

// ---------------------------------------------------------------------------
// Static props. Each prop has a visual `type` (client only) and an optional
// collider used by both sides: circle {r} or axis-aligned box {hw, hd}.
// ---------------------------------------------------------------------------

function buildProps() {
  const props = [];
  const add = (p) => props.push(p);
  const rnd = mulberry32(90210);

  // --- Lattice Sanctum (safe zone) ---
  add({ type: 'beacon', x: 0, z: 0, r: 1.5, h: 9 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    add({ type: 'pylon', x: Math.sin(a) * 11.5, z: Math.cos(a) * 11.5, r: 0.8, h: 5, rot: a });
  }
  // Gateways on the three roads out of the Sanctum: two posts each. The road
  // itself (the line to each zone) passes cleanly between them.
  for (const key of ['sporefield', 'relay', 'vault']) {
    const zn = ZONES[key];
    const d = Math.hypot(zn.x, zn.z);
    for (const side of [-1, 1]) {
      add({ type: 'gatepost', x: (zn.x / d) * 14.6 + (-zn.z / d) * side * 2.05, z: (zn.z / d) * 14.6 + (zn.x / d) * side * 2.05, r: 0.45, h: 5 });
    }
  }
  add({ type: 'console', x: 5.2, z: -4.6, hw: 1.3, hd: 0.6, h: 1.3 });
  add({ type: 'crate', x: -5.5, z: -5.0, hw: 0.8, hd: 0.8, h: 1.2 });
  add({ type: 'crate', x: -7.0, z: -4.2, hw: 0.6, hd: 0.6, h: 0.9 });

  // --- The Sporefield: giant fungal growths ---
  const sf = ZONES.sporefield;
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 5 + rnd() * 17;
    const s = 0.8 + rnd() * 1.1;
    add({ type: 'sporetree', x: sf.x + Math.sin(a) * d, z: sf.z + Math.cos(a) * d, r: 0.55 * s, h: 5 * s, s, seed: Math.floor(rnd() * 1e6) });
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 4 + rnd() * 18;
    add({ type: 'pod', x: sf.x + Math.sin(a) * d, z: sf.z + Math.cos(a) * d, r: 0.9, h: 1.4, s: 0.8 + rnd() * 0.6 });
  }

  // --- Derelict Relay: ruined technology ---
  const rl = ZONES.relay;
  add({ type: 'relaytower', x: rl.x + 1, z: rl.z - 1, r: 2.4, h: 14 });
  add({ type: 'wall', x: rl.x - 7, z: rl.z + 9, hw: 5, hd: 0.6, h: 3.2 });
  add({ type: 'wall', x: rl.x + 9, z: rl.z + 8, hw: 3.5, hd: 0.6, h: 2.2 });
  add({ type: 'wall', x: rl.x + 12.5, z: rl.z - 2, hw: 0.6, hd: 5.5, h: 3.6 });
  add({ type: 'wall', x: rl.x - 11, z: rl.z - 5, hw: 0.6, hd: 4, h: 2.6 });
  add({ type: 'wall', x: rl.x - 3, z: rl.z - 11, hw: 4.5, hd: 0.6, h: 1.8 });
  add({ type: 'dish', x: rl.x + 6, z: rl.z - 9, r: 2.2, h: 2.5 });
  add({ type: 'crate', x: rl.x - 5, z: rl.z + 3, hw: 0.9, hd: 0.9, h: 1.3 });

  // --- Resonance Vault: a ring of monoliths open on its south side, facing the Sanctum ---
  const vt = ZONES.vault;
  for (let i = 0; i < 12; i++) {
    if (i === 0 || i === 11) continue; // the gateway
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    add({ type: 'monolith', x: vt.x + Math.sin(a) * 15.5, z: vt.z + Math.cos(a) * 15.5, r: 1.35, h: 7 + ((i * 37) % 5), rot: a });
  }

  // --- The Listening Stone: an obelisk hidden in a rock hollow ---
  const ob = ZONES.obelisk;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    // Leave a gap on the east side so the hollow can be entered.
    if (i === 2) continue;
    add({ type: 'rock', x: ob.x + Math.sin(a) * 7.2, z: ob.z + Math.cos(a) * 7.2, r: 2.6, h: 4.5 + (i % 3) * 1.4, s: 2.6, seed: 500 + i });
  }

  // --- Scatter: rocks, crystal outcrops, conduit trees ---
  const blocked = (x, z, pad) => {
    if (Math.hypot(x, z) > WORLD.radius - 12) return true;
    for (const k of Object.keys(ZONES)) {
      if (k === 'survey') continue; // preserve the legacy scatter sequence
      const zn = ZONES[k];
      if (Math.hypot(x - zn.x, z - zn.z) < zn.r + pad) return true;
    }
    return false;
  };
  const scatterStart = props.length;
  let placed = 0;
  let guard = 0;
  while (placed < 46 && guard++ < 2000) {
    const x = (rnd() * 2 - 1) * WORLD.radius;
    const z = (rnd() * 2 - 1) * WORLD.radius;
    if (blocked(x, z, 3)) continue;
    const roll = rnd();
    const s = 0.7 + rnd() * 1.3;
    if (roll < 0.4) add({ type: 'rock', x, z, r: 1.0 * s, h: 1.6 * s, s, seed: Math.floor(rnd() * 1e6) });
    else if (roll < 0.7) add({ type: 'crystal', x, z, r: 0.7 * s, h: 3 * s, s, seed: Math.floor(rnd() * 1e6) });
    else add({ type: 'conduit', x, z, r: 0.5 * s, h: 6 * s, s, seed: Math.floor(rnd() * 1e6) });
    placed++;
  }
  // Replace only old scatter within the cut; keep the original world layout elsewhere.
  const survey = ZONES.survey;
  const retained = props.slice(0, scatterStart).concat(props.slice(scatterStart).filter(p => Math.hypot(p.x - survey.x, p.z - survey.z) >= survey.r + 2));
  retained.push(
    { type: 'survey_pump', x: 43, z: -39, hw: 2.15, hd: 1.45, h: 4.8 },
    { type: 'survey_pump', x: 51, z: -32, hw: 2.15, hd: 1.45, h: 4.8 },
    { type: 'wall', x: 43, z: -43, hw: 5, hd: 0.6, h: 2.8 },
    { type: 'wall', x: 53, z: -37, hw: 0.6, hd: 3.5, h: 2.4 },
    { type: 'crate', x: 38, z: -39, hw: 0.9, hd: 0.8, h: 1.2 },
    { type: 'crate', x: 49, z: -39, hw: 0.8, hd: 0.7, h: 1.1 },
  );
  return retained;
}

export const PROPS = buildProps();
export const COLLIDERS = PROPS.filter((p) => p.r !== undefined || p.hw !== undefined);

/** Interactive, non-hostile world objects. The server owns their state. */
export const OBJECTS = [
  { key: 'obelisk', type: 'obelisk', name: 'The Listening Stone', x: ZONES.obelisk.x, z: ZONES.obelisk.z, r: 1.0 },
  { key: 'archivist', type: 'archivist', name: 'Archivist Venn', x: 4.2, z: -2.6, r: 0.5 },
  { key: 'survey_signal', type: 'survey_signal', name: 'Pressure Receiver', x: 39, z: -32, r: 0.8 },
  { key: 'survey_ledger', type: 'survey_ledger', name: 'Shift Ledger', x: 47, z: -32, r: 0.8 },
];

const STATIC_COLLIDERS = COLLIDERS.concat(OBJECTS.map((o) => ({ x: o.x, z: o.z, r: o.r })));

/**
 * Push a circle of radius `rad` out of all static colliders and keep it inside
 * the world. Mutates and returns `p` ({x, z}).
 */
export function resolveCollisions(p, rad) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < STATIC_COLLIDERS.length; i++) {
      const c = STATIC_COLLIDERS[i];
      if (c.r !== undefined) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = c.r + rad;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          if (d < 1e-6) {
            p.x = c.x + min;
          } else {
            p.x = c.x + (dx / d) * min;
            p.z = c.z + (dz / d) * min;
          }
        }
      } else {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const cx = dx < -c.hw ? -c.hw : dx > c.hw ? c.hw : dx;
        const cz = dz < -c.hd ? -c.hd : dz > c.hd ? c.hd : dz;
        const ox = dx - cx;
        const oz = dz - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 < rad * rad) {
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            p.x = c.x + cx + (ox / d) * rad;
            p.z = c.z + cz + (oz / d) * rad;
          } else {
            // Centre is inside the box: exit through the nearest face.
            const px = c.hw - Math.abs(dx);
            const pz = c.hd - Math.abs(dz);
            if (px < pz) p.x = c.x + (dx < 0 ? -1 : 1) * (c.hw + rad);
            else p.z = c.z + (dz < 0 ? -1 : 1) * (c.hd + rad);
          }
        }
      }
    }
  }
  const lim = WORLD.radius - 6;
  const r = Math.hypot(p.x, p.z);
  if (r > lim) {
    p.x = (p.x / r) * lim;
    p.z = (p.z / r) * lim;
  }
  return p;
}

/**
 * Advance one fixed movement step. `s` is {x, z, jy, vy}; `inp` is
 * {f, s, yaw, j} where f/s are -1..1 forward/strafe intents in character
 * space. `speedMul` of 0 means the character cannot move (rooted / dead).
 * Yaw 0 faces +Z; forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw).
 */
export function stepMove(s, inp, speedMul) {
  let f = inp.f;
  let st = inp.s;
  const len = Math.hypot(f, st);
  if (len > 1) {
    f /= len;
    st /= len;
  }
  if (speedMul > 0 && len > 0) {
    const speed = RUN_SPEED * speedMul * (f < 0 ? BACK_SPEED_MUL : 1);
    const sin = Math.sin(inp.yaw);
    const cos = Math.cos(inp.yaw);
    s.x += (sin * f - cos * st) * speed * MOVE_DT;
    s.z += (cos * f + sin * st) * speed * MOVE_DT;
    resolveCollisions(s, PLAYER_RADIUS);
  }
  if (s.jy > 0 || s.vy > 0) {
    s.vy -= GRAVITY * MOVE_DT;
    s.jy += s.vy * MOVE_DT;
    if (s.jy <= 0) {
      s.jy = 0;
      s.vy = 0;
    }
  } else if (inp.j && speedMul > 0) {
    s.vy = JUMP_VELOCITY;
    s.jy = s.vy * MOVE_DT;
  }
  return s;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function inSanctum(p) {
  return Math.hypot(p.x - WORLD.sanctum.x, p.z - WORLD.sanctum.z) < WORLD.sanctum.r;
}

export function zoneAt(x, z) {
  for (const k of Object.keys(ZONES)) {
    const zn = ZONES[k];
    if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn.name;
  }
  return WORLD.name;
}
