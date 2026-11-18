// Matched in-game character close-ups (face front / three-quarter / side, and a
// gameplay-distance shot) for every class look, rendered by the real client.
// Drawing is paused and the game's own scene/camera are rendered from fixed
// offsets relative to the character's head, so before/after framing matches.
//
//   node tools/dev/face-capture.mjs <outDir> [extraQuery]
//
// Software WebGL unless ATTUNEMENT_GPU=1: images only, no performance claims.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../../server/index.js';
import { LOOKS } from '../../shared/content.js';
import { launchBrowser, activeBrowserPlayer } from '../browser.mjs';

const OUT = path.resolve(process.argv[2] || 'face-capture');
const extra = (process.argv[3] || '') + '&facelod=0';
fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const errors = [];
const looks = Object.entries(LOOKS).flatMap(([cls, ls]) => ls.map((l) => ({ cls, look: l.id })));
const only = process.env.FACE_ONLY || '';
let slot = 1;
for (const { cls, look } of looks) {
  if (only && !look.includes(only)) { slot++; continue; }
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push(`${look}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${look}: ${m.text()}`));
  const name = 'Face' + 'abcdefghij'[slot];
  await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1&slot=${slot++}${extra}`);
  if (process.env.HIDE) await page.evaluate((h) => (window.__hide = h.split(',')), process.env.HIDE);
  await page.fill('#name', name);
  await page.click(`.classcard[data-cls="${cls}"]`);
  const lc = await page.$(`.lookcard[data-look="${look}"]`);
  if (lc && (await lc.isVisible())) await lc.click();
  await page.click('#enter'); console.log('entered', look);
  await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos);
  const p = await activeBrowserPlayer(page, srv, name);
  p.x = 2; p.z = 6; p.yaw = 0;
  await page.waitForTimeout(2500);
  const shots = [['front', 0, 0.55], ['three-quarter', 0.65, 0.55], ['side', 1.5707, 0.55], ['gameplay', 0.4, 4.0]];
  await page.evaluate(() => { const A = window.__attune; A.pause(false); });
  for (const [label, ang, dist] of shots) {
    await page.evaluate(({ ang, dist, focus }) => {
      const A = window.__attune; A.pause(true);
      for (const el of document.body.children) if (el.tagName !== 'CANVAS' && !el.contains(A.gfx.renderer.domElement)) el.style.visibility = 'hidden';
      const { scene, renderer, camera } = A.gfx;
      const V = camera.position.constructor;
      if (window.__hide) scene.traverse((o) => { if (o.isMesh && window.__hide.includes(o.material?.name)) o.visible = false; });
      // The local player's model: the holder nearest the reported position.
      const pos = focus || A.state().pos;
      let best = null, bd = 1e9;
      scene.traverse((o) => { if (o.isBone && o.name === 'eye_l') { const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - pos.x, w.z - pos.z); if (d < bd) { bd = d; best = o; } } });

      // Bodies without eye joints (the mannequin baseline): the Head bone, and the
      // model's facing from its top-level holder.
      const headFallback = (fx, fz) => {
        let hb = null, hd = 1e9;
        scene.traverse((o) => { if (o.isBone && o.name === 'Head') { const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - fx, w.z - fz); if (d < hd) { hd = d; hb = o; } } });
        if (!hb) return null;
        let top = hb; while (top.parent && top.parent !== scene) top = top.parent;
        const f = new V(Math.sin(top.rotation.y), 0, Math.cos(top.rotation.y));
        return { eye: hb.getWorldPosition(new V()).add(new V(0, 0.13, 0)).addScaledVector(f, 0.06), fwd: f };
      };
      let eye = new V(pos.x, pos.y + 1.7, pos.z), fwd = new V(0, 0, 1);
      if (!best) { const fb = headFallback(pos.x, pos.z); if (fb) { eye = fb.eye; fwd = fb.fwd; } }
      if (best) {
        const er = best.parent.getObjectByName('eye_r') || best;
        eye = best.getWorldPosition(new V()).add(er.getWorldPosition(new V())).multiplyScalar(0.5);
        const l = best.getWorldPosition(new V()), r = er.getWorldPosition(new V());
        const side = l.sub(r); fwd.set(-side.z, 0, side.x).normalize();
      }
      const c = Math.cos(ang), s2 = Math.sin(ang);
      const dir = new V(fwd.x * c - fwd.z * s2, 0, fwd.x * s2 + fwd.z * c);
      const tgt = eye.clone(); if (dist > 2) tgt.y -= 0.75;
      camera.position.copy(tgt).addScaledVector(dir, dist); camera.position.y += dist > 2 ? 0.55 : 0.0;
      camera.lookAt(tgt);
      const oldFov = camera.fov; camera.fov = dist > 2 ? 45 : 28; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      camera.fov = oldFov; camera.updateProjectionMatrix();
    }, { ang, dist, focus: null });
    await page.screenshot({ path: path.join(OUT, `${look}-${label}.png`) });
    await page.evaluate(() => window.__attune.pause(false));
  }
  await ctx.close();
}
// NPCs: stand the last player beside each and photograph the NPC's face.
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`npc: ${e.message}`));
  await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1&facelod=0&slot=9`);
  await page.fill('#name', 'Facenpc');
  await page.click('.classcard[data-cls="vanguard"]');
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos);
  const p = await activeBrowserPlayer(page, srv, 'Facenpc');
  for (const [key, x, z] of [['archivist', 4.2, -2.6], ['quartermaster', -5.6, -1.8]]) {
    if (only && !`npc-${key}`.includes(only)) continue;
    p.x = x + 2.5; p.z = z + 2.5;
    await page.waitForTimeout(3500);
    for (const [label, ang, dist] of [['front', 0, 0.55], ['three-quarter', 0.65, 0.55], ['gameplay', 0.4, 4.0]]) {
      await page.evaluate(({ ang, dist, focus }) => {
        const A = window.__attune; A.pause(true);
        for (const el of document.body.children) if (el.tagName !== 'CANVAS' && !el.contains(A.gfx.renderer.domElement)) el.style.visibility = 'hidden';
        const { scene, renderer, camera } = A.gfx;
        const V = camera.position.constructor;
        let best = null, bd = 1e9;
        scene.traverse((o) => { if (o.isBone && o.name === 'eye_l') { const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - focus.x, w.z - focus.z); if (d < bd) { bd = d; best = o; } } });

      // Bodies without eye joints (the mannequin baseline): the Head bone, and the
      // model's facing from its top-level holder.
      const headFallback = (fx, fz) => {
        let hb = null, hd = 1e9;
        scene.traverse((o) => { if (o.isBone && o.name === 'Head') { const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - fx, w.z - fz); if (d < hd) { hd = d; hb = o; } } });
        if (!hb) return null;
        let top = hb; while (top.parent && top.parent !== scene) top = top.parent;
        const f = new V(Math.sin(top.rotation.y), 0, Math.cos(top.rotation.y));
        return { eye: hb.getWorldPosition(new V()).add(new V(0, 0.13, 0)).addScaledVector(f, 0.06), fwd: f };
      };
        let eye, fwd;
        if (best) {
          const er = best.parent.getObjectByName('eye_r') || best;
          const l = best.getWorldPosition(new V()), r = er.getWorldPosition(new V());
          eye = l.clone().add(r).multiplyScalar(0.5);
          const side = l.sub(r); fwd = new V(-side.z, 0, side.x).normalize();
        } else {
          const fb = headFallback(focus.x, focus.z);
          if (!fb) return;
          ({ eye, fwd } = fb);
        }
        const c = Math.cos(ang), s2 = Math.sin(ang);
        const dir = new V(fwd.x * c - fwd.z * s2, 0, fwd.x * s2 + fwd.z * c);
        const tgt = eye.clone(); if (dist > 2) tgt.y -= 0.75;
        camera.position.copy(tgt).addScaledVector(dir, dist); camera.position.y += dist > 2 ? 0.55 : 0;
        camera.lookAt(tgt);
        const oldFov = camera.fov; camera.fov = dist > 2 ? 45 : 28; camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        camera.fov = oldFov; camera.updateProjectionMatrix();
      }, { ang, dist, focus: { x, z } });
      await page.screenshot({ path: path.join(OUT, `npc-${key}-${label}.png`) });
      await page.evaluate(() => window.__attune.pause(false));
    }
  }
  await ctx.close();
}
await browser.close();
await srv.close?.();
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
console.log('done', OUT);
process.exit(0);
