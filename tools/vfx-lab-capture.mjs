// Deterministic VFX lab captures: renders chosen effects at fixed seeds and
// times through client/vfx-lab.html and checks that a repeated seek renders the
// same frame. Review evidence only; it is not a performance benchmark (software
// rendering in CI is far slower than a GPU).
//
//   node tools/vfx-lab-capture.mjs <out-dir> [filter] [times]
//     filter -> only catalogue ids containing it (default: all)
//     times  -> comma-separated seconds (default 0.15,0.5,1.2)
//
// Writes <id>-<t>s.png per frame and report.json (stats per frame, determinism,
// page errors). Exits non-zero on a page error or a non-deterministic frame.

import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { launchBrowser } from './browser.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/vfx-lab-capture.mjs <out-dir> [filter] [times]'); process.exit(2); }
const filter = process.argv[3] || '';
const times = (process.argv[4] || '0.15,0.5,1.2').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });

const server = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const report = { frames: [], errors: [], nondeterministic: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/client/vfx-lab.html?paused=1&capture=1&light=dusk&seed=7`);
  await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 120000 });
  const ids = (await page.evaluate(() => window.__lab.catalogue)).filter((id) => id.includes(filter));
  for (const id of ids) {
    await page.evaluate((f) => window.__lab.select(f), id);
    for (const t of times) {
      const st = await page.evaluate((tt) => { window.__lab.seek(tt); return window.__lab.state(); }, t);
      const a = await page.screenshot();
      await page.evaluate((tt) => window.__lab.seek(tt), t);
      const b = await page.screenshot();
      const same = a.equals(b);
      if (!same) report.nondeterministic.push(`${id}@${t}`);
      const file = `${id.replace(/:/g, '_')}-${t.toFixed(2)}s.png`;
      fs.writeFileSync(path.join(out, file), a);
      report.frames.push({ id, t, file, deterministic: same, particles: st.stats.particles, items: st.stats.items, lights: st.stats.lights, calls: st.calls });
    }
    console.log(id, report.frames.slice(-times.length).map((f) => `${f.t}s:${f.particles}p/${f.items}i${f.deterministic ? '' : ' NONDET'}`).join('  '));
  }
} finally {
  await browser.close();
  await server.close();
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`${report.frames.length} frames, ${report.nondeterministic.length} non-deterministic, ${report.errors.length} page errors -> ${out}`);
if (report.errors.length || report.nondeterministic.length) process.exit(1);
