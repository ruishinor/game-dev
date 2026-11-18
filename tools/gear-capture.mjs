// Close-up back/front screenshots of each profession's default look, for
// reviewing character equipment. Presentation evidence only.
//
//   node tools/gear-capture.mjs [label]   -> docs/evidence/gear/<label>/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { launchBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] || 'after';
const OUT = path.join(ROOT, 'docs', 'evidence', 'gear', label);
fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const errors = [];
let failed = false;
try {
  for (const cls of ['vanguard', 'symbiotech', 'keeper', 'surveyor']) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', (e) => errors.push(`${cls}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${cls}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1`);
    await page.fill('#name', `Gear${cls.slice(0, 5)}`);
    await page.click(`.classcard[data-cls="${cls}"]`);
    await page.click('#enter');
    await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.drawn > 2 && s.ents.some((e) => e.id === s.myId && e.model === 'glb'); });
    if(cls!=='vanguard')await page.waitForFunction(k=>!!window.__attune.gfx.scene.getObjectByName('utility-pouch:'+k),cls==='symbiotech'?'conductor':cls);
    await page.evaluate(() => document.querySelectorAll('#hud, .hud, #ui, .panel, .directive').forEach((n) => (n.style.visibility = 'hidden')));
    for (const [name, yaw] of [['back', 0], ['front', Math.PI], ['three-quarter', Math.PI * 0.75]]) {
      await page.evaluate((y) => window.__attune.view({ face: 0, yaw: y, pitch: 0.12, dist: 2.6 }), yaw);
      const f = await page.evaluate(() => window.__attune.state().frames);
      await page.waitForFunction((n) => window.__attune.state().frames >= n, f + 4);
      await page.screenshot({ path: path.join(OUT, `${cls}-${name}.jpg`), type: 'jpeg', quality: 85 });
      console.log(`  ${cls}-${name}.jpg`);
    }
    const draw = await page.evaluate(() => window.__attune.state().draw);
    console.log(`  ${cls} draw ${JSON.stringify(draw)}`);
    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  srv.close?.();
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  process.exit(failed || errors.length ? 1 : 0);
}
