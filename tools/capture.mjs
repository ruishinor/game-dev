// Repeatable screenshots of the game from fixed viewpoints, for before/after
// comparison. Starts its own server; the server handle is used only to place
// characters (the same kind of setup the e2e test logs as [harness]).
//
//   npm run capture                 new presentation  -> docs/evidence/after/
//   npm run capture -- before       original procedural presentation (?glb=none) -> docs/evidence/before-matched/
//   npm run capture -- after 05     only shots whose name contains "05"
//
// Rendering is software WebGL unless ATTUNEMENT_GPU=1 (see tools/browser.mjs),
// so frames take seconds; nothing here measures performance.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { PROPS, ZONES } from '../shared/world.js';
import { CLASSES } from '../shared/content.js';
import { CREATURES } from '../client/src/anim-tables.js';
import { launchBrowser, describeGraphics, activeBrowserPlayer } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'before' ? 'before' : 'after';
const only = process.argv[3] || '';
const OUT = process.env.ATTUNEMENT_CAPTURE_DIR || path.join(ROOT, 'docs', 'evidence', mode === 'before' ? 'before-matched' : 'after');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startServer({ port: 0, dataFile: null });
const game = srv.game;
const browser = await launchBrowser();
const errors = [];
const query = `q=${process.env.ATTUNEMENT_CAPTURE_QUALITY || 2}&qlock=1&nolock=1${mode === 'before' ? '&glb=none' : ''}`;

async function join(slot, name, cls, look) {
  for (const o of clients) await pause(o, true);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto(`http://127.0.0.1:${srv.port}/?${query}&slot=${slot}`);
  await page.fill('#name', name);
  await page.click(`.classcard[data-cls="${cls}"]`);
  if (look) await page.click(`.lookcard[data-look="${look}"]`);
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos);
  const client = { page, ctx, name };
  clients.push(client);
  return client;
}
// Only the client being waited on draws (join() pauses everyone else); a
// paused client would never reach the frame count.
const frames = async (c, n = 3) => {
  for (const o of clients) await pause(o, o !== c);
  const start = await c.page.evaluate(() => window.__attune.state().drawn);
  await c.page.waitForFunction((f) => window.__attune.state().drawn >= f, start + n);
};
async function put(c, x, z, face) {
  const p = await activeBrowserPlayer(c.page, srv, c.name);
  p.hp = p.maxHp;
  p.x = x;
  p.z = z;
  if (p.companion) {
    p.companion.x = x + 1.4;
    p.companion.z = z - 0.6;
  }
  await c.page.waitForFunction(([tx, tz]) => {
    const s = window.__attune.state();
    return s.pos && Math.hypot(s.pos.x - tx, s.pos.z - tz) < 1.5;
  }, [x, z]);
  if (face !== undefined) await c.page.evaluate((f) => window.__attune.view({ face: f, yaw: f }), face);
}
const view = (c, v) => c.page.evaluate((v) => window.__attune.view(v), v);
// Software rendering cannot draw two clients at once in reasonable time, so
// only the client being photographed renders; the others keep simulating.
const clients = [];
const pause = (c, on) => c.page.evaluate((v) => window.__attune.pause(v), on).catch(() => {});
async function shot(c, name) {
  if (only && !name.includes(only)) return;
  await frames(c, 4);
  // A dead photographed player makes the shot meaningless evidence.
  const dead = await c.page.evaluate(() => {
    const s = window.__attune.state();
    return !!s.ents.find((e) => e.id === s.myId)?.dead;
  });
  if (dead) errors.push(`${name}: ${c.name} was dead when photographed`);
  await c.page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 240000 });
  console.log(`  ${name}.png`);
}
const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

