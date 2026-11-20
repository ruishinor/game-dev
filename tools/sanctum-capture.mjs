// Review views of the Lattice Sanctum and its crown: real server, real client.
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
  const p = await liveFixturePlayer(page, server, 'Crown Surveyor');
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });
  const shot = async (name, at, face, cam, settle = 3000) => {
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 2.5; }, [at.x, at.z], { polling: 250, timeout: 60000 }).catch(() => console.log(name, 'position not confirmed'));
    await page.evaluate(([f, c]) => window.__attune.view({ face: f, ...c }), [face, cam]);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(out, name + '.png') });
    const s = await page.evaluate(() => window.__attune.state().draw);
    console.log(name, 'calls', s.calls, 'tris', s.triangles);
  };
  await shot('01-approach-west-road', { x: -30, z: 4 }, Math.PI / 2, { yaw: Math.PI / 2, pitch: 0.02, dist: 7 }, 4000);
  await shot('02-under-the-crown', { x: 0, z: 9 }, Math.PI, { yaw: Math.PI, pitch: -0.55, dist: 3 });
  await shot('03-wide-from-the-west-road-low', { x: -38, z: 2 }, Math.PI / 2, { yaw: Math.PI / 2, pitch: -0.25, dist: 6 });
  await shot('04-arrival-hall-to-crown', { x: 0, z: 8 }, Math.PI, { yaw: Math.PI, pitch: -0.2, dist: 6 });
  if (errors.length) console.log('page errors', errors);
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
