// In-game review views of the Severance Soldier squads: real server, real
// client, the patrols held in place (server capture fixture).
//   node tools/soldier-capture.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { SEVERANCE_EXPANSE as E, SALVAGE_CAMP as C, SALVAGE_CAMP_PIECES } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/soldier-capture.mjs <outDir>'); process.exit(2); }
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
  await page.fill('#name', 'Squad Observer');
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Squad Observer');
  const game = server.game;
  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; game.refreshStats(p); game.markDirty(p);
  game.transferPlayer(p, { ...E.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, { polling: 250 });
  game.openExpanse();
  game.aiHold = true;
  await page.waitForFunction(() => window.__attune.state().ents.filter((e) => e.c === 'sentinel' || e.c === 'turret_drone').length >= 5, null, { polling: 500, timeout: 60000 }).catch(() => console.log('garrison not confirmed'));
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view, #view * { visibility: visible !important; }' });
  const squad = game.enemies.filter((e) => e.squad === 'north_west');
  const lead = squad.find((e) => e.elite);
  // gather the squad in a line across its own (validated clear) route
  const r0 = lead.route[0], r1 = lead.route[1], rl = Math.hypot(r1.x - r0.x, r1.z - r0.z);
  const dir = { x: (r1.x - r0.x) / rl, z: (r1.z - r0.z) / rl }, across = { x: -dir.z, z: dir.x };
  const base = { x: r0.x + dir.x * 4, z: r0.z + dir.z * 4 };
  squad.forEach((e, i) => { const k = (i - (squad.length - 1) / 2) * 1.9; e.x = base.x + across.x * k; e.z = base.z + across.z * k; e.yaw = Math.atan2(dir.x, dir.z); });
  p.char.level = 5; game.refreshStats(p);
  const shot = async (name, at, look, cam, { tod = 'day', settle = 3000 } = {}) => {
    const face = Math.atan2(look.x - at.x, look.z - at.z);
    p.x = at.x; p.z = at.z; p.yaw = face;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 2; }, [at.x, at.z], { polling: 250, timeout: 60000 }).catch(() => console.log(name, 'position not confirmed'));
    await page.evaluate(([f, c, key]) => { window.__attune.timeOfDay?.({ key }); window.__attune.view({ face: f, yaw: f, ...c }); }, [face, cam, tod]);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(out, name + '.png') });
    const d = await page.evaluate(() => window.__attune.state().draw);
    console.log(name, 'calls', d.calls, 'tris', d.triangles);
  };
  const front = { x: base.x + dir.x * 9, z: base.z + dir.z * 9 };
  await shot('s01-squad-line-day', front, base, { pitch: 0.06, dist: 3 }, { settle: 30000 });
  await shot('s02-overseer-close', { x: lead.x + dir.x * 4, z: lead.z + dir.z * 4 }, lead, { pitch: 0.02, dist: 2.2 });
  await shot('s03-squad-dusk', front, base, { pitch: 0.06, dist: 3 }, { tod: 'dusk' });
  await shot('s04-squad-night', front, base, { pitch: 0.06, dist: 3 }, { tod: 'night' });
  const ld = await page.evaluate(() => { let worn = 0, fx = 0; window.__attune.gfx.scene.traverse((o) => { if (o.userData?.armour) worn++; if (o.isMesh && /Channel/.test(o.material?.name || '') ) fx++; }); return { worn, fx }; });
  console.log('armour meshes', JSON.stringify(ld));
  if (errors.length) console.log('page errors', errors.slice(0, 5));
  fs.writeFileSync(path.join(out, 'capture-log.json'), JSON.stringify({ software: SOFTWARE_GL, errors }, null, 1));
} finally {
  await browser?.close();
  await server.close();
}