let failed = false;
try {
  const sf = ZONES.sporefield;
  const A = await join('a', 'Brakka', 'vanguard');
  console.log(`graphics: ${JSON.stringify(await describeGraphics(A.page))}`);
  console.log(`mode: ${mode} -> ${path.relative(ROOT, OUT)}`);

  await view(A, { yaw: Math.PI, pitch: 0.32, dist: 10, face: Math.PI });
  await shot(A, '01-sanctum-arrival');
  await put(A, 0, 11.5, Math.PI);
  await view(A, { pitch: 0.42, dist: 23 });
  await shot(A, '02-sanctum-wide');
  await put(A, -9, 6.5, toward(-9, 6.5, 4, -3));
  await view(A, { pitch: 0.2, dist: 8 });
  await shot(A, '03-sanctum-interior');
  await put(A, -19, 11.5, toward(-19, 11.5, sf.x, sf.z));
  await view(A, { pitch: 0.3, dist: 11 });
  await shot(A, '04-road-to-sporefield');
  await put(A, -29, 18, toward(-29, 18, sf.x, sf.z));
  await view(A, { pitch: 0.28, dist: 10 });
  await shot(A, '05-sporefield-edge');

  // Occlusion: stand so the largest spore tree is between camera and player.
  const tree = PROPS.filter((p) => p.type === 'sporetree').sort((a, b) => b.s - a.s)[0];
  const ty = toward(tree.x, tree.z, sf.x, sf.z);
  await put(A, tree.x + Math.sin(ty) * 3.2, tree.z + Math.cos(ty) * 3.2, ty);
  await view(A, { pitch: 0.42, dist: 12 });
  await shot(A, '06-behind-spore-tree');

  // Combat with a second player supporting. Wait in the safe zone while the
  // second client loads.
  await put(A, 2, 9, Math.PI);
  const B = await join('b', 'Lumen', 'symbiotech');
  const sk = game.enemies.filter((e) => e.type === 'skitter')[0];
  const fy = toward(sk.x + 1.3, sk.z + 2.6, sk.x, sk.z);
  await put(A, sk.x + 1.3, sk.z + 2.6, fy);
  await put(B, sk.x + 5.5, sk.z + 7, toward(sk.x + 5.5, sk.z + 7, sk.x, sk.z));
  await view(A, { yaw: fy + 0.7, pitch: 0.3, dist: 8.5 });
  await view(B, { pitch: 0.3, dist: 10 });
  await A.page.keyboard.press('Tab');
  await B.page.keyboard.press('Tab');
  await frames(A, 2);
  await A.page.keyboard.press('Digit1');
  await B.page.keyboard.press('Digit1');
  // Software frames take seconds while the server keeps simulating, so the
  // fight would outlast the players. Harness only: keep both at or above a
  // wounded floor (A is wounded on purpose so the heal shows).
  const fighters = [await activeBrowserPlayer(A.page, srv, A.name), await activeBrowserPlayer(B.page, srv, B.name)];
  const keepAlive = setInterval(() => {
    for (const p of fighters) if (p.hp > 0 && p.hp < 80) p.hp = 120;
  }, 200);
  await shot(A, '07-combat-vanguard');
  const a = await activeBrowserPlayer(A.page, srv, A.name);
  a.hp = Math.min(a.hp, 120);
  await B.page.click('.frame.ally');
  await B.page.keyboard.press('Digit2');
  await shot(B, '08-support-conductor');
  await A.page.keyboard.press('Digit3');
  await shot(A, '09-kinetic-ward');
  // Tab picks the nearest enemy, which need not be sk: finish A's actual target.
  const targetId = await A.page.evaluate(() => window.__attune.state().target);
  const victim = game.enemies.find((e) => e.id === targetId) || sk;
  victim.hp = 1;
  await A.page.keyboard.press('Digit4');
  await sleep(1500);
  await shot(A, '10-enemy-destroyed');
  clearInterval(keepAlive);
  clients.splice(clients.indexOf(B), 1);
  await B.ctx.close();

  // Red Rucker, close and in the world.
  const C = await join('c', 'Rucker', 'vanguard', mode === 'before' ? null : 'red_rucker');
  await put(A, 3.2, 9.5, 0);
  await put(C, -1.5, 9.5, 0);
  await view(C, { yaw: Math.PI, pitch: 0.12, dist: 4.2, face: 0 });
  await shot(C, '11-red-rucker-front');
  await view(C, { yaw: 0.5, pitch: 0.15, dist: 4.5, face: 0 });
  await shot(C, '12-red-rucker-back');
  await view(C, { yaw: Math.PI + 0.25, pitch: 0.14, dist: 7.5, face: 0 });
  await shot(C, '13-two-vanguards');
  const state = await C.page.evaluate(() => window.__attune.state());
  console.log(`models: ${state.ents.map((e) => `${e.c}:${e.model}`).join(' ')}`);
  console.log(`world: ${JSON.stringify(state.world)}  draw: ${JSON.stringify(state.draw)}`);
  const needsRig = (e) => Object.hasOwn(CLASSES, e.c) || Object.hasOwn(CREATURES, e.c) || ['archivist', 'mender'].includes(e.c);
  if (mode === 'after' && (Object.keys(state.assets.failed).length || state.ents.some((e) => needsRig(e) && e.model !== 'glb'))) {
    failed = true;
    console.log('FAIL: an entity fell back to its procedural model');
  }
} catch (err) {
  failed = true;
  console.log(`FAIL: ${err.stack || err}`);
} finally {
  await browser.close();
  await srv.close();
}
if (errors.length) {
  failed = true;
  console.log(`FAIL: script errors: ${errors.slice(0, 5).join(' | ')}`);
}
process.exit(failed ? 1 : 0);
