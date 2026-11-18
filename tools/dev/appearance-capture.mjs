// In-game appearance captures through the real character-creation UI: each
// combination is chosen by clicking the pickers, then the face is framed from
// the character's eye joints (or Head bone). Software WebGL: appearance only.
//
//   node tools/dev/appearance-capture.mjs <outDir> [filter]
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../../server/index.js';
import { launchBrowser, activeBrowserPlayer } from '../browser.mjs';

const OUT = path.resolve(process.argv[2] || 'appearance-capture');
const only = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });
// [label, class, look, frame, race, skin, hair, colour]
const COMBOS = [
  ['colonist-m-crop', 'vanguard', 'red_rucker', 'm', 'human', 3, 'crop', 1],
  ['colonist-f-swept', 'symbiotech', 'conductor', 'f', 'human', 6, 'swept', 0],
  ['colonist-m-buzz-deep', 'surveyor', 'brine_surveyor', 'm', 'human', 8, 'buzz', 0],
  ['colonist-f-crop-light', 'keeper', 'aegis_keeper', 'f', 'human', 0, 'crop', 4],
  ['veyran-f', 'keeper', 'aegis_keeper', 'f', 'veyran', 0, 'none', 0],
  ['mirekin-m', 'symbiotech', 'conductor', 'm', 'mirekin', 1, 'buzz', 7],
  ['mirekin-f', 'surveyor', 'brine_surveyor', 'f', 'mirekin', 2, 'crop', 2],
];
const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const errors = [];
let slot = 1;
for (const [label, cls, look, frame, race, skin, hair, colour] of COMBOS) {
  if (only && !label.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
  const name = 'Appear' + 'abcdefghijklmnop'[slot];
  await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1&facelod=0&slot=${slot++}`);
  await page.fill('#name', name);
  await page.click(`.classcard[data-cls="${cls}"]`);
  const lc = await page.$(`.lookcard[data-look="${look}"]`);
  if (lc && (await lc.isVisible())) await lc.click();
  for (const [id, v] of [['ap-frame', frame], ['ap-race', race], ['ap-skin', skin], ['ap-hair', hair], ['ap-colour', colour]]) {
    const b = await page.$(`#${id} button[data-value="${v}"]`);
    if (b && (await b.isEnabled())) await b.click();
  }
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos);
  const p = await activeBrowserPlayer(page, srv, name);
  p.x = 2; p.z = 6; p.yaw = 0;
  await page.waitForTimeout(3000);
  for (const [view, ang, dist] of [['front', 0, 0.55], ['three-quarter', 0.65, 0.55], ['body', 0.4, 3.2]]) {
    await page.evaluate(({ ang, dist }) => {
      const A = window.__attune; A.pause(true);
      for (const el of document.body.children) if (el.tagName !== 'CANVAS' && !el.contains(A.gfx.renderer.domElement)) el.style.visibility = 'hidden';
      const { scene, renderer, camera } = A.gfx;
      const V = camera.position.constructor;
      const pos = A.state().pos;
      let best = null, bd = 1e9;
      scene.traverse((o) => { if (o.isBone && o.name === 'eye_l') { const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - pos.x, w.z - pos.z); if (d < bd) { bd = d; best = o; } } });
      if (!best) return;
      const er = best.parent.getObjectByName('eye_r') || best;
      const l = best.getWorldPosition(new V()), r = er.getWorldPosition(new V());
      const eye = l.clone().add(r).multiplyScalar(0.5);
      const side = l.sub(r); const fwd = new V(-side.z, 0, side.x).normalize();
      const c = Math.cos(ang), s2 = Math.sin(ang);
      const dir = new V(fwd.x * c - fwd.z * s2, 0, fwd.x * s2 + fwd.z * c);
      const tgt = eye.clone(); if (dist > 2) tgt.y -= 0.75;
      camera.position.copy(tgt).addScaledVector(dir, dist); camera.position.y += dist > 2 ? 0.35 : 0;
      camera.lookAt(tgt);
      const oldFov = camera.fov; camera.fov = dist > 2 ? 45 : 28; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      camera.fov = oldFov; camera.updateProjectionMatrix();
    }, { ang, dist });
    await page.screenshot({ path: path.join(OUT, `${label}-${view}.png`) });
    await page.evaluate(() => window.__attune.pause(false));
  }
  const ap = await page.evaluate(() => window.__attune.state().sheet?.appearance);
  console.log(label, '->', ap);
  await ctx.close();
}
await browser.close();
await srv.close?.();
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
process.exit(0);
