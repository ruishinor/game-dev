// Measure each humanoid frame's skull from rest-pose skinned Head vertices,
// in the space gear is attached in (diagnostic; the game measures at runtime in
// characters.js measureSkull). Run from the repo root: node tools/dev/measure-skull.mjs
import { startServer } from '../../server/index.js';
import { launchBrowser } from '../browser.mjs';
const srv = await startServer({ port: 0, dataFile: null });
const b = await launchBrowser();
for (const cls of ['vanguard', 'keeper']) {
  const page = await b.newPage({ viewport: { width: 640, height: 400 } });
  page.setDefaultTimeout(120000);
  await page.goto(`http://127.0.0.1:${srv.port}/?q=1&qlock=1&nolock=1`);
  await page.fill('#name', 'Skull' + cls.slice(0, 3)); await page.click(`.classcard[data-cls="${cls}"]`); await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.ents.some((e) => e.id === s.myId && e.model === 'glb'); });
  const out = await page.evaluate(() => {
    const { scene } = window.__attune.gfx;
    let body = null;
    scene.traverse((o) => { if (!body && o.isSkinnedMesh && !o.name.startsWith('shell_') && o.material?.name === 'body' && o.skeleton.bones.some((b) => b.name === 'Head')) body = o; });
    // inst = the GLB instance root that gear is added to: the ancestor whose subtree holds the Head bone.
    let inst = body;
    while (inst.parent && inst.name !== 'Scene') inst = inst.parent;
    const chain = []; for (let o = body; o; o = o.parent) chain.push(`${o.type}:${o.name}:${o.scale.x.toFixed(2)}`);
    inst.updateMatrixWorld(true);
    const inv = inst.matrixWorld.clone().invert();
    const M = inv.multiply(body.matrixWorld);
    const hi = body.skeleton.bones.findIndex((b) => b.name === 'Head');
    const P = body.geometry.getAttribute('position'), I = body.geometry.getAttribute('skinIndex'), W = body.geometry.getAttribute('skinWeight');
    const v = new (P.array.constructor === Float32Array ? Object : Object)();
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; let n = 0; let face = -1e9;
    const p = body.position.clone();
    for (let i = 0; i < P.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (I.getComponent(i, k) === hi) w += W.getComponent(i, k);
      if (w < 0.9) continue;
      p.fromBufferAttribute(P, i).applyMatrix4(M); n++;
      ['x', 'y', 'z'].forEach((a, j) => { mn[j] = Math.min(mn[j], p[a]); mx[j] = Math.max(mx[j], p[a]); });
    }
    return { inst: `${inst.type}:${inst.name}:${inst.scale.x.toFixed(2)}`, chain, n, mn: mn.map((x) => +x.toFixed(3)), mx: mx.map((x) => +x.toFixed(3)), c: mn.map((x, j) => +((x + mx[j]) / 2).toFixed(3)), r: mn.map((x, j) => +((mx[j] - x) / 2).toFixed(3)) };
  });
  console.log(cls, JSON.stringify(out));
  await page.close();
}
await b.close(); srv.close?.(); process.exit(0);
