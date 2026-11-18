import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser, SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';

const out = path.resolve('docs/evidence/spindle/gameplay');
await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:null});
let browser, owner;
const errors=[];
try {
  browser=await launchBrowser();
  async function join(name,width,height) {
    const page=await browser.newPage({viewport:{width,height}});
    page.setDefaultTimeout(60000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error') errors.push(msg.text());});
    await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=2':''));
    await page.fill('#name',name);
    await page.click('.classcard[data-cls="vanguard"]');
    await page.click('#enter');
    await page.waitForFunction(()=>window.__attune?.state().sheet?.cls==='vanguard');
    return page;
  }
  async function openSheet(page) {
    await page.getByRole('button',{name:'Menu [M]',exact:true}).click();
    await page.getByRole('button',{name:'Companion Sheet',exact:true}).click();
    return page.getByRole('dialog',{name:'Companion Sheet'});
  }
  owner=await join('Gauge Tester',1280,800);
  const p=await liveFixturePlayer(owner,server,'Gauge Tester');
  const sheet=await openSheet(owner);
  const commission=sheet.getByRole('button',{name:'Commission Spindle'});
  await commission.focus();
  await owner.keyboard.press('Enter');
  await sheet.locator('[data-companion-action="summon-spindle"]').click();
  await owner.waitForFunction(()=>{const s=window.__attune.state();return s.ents.some(e=>e.id===s.compId&&e.c==='spindle'&&e.model==='glb');});
  assert.equal(p.companion.owner,p.id);
  const id=p.companion.id;
  const entry=sheet.locator('.companion-sheet-entry').filter({has:owner.getByRole('heading',{name:'Spindle',exact:true})});
  await entry.locator('img').waitFor();
  assert.ok(await entry.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0));
  await owner.screenshot({path:path.join(out,'companion-sheet.png')});
  console.log('Owner commissioned and summoned the GLB. Portrait rendered.');
  await sheet.getByRole('button',{name:'Close Companion Sheet'}).click();
  // Drive the real camera and verify actual visible geometry, not just a flag.
  const visibleTriangles = () => {
    const rig = window.__attune.gfx.scene.getObjectByName('spindle:precision-machine');
    if (!rig) return 0;
    let tris = 0;
    rig.traverseVisible(node => { if (node.isMesh) tris += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; });
    return tris;
  };
  const manifest = await owner.evaluate(async ()=>(await (await fetch('/client/assets/manifest.json')).json()).assets.spindle);
  await owner.waitForFunction(() => {
    const rig = window.__attune.gfx.scene.getObjectByName('spindle:precision-machine');
    return rig?.getObjectByName('FarRollAssembly') && rig.children.some(scene=>scene.visible && scene.getObjectByName('Roll'));
  });
  assert.equal(await owner.evaluate(visibleTriangles),manifest.tris);
  await owner.evaluate(()=>window.__attune.view({yaw:0,pitch:1.25,dist:24}));
  await owner.waitForFunction(()=>{
    const rig=window.__attune.gfx.scene.getObjectByName('spindle:precision-machine');
    return rig?.children.some(scene=>scene.visible && scene.getObjectByName('FarRoll'));
  });
  assert.equal(await owner.evaluate(visibleTriangles),manifest.lodTris);
  await owner.screenshot({path:path.join(out,'distance-lod.png')});
  await owner.evaluate(()=>window.__attune.view({yaw:Math.PI,pitch:.32,dist:10}));
  await owner.waitForFunction(()=>{
    const rig=window.__attune.gfx.scene.getObjectByName('spindle:precision-machine');
    return rig?.children.some(scene=>scene.visible && scene.getObjectByName('Roll'));
  });
  assert.equal(await owner.evaluate(visibleTriangles),manifest.tris);
  console.log('PASS camera-selected Spindle near/distance geometry and near detail restoration');
  await owner.getByRole('button',{name:'Stay',exact:true}).click();
  await owner.waitForFunction(()=>window.__attune.state().ents.some(e=>e.c==='spindle'&&e.row.md==='stay'));
  await owner.locator('#view').focus();
  await owner.keyboard.press('Shift+4');
  await owner.waitForFunction(()=>window.__attune.state().ents.some(e=>e.c==='spindle'&&e.row.md==='follow'));

  const observer=await join('Gauge Witness',800,600);
  await observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.c==='spindle'&&e.model==='glb'),id);
  assert.equal(await observer.evaluate(()=>window.__attune.state().compId),0);
  await observer.evaluate(()=>window.__attune.pause(true));
  console.log('Second browser resolved the authoritative companion.');
  // Both clients have rendered the same authoritative companion. Move the
  // owner with ordinary input and sample the real wheel on the other client.
  const phase=await observer.evaluate(()=>window.__attune.gfx.scene.getObjectByName('Roll').rotation.x);
  await owner.bringToFront();
  await owner.locator('#view').focus();
  const before={x:p.companion.x,z:p.companion.z};
  await owner.keyboard.down('KeyW');
  try {
    await owner.waitForFunction(([x,z])=>{const s=window.__attune.state(),e=s.ents.find(e=>e.id===s.compId);return e&&Math.hypot(e.x-x,e.z-z)>1;},[before.x,before.z]);
  } finally {await owner.keyboard.up('KeyW');}
  await observer.waitForFunction(phase=>Math.abs(window.__attune.gfx.scene.getObjectByName('Roll').rotation.x-phase)>.01,phase);
  const yaw=p.yaw-1.25;
  await owner.evaluate(yaw=>window.__attune.view({yaw,pitch:.31,dist:7.8}),yaw);
  await owner.waitForTimeout(1200);
  await owner.screenshot({path:path.join(out,'alongside-player.png')});
  await owner.evaluate(yaw=>window.__attune.view({yaw,pitch:.34,dist:10}),yaw);
  await owner.waitForTimeout(1000);
  await owner.screenshot({path:path.join(out,'normal-distance.png')});
  // Supply a worn, owned weapon on the authoritative test character. The
  // inspection request and its result still cross real gameplay sockets.
  if (!p.char.inventory.includes('field_emitter')) p.char.inventory.push('field_emitter');
  p.char.equipped.weapon='field_emitter';
  p.char.condition={...p.char.condition,field_emitter:63};
  server.game.refreshStats(p);
  server.game.markDirty(p);
  await owner.locator('#view').focus();
  await owner.keyboard.press('Shift+1');
  await observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.row.a==='inspecting'),id);
  await owner.getByText(/Spindle inspection:.*63% condition/).first().waitFor({state:'attached'});
  assert.equal(p.char.condition.field_emitter,63);
  assert.equal(await observer.getByText(/Spindle inspection:/).count(),0);
  await owner.screenshot({path:path.join(out,'inspection-result.png')});
  await owner.locator('.pet-select').click({button:'right'});
  await owner.getByRole('button',{name:'Dismiss companion',exact:true}).click();
  await observer.waitForFunction(id=>!window.__attune.state().ents.some(e=>e.id===id),id);
  assert.equal(p.companion,null);
  assert.deepEqual(errors,[]);
  console.log('PASS Spindle commission, keyboard operation, summoning, portrait, stay/follow, signed travel on observer, inspection, owner-only report and remote dismissal');
} catch(error) {
  if(owner) await owner.screenshot({path:path.join(out,'diagnostic.png'),timeout:10000}).catch(()=>{});
  console.error('Browser errors:',errors);
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
