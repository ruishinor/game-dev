import { SALVAGE_GARRISON } from '../server/sim/severance-camps.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { makeGame, makeChar, place } from './helpers.js';
import { SEVERANCE_PATROLS } from '../server/sim/severance-patrols.js';
import { ENEMIES } from '../shared/content.js';
import { COLLIDERS, travelRegionAt, inSafeZone } from '../shared/world.js';
import { EXPEDITION_OUTPOST as OP, SEVERANCE_EXPANSE as E, inSeverancePocket } from '../shared/severance-gate.js';

const blocked = (x, z, R) => COLLIDERS.some((c) => c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + R : Math.abs(x - c.x) < c.hw + R && Math.abs(z - c.z) < c.hd + R);

test('patrol routes are walkable, inside the Expanse, clear of the outpost and the arrival', () => {
  assert.ok(SEVERANCE_PATROLS.length >= 8);
  const kinds = new Set(SEVERANCE_PATROLS.map((p) => p.type));
  assert.ok(kinds.size >= 4, 'several enemy families');
  for (const p of SEVERANCE_PATROLS) {
    const R = ENEMIES[p.type].radius, r = p.route;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
        assert.ok(inSeverancePocket(x, z) && !blocked(x, z, R), `${p.name} segment ${i} is open`);
        assert.ok(Math.hypot(x - OP.x, z - OP.z) > OP.r + 25, `${p.name} keeps clear of the outpost`);
        assert.ok(Math.hypot(x - E.arrival.x, z - E.arrival.z) > 40, `${p.name} keeps clear of the arrival`);
      }
    }
  }
});

test('patrols spawn once with the first arrival, walk their routes, and persist', () => {
  const g = makeGame();
  const before = g.enemies.length;
  assert.ok(!g.enemies.some((e) => e.severancePatrol), 'nothing spawns before anyone enters');
  g.openExpanse(); g.openExpanse();
  const patrols = g.enemies.filter((e) => e.severancePatrol);
  assert.equal(patrols.length, SEVERANCE_PATROLS.length);
  // the Expanse opens with its patrols and the Scrapyard garrison, once
  assert.equal(g.enemies.length, before + SEVERANCE_PATROLS.length + SALVAGE_GARRISON.length);
  for (const e of patrols) assert.equal(travelRegionAt(e.x, e.z), 'severance_expanse');
  const start = patrols.map((e) => ({ x: e.x, z: e.z }));
  for (let i = 0; i < 400; i++) g.tick(50);
  const moved = patrols.filter((e, i) => Math.hypot(e.x - start[i].x, e.z - start[i].z) > 4).length;
  assert.ok(moved >= patrols.length - 1, `patrols move along their routes (${moved}/${patrols.length})`);
  for (const e of patrols) assert.equal(travelRegionAt(e.x, e.z), 'severance_expanse');
});

test('a patrol engages, leashes to where it left its route, then resumes; the outpost is safe', () => {
  const g = makeGame();
  g.openExpanse();
  const e = g.enemies.find((x) => x.severancePatrol && x.type === 'sentinel');
  const def = ENEMIES[e.type];
  for (let i = 0; i < 200; i++) g.tick(50);            // well along its route
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  place(p, e.x + 4, e.z);
  g.tick(50);
  assert.ok(e.threat.has(p.id), 'aggro within range of the patrol');
  const post = { ...e.post };
  const resume = e.routeIndex;
  // run far beyond the leash: the patrol gives up and returns to its post
  place(p, post.x + def.leash + 25, post.z);
  for (let i = 0; i < 600 && e.state !== 'idle'; i++) g.tick(50);
  assert.equal(e.state, 'idle');
  assert.ok(Math.hypot(e.x - post.x, e.z - post.z) < 1.5, 'back at its post, not at the route start');
  assert.equal(e.routeIndex, resume, 'resumes the route where it left it');
  // a player in the outpost is never engaged, even by a patrol standing next to the camp
  place(p, OP.x, OP.z);
  assert.ok(inSafeZone(p));
  e.x = OP.x + OP.r + 1; e.z = OP.z; e.post = { x: e.x, z: e.z }; e.threat.clear(); e.state = 'idle';
  for (let i = 0; i < 20; i++) g.tick(50);
  assert.equal(e.threat.has(p.id), false);
});

test('patrol routes stay server-only: no client module imports them and HTTP does not serve them', async () => {
  for (const f of readdirSync('client/src', { recursive: true }).filter((n) => String(n).endsWith('.js'))) {
    assert.ok(!readFileSync('client/src/' + f, 'utf8').includes('severance-patrols'), f);
  }
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    for (const url of ['/server/sim/severance-patrols.js', '/client/../server/sim/severance-patrols.js', '/shared/../server/sim/severance-patrols.js']) {
      assert.notEqual((await fetch('http://127.0.0.1:' + srv.port + url)).status, 200, url);
    }
  } finally { await srv.close(); }
});
