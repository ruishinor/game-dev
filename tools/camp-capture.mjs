// In-game review views of the Scrapyard camp in the Severance Expanse: real
// server, real client. The garrison is held at its posts (server capture fixture).
//   node tools/camp-capture.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { SEVERANCE_EXPANSE as E, SALVAGE_CAMP as C } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/camp-capture.mjs <outDir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Camp Surveyor');
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Camp Surveyor');
  const game = server.game;
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; game.refreshStats(p); game.markDirty(p);
  game.transferPlayer(p, { ...E.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  game.openExpanse();
  game.aiHold = true;
  await page.waitForFunction(() => window.__attune.state().ents.filter((e) => e.c === 'sentinel' || e.c === 'turret_drone').length >= 5, null, { polling: 500, timeout: 60000 }).catch(() => console.log('garrison not confirmed'));
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });
  const target = { x: C.x - 3, z: C.z };
  const shot = async (name, at, cam, { tod = 'day', settle = 3000, look = target } = {}) => {
    const face = Math.atan2(look.x - at.x, look.z - at.z);
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.8; }, [at.x, at.z], { polling: 250 });
    await page.evaluate(([f, c, key]) => { window.__attune.timeOfDay?.({ key }); window.__attune.view({ face: f, yaw: f, ...c }); }, [face, cam, tod]);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(out, name + '.png') });
    const d = await page.evaluate(() => window.__attune.state().draw);
    console.log(name, 'calls', d.calls, 'tris', d.triangles);
  };
  await page.waitForFunction(() => window.__attune.gfx.scene.getObjectByName('salvage-camp')?.children.length > 6, null, { polling: 500, timeout: 120000 }).catch(() => console.log('camp not confirmed'));
  await shot('c01-approach-east', { x: C.x + 26, z: C.z + 3 }, { pitch: 0.12, dist: 7 }, { settle: 5000 });
  await shot('c02-entrance', { x: C.x + 13, z: C.z }, { pitch: 0.1, dist: 5 });
  await shot('c03-overview-high', { x: C.x + 18, z: C.z - 16 }, { pitch: 0.55, dist: 16 });
  await shot('c04-forge-overseer', { x: C.x + 2.5, z: C.z - 2 }, { pitch: 0.08, dist: 4 }, { look: { x: C.x - 5, z: C.z + 0.5 } });
  await shot('c05-night', { x: C.x + 14, z: C.z - 5 }, { pitch: 0.2, dist: 8 }, { tod: 'night' });
  await shot('c06-dusk-west-wall', { x: C.x - 17, z: C.z + 4 }, { pitch: 0.15, dist: 7 }, { tod: 'dusk' });
  if (errors.length) console.log('page errors', errors.slice(0, 5));
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
