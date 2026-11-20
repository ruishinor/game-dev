// In-game review views of the Phase Scar rift at both ends (Reach and Expanse
// return): real server, real client. Out-of-Git review material.
//
//   node tools/rift-capture.mjs <outDir> [prefixes]
//
// The capture fixture pins the server-side rift phase so each phase can be
// framed; it never changes gameplay code. Each view records draw calls.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { RIFT_SITE } from '../shared/world.js';
import { SEVERANCE_EXPANSE as E } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/rift-capture.mjs <outDir> [prefixes]'); process.exit(2); }
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
  await page.fill('#name', 'Rift Surveyor');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Rift Surveyor');
  const game = server.game;
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; p.char.attunements = ['resonance']; p.char.riftCalibration = 'completed';
  game.refreshStats(p); game.markDirty(p);
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });

  const pin = (phase) => { if (game.rift) { game.rift.phase = phase; game.rift.until = Infinity; game.rift.pulseAt = 0; } };
  async function shot(name, at, face, cam, { tod = 'day', settle = 2500, phase = null, region = null } = {}) {
    if (only.length && !only.some((o) => name.startsWith(o))) return;
    if (phase) pin(phase);
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.8; }, [at.x, at.z], { polling: 250 });
    await page.evaluate(([f, c, key]) => { window.__attune.timeOfDay?.(key === 'off' ? { mode: 'off' } : { key }); window.__attune.view({ face: f, ...c }); }, [face, cam, tod]);
    await page.waitForTimeout(settle);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    const s = await page.evaluate(() => { const s = window.__attune.state(); return { draw: s.draw, pos: s.pos }; });
    log.push({ name, at, face, cam, tod, phase, region, ...s });
    console.log(name, phase ?? '', 'calls', s.draw.calls, 'tris', s.draw.triangles);
  }

  // Reach Phase Scar: object yaw .9, membrane faces local +Z.
  const yaw = 0.9, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const front = (d, side = 0) => ({ x: RIFT_SITE.x + fx * d + fz * side, z: RIFT_SITE.z + fz * d - fx * side });
  const look = yaw + Math.PI;
  const toward = (at) => Math.atan2(RIFT_SITE.x - at.x, RIFT_SITE.z - at.z);
  await shot('r01-reach-wide-unstable', front(9, 2), look, { yaw: look, pitch: 0.12, dist: 6 }, { phase: 'unstable', settle: 4000 });
  await shot('r02-reach-front-close-unstable', front(5), look, { yaw: look, pitch: 0.05, dist: 3.2 }, { phase: 'unstable' });
  await shot('r03-reach-front-close-stabilized', front(5), look, { yaw: look, pitch: 0.05, dist: 3.2 }, { phase: 'stabilized' });
  await shot('r04-reach-three-quarter-dormant', front(6, 4), toward(front(6, 4)), { yaw: toward(front(6, 4)), pitch: 0.1, dist: 4 }, { phase: 'dormant' });
  await shot('r05-reach-three-quarter-unstable', front(6, 4), toward(front(6, 4)), { yaw: toward(front(6, 4)), pitch: 0.1, dist: 4 }, { phase: 'unstable' });
  await shot('r06-reach-profile', front(0.5, 6), toward(front(0.5, 6)), { yaw: toward(front(0.5, 6)), pitch: 0.08, dist: 4 }, { phase: 'unstable' });
  await shot('r07-reach-night-unstable', front(7, 1.5), look, { yaw: look, pitch: 0.1, dist: 5 }, { phase: 'unstable', tod: 'night' });
  await shot('r08-reach-gameplay-distance', front(16, 3), look, { yaw: look, pitch: 0.28, dist: 11 }, { phase: 'unstable' });

  // Expanse return rift beside the arrival terrace.
  game.transferPlayer(p, { ...E.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  const S = Math.PI;
  await shot('e01-expanse-return', { x: E.arrival.x + 2, z: E.arrival.z + 5 }, S + 0.4, { yaw: S + 0.4, pitch: 0.16, dist: 6 }, { region: 'expanse', settle: 4000 });
  await shot('e02-expanse-return-close', { x: E.arrival.x + 1, z: E.arrival.z + 2 }, S + 0.9, { yaw: S + 0.9, pitch: 0.05, dist: 3.2 }, { region: 'expanse' });
  await shot('e03-expanse-return-dusk', { x: E.arrival.x + 2, z: E.arrival.z + 5 }, S + 0.4, { yaw: S + 0.4, pitch: 0.16, dist: 6 }, { region: 'expanse', tod: 'dusk' });

  if (errors.length) console.log('page errors', errors);
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors, log }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
