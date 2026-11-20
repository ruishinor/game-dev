// In-game evidence for the Severance Gate: real server, real client, real GLB.
//
//   node tools/severance-capture.mjs [outDir=docs/evidence/severance]
//
// Software WebGL by default (see tools/browser.mjs): the frames show composition,
// scale, LOD and effects, not performance. Each view records the landmark's band,
// draw calls and triangles as reported by the renderer.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { gateToWorld, SEVERANCE_POCKET, SEVERANCE_GATE as G } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2] || 'docs/evidence/severance';
// optional comma-separated name prefixes: only those views are written
const only = (process.argv[3] || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
const log = [];
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Gate Surveyor');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; });
  console.log('entered');
  const p = await liveFixturePlayer(page, server, 'Gate Surveyor');
  const game = server.game;
  // Hold the gate dormant for the first views (server-side fixture only).
  game.severance.hold = true;
  game.severance.phase = 'dormant';
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; p.char.attunements = ['resonance']; p.char.riftCalibration = 'completed';
  game.refreshStats(p); game.markDirty(p);
  game.transferPlayer(p, { ...SEVERANCE_POCKET.arrival });
  console.log('transferred');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  await page.waitForFunction(() => window.__attune.state().world.severance?.status === 'ready', null, { timeout: 240000, polling: 500 });

  console.log('landmark ready');
  async function shot(name, at, face, cam, settle = 2500) {
    if (only.length && !only.some((o) => name.startsWith(o))) return;
    const t0 = Date.now();
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [at.x, at.z], { polling: 250 });
    console.log(name, 'placed', Date.now() - t0);
    await page.evaluate(([f, c]) => window.__attune.view({ face: f, ...c }), [face, cam]);
    await page.waitForTimeout(settle);
    console.log(name, 'settled', Date.now() - t0);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    const s = await page.evaluate(() => { const s = window.__attune.state(); return { draw: s.draw, gate: s.world.severance, fps: s.fps, pos: s.pos }; });
    log.push({ name, file, at, face, cam, ...s });
    console.log(name, JSON.stringify(s.gate), 'calls', s.draw.calls, 'tris', s.draw.triangles);
  }
  // yaw 0 faces +Z; the gate lies north (+Z) of the arrival. Camera yaw follows the facing.
  const north = 0, south = Math.PI;
  await shot('01-arrival-dormant-long-distance', SEVERANCE_POCKET.arrival, north, { yaw: north, pitch: 0.12, dist: 7 }, 4000);
  await shot('02-approach-dormant', gateToWorld(0, -60), north, { yaw: north, pitch: 0.16, dist: 9 });
  await shot('03-stairs-dormant', gateToWorld(0, -22), north, { yaw: north, pitch: 0.28, dist: 11 });
  // wake the gate: the client witnesses dormant -> resonating -> active
  game.severance.hold = false;
  await page.waitForTimeout(1500);
  await shot('04-stairs-resonating', gateToWorld(0, -22), north, { yaw: north, pitch: 0.28, dist: 11 }, 1500);
  await page.waitForFunction(() => window.__attune.state().world.severance?.phase === 'active', null, { polling: 250 });
  await page.waitForTimeout(6000);
  await shot('05-stairs-active', gateToWorld(0, -22), north, { yaw: north, pitch: 0.28, dist: 11 });
  await shot('06-arrival-active-long-distance', SEVERANCE_POCKET.arrival, north, { yaw: north, pitch: 0.2, dist: 7 });
  await shot('06b-column-from-arrival', SEVERANCE_POCKET.arrival, north, { yaw: north, pitch: -0.18, dist: 4 });
  await shot('07-approach-active-mid', gateToWorld(0, -70), north, { yaw: north, pitch: 0.3, dist: 10 });
  await shot('08-three-quarter', { x: G.x + 24, z: G.z - 20 }, -0.75, { yaw: -0.75, pitch: 0.3, dist: 14 });
  await shot('09-side', { x: G.x + 30, z: G.z + 6 }, -Math.PI / 2, { yaw: -Math.PI / 2, pitch: 0.18, dist: 12 });
  await shot('10-rear', { x: G.x, z: G.z + 28 }, south, { yaw: south, pitch: 0.22, dist: 9 });
  await shot('11-player-scale-stairs', gateToWorld(0, -12), north, { yaw: north - 0.5, pitch: 0.12, dist: 6 });
  await shot('12-landing-into-passage', gateToWorld(0, -7.6), north, { yaw: north, pitch: 0.06, dist: 5 });
  await shot('13-inside-passage', gateToWorld(0, -2.5), north, { yaw: north, pitch: 0.02, dist: 3.4 });
  await shot('14-threshold', gateToWorld(0, 0.5), north, { yaw: north + 0.25, pitch: 0.05, dist: 3.0 });
  await shot('15-top-down', gateToWorld(0, -4), north, { yaw: north, pitch: 1.42, dist: 24 });
  // a traversal as seen by an observer on the stairs (the real world cue)
  await shot('16-observer-before-traversal', gateToWorld(0, -14), north, { yaw: north, pitch: 0.2, dist: 8 }, 1000);
  game.emitWorldEvent({ e: 'fx', k: 'severance_traverse', s: game.severance.gate.id, x: game.severance.gate.x, z: game.severance.gate.z, r: 2.4, m: 0 });
  await shot('17-observer-traversal-response', gateToWorld(0, -14), north, { yaw: north, pitch: 0.2, dist: 8 }, 600);
  // real traversal through the passage by this player
  const stand = gateToWorld(0, 0.5);
  p.x = stand.x; p.z = stand.z;
  await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [stand.x, stand.z], { polling: 250 });
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'phase_annex', null, { polling: 250 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '18-annex-after-traversal.png') });
  log.push({ name: '18-annex-after-traversal', region: 'phase_annex' });
  const graphics = await page.evaluate(() => { const gl = window.__attune.gfx.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ graphics, software: SOFTWARE_GL, errors, views: log }, null, 1));
  if (errors.length) console.log('page errors', errors);
  console.log('PASS captured', log.length, 'views');
} finally {
  await browser?.close();
  await server.close();
}
