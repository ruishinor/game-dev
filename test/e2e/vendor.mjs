// Live server and browser. The fixture supplies earned salvage only; all
// sales, purchases, buyback and dismissal are player interactions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 fs.mkdirSync('vendor-evidence',{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':'');
 await page.goto(url);await page.fill('#name','Vendor Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2&&s.ents.some(e=>e.c==='quartermaster'&&e.model==='glb'&&e.halo?.role==='vendor');});
 const p=await liveFixturePlayer(page,server,'Vendor Tester');
 const vendor=server.game.objects.find(o=>o.type==='quartermaster');
 assert.ok(p&&vendor);
 p.char.goods={spent_contact:4,mire_husk:3};p.char.credits=0;
 p.x=vendor.x;p.z=vendor.z+2;server.game.markDirty(p);
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.25&&s.sheet.goods.spent_contact===4;},[p.x,p.z]);
 await page.evaluate(()=>window.__attune.view({yaw:Math.PI,pitch:.18,dist:7,face:Math.PI}));
 const drawn=await page.evaluate(()=>window.__attune.state().drawn);
 await page.waitForFunction(n=>window.__attune.state().drawn>n,drawn);
 await page.screenshot({path:'vendor-evidence/01-quartermaster-world.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 const panel=page.getByRole('dialog',{name:'Vendor',exact:true});
 await panel.waitFor({state:'visible'});
 assert.match(await panel.locator('.vendor-balance').innerText(),/^0 credits$/);
 assert.ok(await panel.getByRole('button',{name:'Buy 1',exact:true}).first().isDisabled());
 await panel.getByRole('button',{name:'Sell junk',exact:true}).click();
 await panel.getByRole('button',{name:'Sell all junk',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.credits===18);
 assert.deepEqual(p.char.goods,{});
 await panel.getByRole('button',{name:'Buy',exact:true}).click();
 const fibre=panel.locator('.vendor-row').filter({hasText:'Mire fibre'});
 await fibre.getByRole('button',{name:'Buy 1',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.credits===10&&window.__attune.state().sheet.materials.mire_fibre===1);
 await page.screenshot({path:'vendor-evidence/02-purchase.png'});
 await panel.getByRole('button',{name:'Buyback',exact:true}).click();
 const husk=panel.locator('.vendor-row').filter({hasText:'Torn mire husk'});
 await husk.getByRole('button',{name:'Buy back',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.credits===4&&window.__attune.state().sheet.goods.mire_husk===3);
 assert.equal(p.char.credits,4);assert.deepEqual(p.char.goods,{mire_husk:3});
 await page.screenshot({path:'vendor-evidence/03-buyback.png'});
 // Fixture supplies currency and damaged condition; buying/repairing still
 // use the authenticated browser. Defeat wear is covered by simulation tests.
 p.char.credits=50;server.game.markDirty(p);
 await page.waitForFunction(()=>window.__attune.state().sheet.credits===50);
 await panel.getByRole('button',{name:'Buy',exact:true}).click();
 await panel.locator('.vendor-row').filter({hasText:'Field Pulse Emitter'}).getByRole('button',{name:'Buy 1',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.inventory.includes('field_emitter')&&window.__attune.state().sheet.credits===38);
 p.char.condition={field_emitter:60};server.game.markDirty(p);
 await page.waitForFunction(()=>window.__attune.state().sheet.condition.field_emitter===60);
 await panel.getByRole('button',{name:'Repair',exact:true}).click();
 await panel.locator('.vendor-row').filter({hasText:'Field Pulse Emitter'}).getByRole('button',{name:'Repair',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.credits===30&&!Object.hasOwn(window.__attune.state().sheet.condition,'field_emitter'));
 assert.equal(p.char.credits,30);assert.deepEqual(p.char.condition,{});
 await page.screenshot({path:'vendor-evidence/04-repair.png'});
 await panel.getByRole('button',{name:'Buy',exact:true}).click();
 await panel.locator('.vendor-row').filter({hasText:'Field Maintenance Kit'}).getByRole('button',{name:'Buy 1',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.goods.field_maintenance_kit===1&&window.__attune.state().sheet.credits===18);
 await panel.getByRole('button',{name:'Close vendor'}).click();
 await page.waitForFunction(()=>!window.__attune.state().you.vendor);
 await page.locator('#view').focus();await page.keyboard.press('KeyI');
 const inventory=page.getByRole('dialog',{name:'Inventory',exact:true});
 await inventory.locator('.item-cell[aria-label="Field Pulse Emitter"]').click({button:'right'});
 await page.locator('.player-context button').filter({hasText:/^Equip$/}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.equipped.weapon==='field_emitter');
 p.char.condition={field_emitter:60};p.char.materials.sentinel_alloy=1;server.game.markDirty(p);
 await page.waitForFunction(()=>window.__attune.state().sheet.condition.field_emitter===60);
 await inventory.getByRole('button',{name:'Utility',exact:true}).click();
 await inventory.getByRole('button',{name:'Use Field Maintenance Kit',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet.condition.field_emitter===85&&!window.__attune.state().sheet.goods.field_maintenance_kit);
 assert.equal(p.char.condition.field_emitter,85);
 await inventory.getByRole('button',{name:'Close inventory'}).click();
 const station=server.game.objects.find(o=>o.type==='sanctum_fabricator');p.x=station.x;p.z=station.z+2;
 await page.waitForFunction(()=>window.__attune.state().you.workshop==='sanctum');
 await page.locator('#view').focus();await page.keyboard.press('KeyB');
 const workshop=page.getByRole('dialog',{name:'Build Planner and Workshop'});
 await workshop.getByRole('button',{name:'Workshop',exact:true}).click();
 await workshop.locator('[data-recipe="field_maintenance_kit"]').click();
 // A normal Engineering cycle lasts 1100ms. Arm observation before the
 // authenticated click; separate round trips can miss both transient states.
 // On software GL, use the existing capture hook to skip expensive draws
 // during observation only. Networking, animation frames and simulation run
 // normally, and the real scene objects must both enter their working states.
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.ents.some(e=>e.id===s.myId&&e.model==='glb'&&e.speed===0);});
 await page.evaluate(software=>{
  const a=window.__attune,scene=a.gfx.scene;
  const observation={running:true,machine:false,tool:false,frames:0};
  window.__vendorProductionObservation=observation;
  if(software)a.pause(true);
  function sample(){
   if(!observation.running)return;
   observation.frames++;
   observation.machine||=scene.getObjectByName('sanctum-precision-fabricator')?.userData.working===true;
   observation.tool||=scene.getObjectByName('production:right')?.visible===true;
   requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
 },SOFTWARE_GL);
 // This checks live animation, not production latency (covered by simulation tests).
 // Give the accepted, real job a bounded observation window even on slow renderers.
 // No change to inputs, outputs, authority, or the production engine.
 const originalTick=server.game.tick;
 let observedJob=false;
 server.game.tick=function(dt){
  const job=p.production;
  if(!observedJob&&job?.id==='field_maintenance_kit'){
   observedJob=true;
   job.duration+=8000;job.until+=8000;
  }
  return originalTick.call(this,dt);
 };
 try{
  await workshop.locator('[data-craft="field_maintenance_kit"]').click();
  await page.waitForFunction(()=>{const o=window.__vendorProductionObservation;return o.machine&&o.tool;});
  assert.ok(observedJob,'actual authoritative production job observed');
 }catch(error){
  const details=await page.evaluate(()=>{const a=window.__attune,s=a.state(),me=s.ents.find(e=>e.id===s.myId);return {observation:window.__vendorProductionObservation,production:s.you?.production,work:me?.row?.work,model:me?.model,speed:me?.speed,goods:s.sheet?.goods?.field_maintenance_kit};}).catch(()=>null);
  console.error('[vendor] production observation failed',JSON.stringify(details),{acceptedJob:!!p.production,output:p.char.goods.field_maintenance_kit??0});
  throw error;
 }finally{
  server.game.tick=originalTick;
  await page.evaluate(()=>{window.__vendorProductionObservation.running=false;window.__attune.pause(false);});
 }
 await page.waitForFunction(()=>window.__attune.state().sheet.goods.field_maintenance_kit===2);
 await page.waitForFunction(()=>{const a=window.__attune,scene=a.gfx.scene;return scene.getObjectByName('sanctum-precision-fabricator')?.userData.working===false&&!scene.getObjectByName('production:right')?.visible;});
 assert.equal(p.char.materials.mire_fibre,undefined);assert.equal(p.char.materials.sentinel_alloy,undefined);
 await workshop.waitFor({state:'hidden'});
 await page.locator('.production-status').waitFor({state:'hidden'});
 await page.locator('#view').focus();await page.keyboard.press('KeyI');
 await inventory.getByRole('button',{name:'Utility',exact:true}).click();
 await inventory.getByRole('button',{name:'Use Field Maintenance Kit',exact:true}).click();
 await page.waitForFunction(()=>!Object.hasOwn(window.__attune.state().sheet.condition,'field_emitter')&&window.__attune.state().sheet.goods.field_maintenance_kit===1);
 assert.ok(await inventory.getByRole('button',{name:'Use Field Maintenance Kit',exact:true}).isDisabled());
 await page.screenshot({path:'vendor-evidence/05-field-maintenance.png'});
 await inventory.getByRole('button',{name:'Close inventory'}).click();
 p.x=vendor.x;p.z=vendor.z+2;await page.waitForFunction(([x,z])=>Math.hypot(window.__attune.state().you.x-x,window.__attune.state().you.z-z)<.25,[p.x,p.z]);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await panel.waitFor({state:'visible'});
 p.x=vendor.x-8;p.z=vendor.z;
 await panel.waitFor({state:'hidden'});
 assert.equal(p.vendor,null);
 // Fixture provides earned funds; the real authenticated vendor and
 // inventory actions purchase and equip the original joined rod.
 p.char.credits=40;p.x=vendor.x;p.z=vendor.z+2;server.game.markDirty(p);
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.25&&s.sheet.credits===40;},[p.x,p.z]);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await panel.waitFor({state:'visible'});
 const rodRow=panel.locator('.vendor-row').filter({hasText:'Electrical Combat Rod'});
 assert.match(await rodRow.innerText(),/24 credits/);
 await rodRow.getByRole('button',{name:'Buy 1',exact:true}).click();
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.sheet.credits===16&&s.sheet.inventory.includes('electrical_combat_rod');});
 assert.equal(p.char.credits,16);
 assert.ok(await rodRow.getByRole('button',{name:'Buy 1',exact:true}).isDisabled());
 await panel.getByRole('button',{name:'Close vendor'}).click();
 await page.waitForFunction(()=>!window.__attune.state().you.vendor);
 await page.locator('#view').focus();await page.keyboard.press('KeyI');
 await inventory.getByRole('button',{name:'Weapons',exact:true}).click();
 await inventory.locator('.item-cell[aria-label="Electrical Combat Rod"]').click({button:'right'});
 await page.locator('.player-context').getByRole('button',{name:'Swap in',exact:true}).click();
 await page.waitForFunction(()=>{const a=window.__attune,s=a.state(),rod=a.gfx.scene.getObjectByName('HeldElectricalCombatRod');return s.sheet.equipped.weapon==='electrical_combat_rod'&&s.ents.find(e=>e.id===s.myId)?.row?.er===1&&rod?.parent?.name==='hand_r'&&rod.visible;});
 assert.equal(p.char.equipped.weapon,'electrical_combat_rod');
 // Check the actual equipped runtime geometry, not just a call to an effect mock.
 await page.waitForFunction(()=>{const rod=window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod');return [0,1].every(i=>{const g=rod?.getObjectByName('RodCorona'+i),s=g?.children[0];return g?.visible&&s?.visible&&s.children[0]?.material.opacity>=.45;});});
 // Installed items leave carried inventory; use the real equipment slot.
 assert.equal(await inventory.locator('.item-cell[aria-label="Electrical Combat Rod"]').count(),0);
 await inventory.getByRole('button',{name:'Close inventory'}).click();
 // On software GL avoid expensive draws during real DOM input. World,
 // networking and animation updates continue; resume before visual evidence.
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 try{
  await page.locator('#view').focus();await page.keyboard.press('KeyC');
  const loadout=page.getByRole('dialog',{name:'Character and loadout',exact:true});
  await loadout.getByRole('button',{name:'Weapons',exact:true}).click();
  const installedRod=loadout.getByRole('button',{name:'Weapon: Electrical Combat Rod',exact:true});
  await installedRod.hover();
  await page.waitForFunction(()=>!window.__attune.state().sheet.unseenItems.includes('electrical_combat_rod'));
  // Exercise the documented keyboard context-menu path on the equipped slot.
  // Pointer context menus are still exercised by both real inventory swaps.
  await installedRod.press('Shift+F10');
  const context=page.locator('.player-context');
  await context.waitFor({state:'visible'});
  assert.equal(await context.locator('.context-title').innerText(),'Electrical Combat Rod');
  assert.equal(await liveFixturePlayer(page,server,'Vendor Tester'),p,'Configuration must use the original authenticated player');
  async function configure(label,mode,code){
   const action=context.getByRole('button',{name:label,exact:true});
   await action.focus();
   await action.press('Enter');
   try{
    await page.waitForFunction(({mode,code})=>{const s=window.__attune.state();return s.sheet?.electricalRodMode===mode&&s.ents.find(e=>e.id===s.myId)?.row?.er===code;},{mode,code});
   }catch(error){
    const client=await page.evaluate(()=>{const s=window.__attune.state();return {id:s.myId,snaps:s.snaps,mode:s.sheet?.electricalRodMode,row:s.ents.find(e=>e.id===s.myId)?.row?.er,status:document.querySelector('#status')?.textContent,context:!document.querySelector('.player-context')?.hidden};}).catch(()=>null);
    console.error('[rod configuration]',{mode,client,server:{mode:p.char.electricalRodMode,live:server.game.players.get(p.id)===p,dead:p.dead,combat:p.combatUntil-server.game.time,auto:p.autoOn,jump:p.jy},errors});
    throw error;
   }
  }
  await configure('Separate into dual batons','dual',2);
  assert.equal(p.char.electricalRodMode,'dual');
  await installedRod.press('Shift+F10');
  await context.waitFor({state:'visible'});
  assert.equal(await context.locator('.context-title').innerText(),'Electrical Combat Rod');
  await configure('Join into combat rod','rod',1);
  assert.equal(p.char.electricalRodMode,'rod');
  await loadout.getByRole('button',{name:'Close',exact:true}).click();
 }finally{
  if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));
 }
 const rodDraw=await page.evaluate(()=>window.__attune.state().drawn);
 await page.waitForFunction(n=>window.__attune.state().drawn>n,rodDraw);
 await page.screenshot({path:'vendor-evidence/06-electrical-combat-rod.png'});
 // Explicitly capture persistent corona at the normal camera after the joined mode is restored.
 await page.evaluate(()=>window.__attune.view({yaw:2.2,pitch:.21,dist:4.5}));
 const coronaDraw=await page.evaluate(()=>window.__attune.state().drawn);
 await page.waitForFunction(n=>window.__attune.state().drawn>n,coronaDraw);
 await page.screenshot({path:'vendor-evidence/07-electrical-rod-corona-close.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyI');
 await inventory.getByRole('button',{name:'Weapons',exact:true}).click();
 await inventory.locator('.item-cell[aria-label="Field Pulse Emitter"]').click({button:'right'});
 await page.locator('.player-context').getByRole('button',{name:'Swap in',exact:true}).click();
 await page.waitForFunction(()=>{const a=window.__attune,s=a.state();return s.sheet.equipped.weapon==='field_emitter'&&!s.ents.find(e=>e.id===s.myId)?.row?.er&&!a.gfx.scene.getObjectByName('HeldElectricalCombatRod');});
 assert.deepEqual(errors,[]);
 console.log('PASS live quartermaster, private balance, sale, purchase, buyback and range dismissal');
}finally{await browser?.close();await server.close();}
