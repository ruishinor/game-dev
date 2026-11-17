// Close-up screenshots of appearance combinations (frame, race, hair) across
// professions. Presentation evidence only.
//
//   node tools/appearance-capture.mjs [label] [filter]   -> docs/evidence/appearance/<label>/
//
// The appearance is injected into the create message by an init script, so
// this works whether or not the creation screen offers the choice.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { launchBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] || 'after';
const only = process.argv[3] || '';
const OUT = path.join(ROOT, 'docs', 'evidence', 'appearance', label);
fs.mkdirSync(OUT, { recursive: true });

export const CAST = [
  ['vanguard', 'm.human.2.crop.1', 'colonist-m-crop'],
  ['surveyor', 'f.human.4.ponytail.2', 'colonist-f-ponytail'],
  ['symbiotech', 'f.human.5.braids.0', 'colonist-f-braids'],
  ['keeper', 'm.human.0.mohawk.4', 'colonist-m-ridge'],
  ['keeper', 'f.veyran.1.none.0', 'veyran-f'],
  ['surveyor', 'm.veyran.0.none.0', 'veyran-m'],
  ['symbiotech', 'm.mirekin.0.locs.7', 'mirekin-m-locs'],
  ['vanguard', 'f.mirekin.2.braids.8', 'mirekin-f-braids'],
  ['surveyor', 'f.human.1.bun.5', 'colonist-f-bun'],
  ['symbiotech', 'm.human.3.undercut.0', 'colonist-m-undercut'],
];

const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const errors = [];
let failed = false;
try {
  for (const [cls, ap, name] of CAST) {
    if (only && !name.includes(only)) continue;
    const ctx = await browser.newContext({ viewport: { width: 520, height: 640 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((appearance) => {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try {
          const m = JSON.parse(data);
          if (m.t === 'create' || m.t === 'account_create_character') data = JSON.stringify({ ...m, appearance });
        } catch {}
        return send.call(this, data);
      };
    }, ap);
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1`);
    await page.fill('#name', name.replace(/[^a-z]/gi, '').slice(0, 14) || 'Sample');
    await page.click(`.classcard[data-cls="${cls}"]`);
    await page.click('#enter');
    await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.drawn > 2 && s.ents.some((e) => e.id === s.myId && e.model === 'glb'); });
    await page.evaluate(() => document.querySelectorAll('#hud, .hud, #ui, .panel, .directive, .tracker, .radio-panel').forEach((n) => (n.style.visibility = 'hidden')));
    for (const [view, yaw, dist, pitch] of [['body', Math.PI * 0.8, 2.6, 0.1], ['back', 0.35, 2.4, 0.12]]) {
      await page.evaluate(([y, d, p]) => window.__attune.view({ face: 0, yaw: y, pitch: p, dist: d }), [yaw, dist, pitch]);
      const f = await page.evaluate(() => window.__attune.state().frames);
      await page.waitForFunction((n) => window.__attune.state().frames >= n, f + 4);
      await page.screenshot({ path: path.join(OUT, `${name}-${view}.jpg`), type: 'jpeg', quality: 85 });
    }
    // Portrait: pause the game's drawing and render one frame with the camera
    // square to the face (presentation-only inspection hooks).
    for (const [view, ang] of [['portrait', 0.35], ['profile', 1.35]]) {
      await page.evaluate(async (a) => {
        const A = window.__attune;
        A.pause(true);
        const s = A.state();
        const { scene, renderer, camera } = A.gfx;
        const head = s.pos.y + 1.68;
        camera.position.set(s.pos.x + Math.sin(a) * 0.95, head + 0.05, s.pos.z + Math.cos(a) * 0.95);
        camera.lookAt(s.pos.x, head - 0.03, s.pos.z);
        renderer.render(scene, camera);
      }, ang);
      await page.locator('canvas#view').screenshot({ path: path.join(OUT, `${name}-${view}.jpg`), type: 'jpeg', quality: 88 });
      await page.evaluate(() => window.__attune.pause(false));
    }
    console.log(`  ${name}`);
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
