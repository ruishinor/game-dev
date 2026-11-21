// Environment artefact screenshots (Listening Stone near/far), presentation
// evidence only. The harness only moves the player for staging.
//
//   node tools/env-capture.mjs [label]   -> docs/evidence/env/<label>/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { ZONES } from '../shared/world.js';
import { launchBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] || 'after';
const OUT = path.join(ROOT, 'docs', 'evidence', 'env', label);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const errors = [];
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1`);
  await page.click('#gate-guest-link');
  await page.fill('#name', 'Envscout');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune?.state().myId && window.__attune.state().drawn > 2);
  let p;
  for (let i = 0; i < 100 && !p; i++) { p = [...srv.game.players.values()].find((x) => x.name === 'Envscout'); if (!p) await sleep(100); }
  const ob = ZONES.obelisk;
  const keep = setInterval(() => { if (!p.dead) p.hp = p.maxHp; }, 100);
  for (const [name, d, dist, pitch] of [['stone-far', 13, 11, 0.12], ['stone-near', 3.2, 7, 0.18], ['stone-close', 2.6, 4.2, 0.05]]) {
    p.x = ob.x + d;
    p.z = ob.z + 0.6;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return s.pos && Math.hypot(s.pos.x - x, s.pos.z - z) < 1; }, [p.x, p.z]);
    const face = Math.atan2(ob.x - p.x, ob.z - p.z);
    await page.evaluate(([f, dd, pt]) => window.__attune.view({ face: f, yaw: f + 0.35, pitch: pt, dist: dd }), [face, dist, pitch]);
    await sleep(2500); // let the proximity response ease in
    const f = await page.evaluate(() => window.__attune.state().frames);
    await page.waitForFunction((n) => window.__attune.state().frames >= n, f + 4);
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
    console.log(`  ${name}.jpg`);
  }
  clearInterval(keep);
  console.log(`  draw ${JSON.stringify(await page.evaluate(() => window.__attune.state().draw))}`);
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  srv.close?.();
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  process.exit(failed || errors.length ? 1 : 0);
}
