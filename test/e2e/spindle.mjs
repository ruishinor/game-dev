import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser, SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';

const out = path.resolve('docs/evidence/spindle/gameplay');
await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:null});
let browser, owner, observer;
const errors=[];
try {
  browser=await launchBrowser();
  async function join(name,width,height,slot,quality=1) {
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error') errors.push(msg.text());});
    await page.goto('http://127.0.0.1:'+server.port+'/?q='+quality+'&qlock=1&nolock=1&slot='+slot+(SOFTWARE_GL?'&rfps=1':''));
    await page.click('#gate-guest-link');await page.fill('#name',name);
    await page.click('.classcard[data-cls="vanguard"]');
    await page.click('#enter');
    await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>0;},null,{polling:100});
    return page;
  }
  async function openSheet(page) {
    await page.getByRole('button',{name:'Menu (Esc)',exact:true}).click();
    await page.getByRole('button',{name:'Companion Sheet',exact:true}).click();
    return page.getByRole('dialog',{name:'Companion Sheet'});
  }
  owner=await join('Gauge Tester',1280,800,'spindle-owner');
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
  // The lamp must be an explicit server command, not a free ambient effect.
  assert.equal(p.companion.lightOn, false);
  await owner.getByRole('button',{name:'Field light',exact:true}).click();
  await owner.waitForFunction(id => window.__attune.state().ents.some(e => e.id === id && e.row.li === 1), id);
  await owner.waitForFunction(() => window.__attune.gfx.scene.children.some(o => o.isPointLight && o.distance === 10 && o.intensity > 0));
  assert.equal(p.companion.lightOn, true);
  await owner.screenshot({path:path.join(out,'field-light-on.png')});
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
  assert.deepEqual(await owner.evaluate(()=>window.__attune.gfx.scene.getObjectByName('spindle:precision-machine').scale.toArray()),[.75,.75,.75]);
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

  // Match the integrated browser suite: software WebGL clients must not
  // compete for expensive draws during initial asset loading. Simulation,
  // networking and articulation continue while rendering is paused.
  if(SOFTWARE_GL) await owner.evaluate(()=>window.__attune.pause(true));
  observer=await join('Gauge Witness',800,600,'spindle-observer',SOFTWARE_GL?0:1);
  await observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.c==='spindle'&&e.model==='glb'),id,{polling:100});
  assert.equal(await observer.evaluate(()=>window.__attune.state().compId),0);
  if(SOFTWARE_GL) await observer.evaluate(()=>window.__attune.pause(true));
  // The observer receives the exact same server-authorized lamp state.
  await observer.waitForFunction(id => window.__attune.state().ents.some(e => e.id === id && e.row.li === 1), id);
  console.log('Second browser resolved the authoritative companion and field light.');
  // Both clients have rendered the same authoritative companion. Move the
  // owner with ordinary input and sample the real wheel on the other client.
  const phase=await observer.evaluate(()=>window.__attune.gfx.scene.getObjectByName('Roll').rotation.x);
  await owner.bringToFront();
  if(SOFTWARE_GL) await owner.evaluate(()=>window.__attune.pause(false));
  await owner.locator('#view').focus();
  await owner.keyboard.press('Shift+2');
  await observer.waitForFunction(id => window.__attune.state().ents.some(e => e.id === id && e.row.li === 0), id);
  await owner.waitForFunction(() => window.__attune.gfx.scene.children.filter(o => o.isPointLight && o.distance === 10).every(o => o.intensity === 0));
  assert.equal(p.companion.lightOn, false);
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
  assert.equal(await liveFixturePlayer(owner,server,'Gauge Tester'),p,'Owner session changed during playtest');
  assert.equal(p.companion?.id,id,'Companion changed during playtest');
  assert.ok(!p.dead && server.game.time>=p.combatUntil,'Inspection requires a living owner outside combat');
  // The inspection animation is a short-lived authoritative state. Start the
  // observer before sending input, and do not let software WebGL draws stall
  // either client's snapshot/DOM processing during this timing-sensitive step.
  if(SOFTWARE_GL) await owner.evaluate(()=>window.__attune.pause(true));
  await owner.locator('#view').focus();
  try {
    await Promise.all([
      observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.row.a==='inspecting'),id,{polling:100,timeout:20000}),
      owner.keyboard.press('Shift+1'),
      owner.getByText(/Spindle inspection:.*63% condition/).first().waitFor({state:'attached',timeout:20000}),
    ]);
  } catch(error) {
    console.error('Inspection diagnostic:',JSON.stringify({owner:{x:p.x,z:p.z,jy:p.jy,dead:p.dead,combatUntil:p.combatUntil},companion:p.companion&&{id:p.companion.id,x:p.companion.x,z:p.companion.z,mode:p.companion.mode,act:p.companion.act,serviceEnd:p.companion.serviceEnd},time:server.game.time,outbox:p.outbox?.slice(-8)}));
    throw error;
  } finally {if(SOFTWARE_GL) await owner.evaluate(()=>window.__attune.pause(false));}
  assert.equal(p.char.condition.field_emitter,63);
  assert.equal(await observer.getByText(/Spindle inspection:/).count(),0);
  await owner.screenshot({path:path.join(out,'inspection-result.png')});
  await owner.locator('.pet-select').click({button:'right'});
  await owner.locator('.player-context').getByRole('button',{name:'Dismiss companion',exact:true}).click();
  await observer.waitForFunction(id=>!window.__attune.state().ents.some(e=>e.id===id),id);
  assert.equal(p.companion,null);
  assert.deepEqual(errors,[]);
  console.log('PASS Spindle commission, keyboard operation, summoning, portrait, stay/follow, signed travel on observer, inspection, owner-only report and remote dismissal');
} catch(error) {
  if(owner) await owner.screenshot({path:path.join(out,'diagnostic.png'),timeout:10000}).catch(()=>{});
  if(observer) await observer.screenshot({path:path.join(out,'observer-diagnostic.png'),timeout:10000}).catch(()=>{});
  console.error('Browser errors:',errors);
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
