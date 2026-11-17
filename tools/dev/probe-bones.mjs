// Print inverse-bind joint positions of a live humanoid (diagnostic; note these
// are in the mesh's skinning space, not gear space). node tools/dev/probe-bones.mjs
import { startServer } from '../../server/index.js';
import { launchBrowser } from '../browser.mjs';
const srv = await startServer({ port: 0, dataFile: null });
const b = await launchBrowser(); const page = await b.newPage();
await page.goto(`http://127.0.0.1:${srv.port}/preview.html`).catch(()=>{});
await page.goto(`http://127.0.0.1:${srv.port}/?q=1&qlock=1&nolock=1`);
await page.fill('#name','Bones'); await page.click('.classcard[data-cls="symbiotech"]'); await page.click('#enter');
await page.waitForFunction(() => window.__attune?.state().myId && window.__attune.state().drawn > 2, null, {timeout:120000});
const out = await page.evaluate(() => {
  const { scene } = window.__attune.gfx; const res = {};
  scene.traverse(o => { if (o.isSkinnedMesh && !res[o.skeleton.uuid]) {
    const names=['pelvis','spine_01','spine_03','neck_01','Head','clavicle_l','upperarm_l','lowerarm_l','hand_l','thigh_l','calf_l','foot_l'];
    const m = {}; const sk=o.skeleton; let root=o; while(root.parent && root.parent.type!=='Scene' && !root.parent.isGroup) root=root.parent;
    sk.bones.forEach((bn,i)=>{ if(names.includes(bn.name)){ const inv=sk.boneInverses[i].clone().invert(); m[bn.name]=[inv.elements[12],inv.elements[13],inv.elements[14]].map(v=>+v.toFixed(3)); }});
    res[o.skeleton.uuid]={mesh:o.name, n:sk.bones.length, m};
  }}); return res; });
console.log(JSON.stringify(out,null,0)); await b.close(); srv.close?.(); process.exit(0);
