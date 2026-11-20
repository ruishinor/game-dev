// In-game review views of a resonant shard vein in the Severance Expanse: real
// server, real client; the extraction is started through the real F key.
//   node tools/vein-capture.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { SEVERANCE_EXPANSE as E } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/vein-capture.mjs <outDir>'); process.exit(2); }
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
  await page.fill('#name', 'Vein Surveyor');
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Vein Surveyor');
  const game = server.game;
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; game.refreshStats(p); game.markDirty(p);
  const vein = game.objects.find((o) => o.key === 'vein_pass');
  game.transferPlayer(p, { ...E.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  await page.waitForFunction(() => !!window.__attune.gfx.scene.getObjectByName('vein:outcrop'), null, { polling: 500, timeout: 120000 }).catch(() => console.log('vein GLB not confirmed'));
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });
  const shot = async (name, at, cam, { tod = 'day', settle = 2500 } = {}) => {
    const face = Math.atan2(vein.x - at.x, vein.z - at.z);
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [at.x, at.z], { polling: 250 });
    await page.evaluate(([f, c, key]) => { window.__attune.timeOfDay?.({ key }); window.__attune.view({ face: f, yaw: f, ...c }); }, [face, cam, tod]);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log(name);
  };
  await shot('v01-approach', { x: vein.x - 7, z: vein.z - 6 }, { pitch: 0.14, dist: 6 }, { settle: 4000 });
  await shot('v02-close', { x: vein.x + 2.4, z: vein.z - 1.2 }, { pitch: 0.1, dist: 3.4 });
  // real extraction through the F key
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(out, 'v03-extracting.png') }); console.log('v03-extracting');
  await page.waitForFunction(() => (window.__attune.state().sheet?.materials?.resonance_fragment ?? 0) >= 1 || (window.__attune.state().you?.veins?.depleted?.length ?? 0) > 0, null, { polling: 100, timeout: 30000 }).catch(() => console.log('harvest not confirmed'));
  await page.screenshot({ path: path.join(out, 'v04-harvested.png') }); console.log('v04-harvested');
  await page.waitForTimeout(2500);
  await shot('v05-depleted', { x: vein.x + 2.4, z: vein.z - 1.2 }, { pitch: 0.1, dist: 3.4 });
  await shot('v06-night', { x: vein.x - 6, z: vein.z - 5 }, { pitch: 0.14, dist: 5.5 }, { tod: 'night' });
  const st = await page.evaluate(() => window.__attune.state().you?.veins);
  console.log('veins state', JSON.stringify(st), 'fragments', p.char.materials?.resonance_fragment ?? 0);
  if (errors.length) console.log('page errors', errors.slice(0, 5));
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
