// Review views of the Lattice Sanctum: real server, real client.
//   node tools/sanctum-capture.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/sanctum-capture.mjs <outDir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Crown Surveyor');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });
  const shot = async (name, at, face, cam, settle = 3000) => {
    // Re-resolve the live player each shot: a slow software client can be
    // reconnected between shots, which leaves an earlier object stale.
    const p = await liveFixturePlayer(page, server, 'Crown Surveyor');
    if (p.dead) console.log(name, 'fixture player was defeated before this shot');
    p.hp = p.maxHp;
    // As in the e2e fixtures: pause the slow software client while the server
    // moves the player, so its own stale position report cannot undo the move.
    if (SOFTWARE_GL) await page.evaluate(() => window.__attune.pause(true));
    try {
      p.x = at.x; p.z = at.z; p.yaw = face;
      await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return s.pos && s.you && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.5 && Math.hypot(s.you.x - x, s.you.z - z) < 0.5; }, [at.x, at.z], { polling: 250, timeout: 60000 }).catch(() => console.log(name, 'position not confirmed'));
    } finally {
      if (SOFTWARE_GL) await page.evaluate(() => window.__attune.pause(false));
    }
    await page.evaluate(([f, c]) => window.__attune.view({ face: f, ...c }), [face, cam]);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(out, name + '.png') });
    const s = await page.evaluate(() => window.__attune.state().draw);
    console.log(name, 'calls', s.calls, 'tris', s.triangles);
  };
  await shot('02-sanctum-centre', { x: 0, z: -6 }, 0, { yaw: 0, pitch: 0.12, dist: 5 });
  await shot('04-arrival-hall-view', { x: 0, z: 8 }, Math.PI, { yaw: Math.PI, pitch: -0.2, dist: 6 });
  await shot('05-service-console', { x: 2.4, z: -1.6 }, 2.42, { yaw: 2.42, pitch: 0.1, dist: 4.5 });
  await shot('01-approach-west-road', { x: -30, z: 4 }, Math.PI / 2, { yaw: Math.PI / 2, pitch: 0.02, dist: 7 }, 4000);
  await shot('03-wide-from-the-west-road-low', { x: -38, z: 2 }, Math.PI / 2, { yaw: Math.PI / 2, pitch: -0.25, dist: 6 });
  if (errors.length) console.log('page errors', errors);
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
