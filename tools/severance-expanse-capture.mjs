// In-game review views of the full Severance Expanse: real server, real client,
// real gate and kit GLBs. Out-of-Git review material: write to a local path.
//
//   node tools/severance-expanse-capture.mjs <outDir> [prefixes]
//
// Software WebGL by default (ATTUNEMENT_GPU=1 uses the GPU; see tools/browser.mjs).
// Each view records draw calls, triangles and the kit/landmark stats.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { SEVERANCE_EXPANSE as E, SEVERANCE_RING as R, SEVERANCE_CRYSTALS, gateToWorld } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';
import { SILENT_FOUNDRY as SF } from '../shared/silent-foundry.js';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/severance-expanse-capture.mjs <outDir> [prefixes]'); process.exit(2); }
const only = (process.argv[3] || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
const log = [];
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Expanse Surveyor');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Expanse Surveyor');
  const game = server.game;
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; p.char.attunements = ['resonance']; p.char.riftCalibration = 'completed';
  game.refreshStats(p); game.markDirty(p);
  game.transferPlayer(p, { ...E.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  await page.waitForFunction(() => { const w = window.__attune.state().world; return w.severance?.status === 'ready' && ['ready', 'fallback'].includes(w.severanceKit?.status); }, null, { polling: 500 });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });

  async function shot(name, at, face, cam, { tod = 'day', settle = 2500 } = {}) {
    if (only.length && !only.some((o) => name.startsWith(o))) return;
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [at.x, at.z], { polling: 250 });
    await page.evaluate(([f, c, key]) => { window.__attune.timeOfDay(key === 'off' ? { mode: 'off' } : { key }); window.__attune.view({ face: f, ...c }); }, [face, cam, tod]);
    await page.waitForTimeout(settle);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    const s = await page.evaluate(() => { const s = window.__attune.state(); return { draw: s.draw, kit: s.world.severanceKit, gate: s.world.severance?.band, fps: s.fps, pos: s.pos }; });
    log.push({ name, file, at, face, cam, tod, ...s });
    console.log(name, tod, 'calls', s.draw.calls, 'tris', s.draw.triangles, JSON.stringify(s.kit));
  }
  const N = 0, S = Math.PI, W = -Math.PI / 2, Ea = Math.PI / 2;
  const at = (u, v) => ({ x: E.x + u, z: E.z + v });
  const ring = { x: R.x, z: R.z - 34 };
  const flats = SEVERANCE_CRYSTALS[4];
  await shot('01-arrival-terrace-north', E.arrival, N, { yaw: N, pitch: 0.14, dist: 7 }, { settle: 4000 });
  await shot('02-arrival-rift-return', { x: E.arrival.x + 2, z: E.arrival.z + 5 }, S + 0.4, { yaw: S + 0.4, pitch: 0.16, dist: 6 });
  await shot('03-west-canyon-ring-day', ring, N, { yaw: N, pitch: 0.12, dist: 7 });
  await shot('04-west-canyon-ring-dusk', ring, N, { yaw: N, pitch: 0.12, dist: 7 }, { tod: 'dusk' });
  await shot('05-beneath-the-ring', { x: R.x, z: R.z - 4 }, N, { yaw: N, pitch: -0.25, dist: 4 });
  await shot('06-central-pass', at(-24, -6), Ea, { yaw: Ea, pitch: 0.1, dist: 7 });
  await shot('07-east-crystal-flats-day', { x: flats.x - 10, z: flats.z - 12 }, 0.6, { yaw: 0.6, pitch: 0.14, dist: 7 });
  await shot('08-east-crystal-flats-night', { x: flats.x - 10, z: flats.z - 12 }, 0.6, { yaw: 0.6, pitch: 0.14, dist: 7 }, { tod: 'night' });
  await shot('09-dry-lake-mesas', at(40, -10), Ea - 0.3, { yaw: Ea - 0.3, pitch: 0.08, dist: 7 });
  await shot('10-gate-from-ceremonial-approach', gateToWorld(0, -70), N, { yaw: N, pitch: 0.16, dist: 9 });
  await shot('11-gate-basin-night', gateToWorld(0, -70), N, { yaw: N, pitch: 0.16, dist: 9 }, { tod: 'night' });
  await shot('12-overview-south', at(0, -100), N, { yaw: N, pitch: 0.55, dist: 60 }, { settle: 3500 });
  await shot('13-overview-west', at(-30, 20), Ea, { yaw: Ea, pitch: 0.5, dist: 55 }, { settle: 3500 });
  await shot('14-outpost-approach', { x: E.outpost.x - 22, z: E.outpost.z - 6 }, Ea + 0.25, { yaw: Ea + 0.25, pitch: 0.18, dist: 8 });
  await shot('14b-outpost-quartermaster', { x: E.outpost.x - 7.5, z: E.outpost.z + 0.4 }, Ea, { yaw: Ea, pitch: 0.1, dist: 3.5 });
  await shot('14d-outpost-holo-map', { x: E.outpost.x - 4.2, z: E.outpost.z + 1.2 }, Ea + 0.9, { yaw: Ea + 0.9, pitch: 0.35, dist: 3 });
  await shot('14e-outpost-shelter-side', { x: E.outpost.x + 3, z: E.outpost.z - 15 }, 0, { yaw: 0, pitch: 0.16, dist: 9 });
  await shot('14c-outpost-night', { x: E.outpost.x - 22, z: E.outpost.z - 6 }, Ea + 0.25, { yaw: Ea + 0.25, pitch: 0.18, dist: 8 }, { tod: 'night' });
  await shot('15-arrival-live-default-lighting', E.arrival, N, { yaw: N, pitch: 0.14, dist: 7 }, { tod: 'off' });
  await shot('16-gate-live-default-lighting', gateToWorld(0, -70), N, { yaw: N, pitch: 0.16, dist: 9 }, { tod: 'off' });
  await page.evaluate(() => window.__attune.timeOfDay({ mode: 'off' }));
  // the Silent Foundry behind the gate
  if (!only.length || only.some((o) => o.startsWith('2'))) {
    game.transferPlayer(p, { ...SF.arrival });
    await page.waitForFunction(() => window.__attune.state().you?.region === 'silent_foundry', null, { polling: 250 });
    const f = (u, v) => ({ x: SF.x + u, z: SF.z + v });
    await shot('20-foundry-fabrication-hall', f(0, 92), S, { yaw: S, pitch: 0.12, dist: 7 }, { tod: 'off' });
    await shot('21-foundry-cultivation-vault', f(0, 50), S, { yaw: S, pitch: 0.14, dist: 7 }, { tod: 'off' });
    await shot('22-foundry-harmonic-chamber', f(0, -4), S, { yaw: S, pitch: 0.2, dist: 8 }, { tod: 'off' });
    await shot('23-foundry-excavation-depths', f(0, -54), S, { yaw: S, pitch: 0.2, dist: 8 }, { tod: 'off' });
    await shot('24-foundry-vats-close', f(5, 20), W + 0.4, { yaw: W + 0.4, pitch: 0.1, dist: 5 }, { tod: 'off' });
  }
  const graphics = await page.evaluate(() => { const gl = window.__attune.gfx.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ graphics, software: SOFTWARE_GL, errors, views: log }, null, 1));
  if (errors.length) console.log('page errors', errors);
  console.log('captured', log.length, 'views');
} finally {
  await browser?.close();
  await server.close();
}
