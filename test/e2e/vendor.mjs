// Live server and browser. The fixture supplies earned salvage only; all
// sales, purchases, buyback and dismissal are player interactions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import { revealRecipe } from './recipe-catalogue.mjs';
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 fs.mkdirSync('vendor-evidence',{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':'');
 await page.goto(url);await page.click('#gate-guest-link');await page.fill('#name','Vendor Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2&&s.ents.some(e=>e.c==='quartermaster'&&e.model==='glb'&&e.halo?.role==='vendor');});
 let p=await liveFixturePlayer(page,server,'Vendor Tester');
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
 await page.waitForFunction(()=>window.__attune.state().sheet.equipped.ranged==='field_emitter');
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
 await (await revealRecipe(workshop,'field_maintenance_kit')).click();
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
 await inventory.getByRole('button',{name:'Gear',exact:true}).click();
 await inventory.locator('.item-cell[aria-label="Electrical Combat Rod"]').click({button:'right'});
 // The rod has its own main-weapon slot: equipping it keeps the emitter in the
 // Ranged slot, and keeps the emitter (the weapon in use) active with the rod stowed.
 await page.locator('.player-context').getByRole('button',{name:'Equip',exact:true}).click();
 await page.waitForFunction(()=>{const a=window.__attune,s=a.state(),rod=a.gfx.scene.getObjectByName('StowedElectricalCombatRod');return s.sheet.equipped.weapon==='electrical_combat_rod'&&s.sheet.equipped.ranged==='field_emitter'&&s.sheet.activeWeapon==='ranged'&&s.ents.find(e=>e.id===s.myId)?.row?.er===3&&/^spine_0/.test(rod?.parent?.name||'')&&rod.visible;});
 assert.equal(p.char.equipped.weapon,'electrical_combat_rod');assert.equal(p.char.equipped.ranged,'field_emitter');
 // Draw the rod with the default weapon-switch hotkey.
 await inventory.getByRole('button',{name:'Close inventory'}).click();
 await page.locator('#view').focus();await page.keyboard.press('KeyZ');
 await page.waitForFunction(()=>{const a=window.__attune,s=a.state(),rod=a.gfx.scene.getObjectByName('HeldElectricalCombatRod');return s.sheet.activeWeapon==='weapon'&&s.ents.find(e=>e.id===s.myId)?.row?.er===1&&rod?.parent?.name==='hand_r'&&rod.visible;});
 assert.equal(p.char.equipped.ranged,'field_emitter','drawing the rod keeps the emitter equipped');
 await page.keyboard.press('KeyI');await inventory.getByRole('button',{name:'Gear',exact:true}).click();
 // Check the actual equipped runtime geometry, not just a call to an effect mock.
 await page.waitForFunction(()=>{const rod=window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod');return [0,1].every(i=>{const g=rod?.getObjectByName('RodCorona'+i),s=g?.children[0];return g?.visible&&s?.visible&&s.children[0]?.material.opacity>=.45;});});
 // Installed items leave carried inventory; use the real equipment slot.
 assert.equal(await inventory.locator('.item-cell[aria-label="Electrical Combat Rod"]').count(),0);
 await inventory.getByRole('button',{name:'Close inventory'}).click();
 // On software GL avoid expensive draws during real DOM input. World,
 // networking and animation updates continue; resume before visual evidence.
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 try{
  // Reopening a transient menu is necessary after a world reset. Retry only
  // on a confirmed replacement of the authenticated simulation entity;
  // an ordinary failure with the original session remains a test failure.
  const rodCharacterId=p.char.id;
  const loadout=page.getByRole('dialog',{name:'Character and loadout',exact:true});
  const installedRod=loadout.getByRole('button',{name:'Weapon: Electrical Combat Rod',exact:true});
  const context=page.locator('.player-context');
  async function syncRodPlayer(){
   const live=await liveFixturePlayer(page,server,'Vendor Tester');
   assert.equal(live.char.id,rodCharacterId,'Rod configuration preserves authenticated character');
   assert.equal(live.char.equipped.weapon,'electrical_combat_rod','Rod survives reconnect');
   assert.equal(live.char.activeWeapon,'weapon','Rod remains active after reconnect');
   p=live;
   return live;
  }
  async function verifyMode(mode,code){
   await page.waitForFunction(({mode,code})=>{const s=window.__attune.state();return s.sheet?.electricalRodMode===mode&&s.ents.find(e=>e.id===s.myId)?.row?.er===code;},{mode,code},{timeout:30000});
   const live=await syncRodPlayer();
   assert.equal(live.char.electricalRodMode,mode);
  }
  async function configure(label,mode,code){
   let submitted=false;
   for(let attempt=0;attempt<2;attempt++){
    const original=await syncRodPlayer();
    if(attempt>0&&submitted&&original.char.electricalRodMode===mode){await verifyMode(mode,code);return;}
    assert.equal(original.char.electricalRodMode??'rod',mode==='dual'?'rod':'dual','Expected starting rod configuration');
    try{
     if(!(await loadout.isVisible())){
      await page.locator('#view').focus();await page.keyboard.press('KeyC');
     }
     await loadout.getByRole('button',{name:'Weapons',exact:true}).click({timeout:30000});
     await installedRod.hover({timeout:30000});
     await page.waitForFunction(()=>!window.__attune.state().sheet.unseenItems.includes('electrical_combat_rod'),null,{timeout:30000});
     // Exercise the keyboard context-menu path, not a direct server mutation.
     await installedRod.press('Shift+F10',{timeout:30000});
     await context.waitFor({state:'visible',timeout:30000});
     assert.equal(await context.locator('.context-title').innerText(),'Electrical Combat Rod');
     const action=context.getByRole('button',{name:label,exact:true});
     await action.focus({timeout:30000});
     submitted=true;
     await action.press('Enter',{timeout:30000});
     await page.waitForFunction(({mode,code,id})=>{const s=window.__attune.state();return (s.sheet?.electricalRodMode===mode&&s.ents.find(e=>e.id===s.myId)?.row?.er===code)||(s.myId&&s.myId!==id);},{mode,code,id:original.id},{timeout:30000});
    }catch(error){
     if(error.name!=='TimeoutError'||server.game.players.get(original.id)===original||attempt===1)throw error;
    }
    const live=await syncRodPlayer();
    if(live.char.electricalRodMode===mode){assert.ok(submitted,'Mode changed without keyboard submission');await verifyMode(mode,code);return;}
    assert.notEqual(live.id,original.id,'Command failed in the same authenticated session');
    console.log('[rod configuration] retry after authenticated entity replacement',{previous:original.id,current:live.id,mode});
   }
   assert.fail('Rod configuration did not persist after authenticated reconnect');
  }
  await configure('Separate into dual batons','dual',2);
  assert.equal(p.char.electricalRodMode,'dual');
  await configure('Join into combat rod','rod',1);
  assert.equal(p.char.electricalRodMode,'rod');
  if(await loadout.isVisible())await loadout.getByRole('button',{name:'Close',exact:true}).click();
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
 // Switch back to the emitter through the hotbar action: the rod stays equipped and stowed.
 await page.locator('.weaponbar .weapon-action[data-action="weapon:switch"]').click();
 await page.waitForFunction(()=>{const a=window.__attune,s=a.state();return s.sheet.activeWeapon==='ranged'&&s.sheet.equipped.weapon==='electrical_combat_rod'&&s.sheet.equipped.ranged==='field_emitter'&&s.ents.find(e=>e.id===s.myId)?.row?.er===3&&!a.gfx.scene.getObjectByName('HeldElectricalCombatRod')&&a.gfx.scene.getObjectByName('StowedElectricalCombatRod');});
 assert.equal(p.char.electricalRodMode,'rod','the configuration is retained while stowed');
 // Recover the social wardrobe independently of combat equipment through real purchases and equipment UI.
 const wardrobePlayer=await liveFixturePlayer(page,server,'Vendor Tester');
 assert.equal(wardrobePlayer.char.id,p.char.id);
 assert.equal(wardrobePlayer.char.equipped.ranged,'field_emitter');p=wardrobePlayer;
 p.x=vendor.x;p.z=vendor.z+2;
 await page.waitForFunction(([x,z])=>Math.hypot(window.__attune.state().you.x-x,window.__attune.state().you.z-z)<.25,[p.x,p.z]);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');await panel.waitFor({state:'visible'});
 const social=panel.locator('.vendor-row').filter({hasText:'Sanctum Service Coat'});
 await social.getByRole('button',{name:'Preview',exact:true}).click();
 await social.locator('.social-preview').waitFor({state:'visible'});
 await social.getByRole('button',{name:'Buy 1',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet?.inventory.includes('social_service_coat')&&window.__attune.state().sheet?.credits===8);
 const wearing=await liveFixturePlayer(page,server,'Vendor Tester');
 assert.equal(wearing.char.id,p.char.id,'Wardrobe purchase remains on the same character');
 p=wearing;
 await panel.getByRole('button',{name:'Close vendor'}).click();
 await page.waitForFunction(()=>!window.__attune.state().you.vendor);
 await page.locator('#view').focus();await page.keyboard.press('KeyC');
 const socialLoadout=page.getByRole('dialog',{name:'Character and loadout',exact:true});
 await socialLoadout.getByRole('button',{name:'Character',exact:true}).click();
 const originalPortrait=await socialLoadout.locator('.doll-portrait .doll-image').getAttribute('src');
 await socialLoadout.getByRole('button',{name:'Social clothing',exact:true}).click();
 await socialLoadout.locator('.compact-item').filter({hasText:'Sanctum Service Coat'}).getByRole('button',{name:'Equip',exact:true}).click();
 await page.waitForFunction(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return s.sheet.equipped.social_torso==='social_service_coat'&&s.sheet.equipped.ranged==='field_emitter'&&s.sheet.equipped.weapon==='electrical_combat_rod'&&me.socialVisual==='service'&&me.socialWorn==='service';});
 await socialLoadout.getByRole('button',{name:'Character',exact:true}).click();
 await page.waitForFunction(previous=>{const img=document.querySelector('.doll-portrait .doll-image');return img?.getAttribute('src')&&img.getAttribute('src')!==previous;},originalPortrait);
 await page.screenshot({path:'vendor-evidence/08-social-wardrobe.png'});
 await socialLoadout.getByRole('button',{name:'Social clothing',exact:true}).click();
 await socialLoadout.getByRole('button',{name:'Torso: Sanctum Service Coat',exact:true}).press('Shift+F10');
 await page.locator('.player-context').getByRole('button',{name:'Unequip',exact:true}).click();
 await page.waitForFunction(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return !s.sheet.equipped.social_torso&&!me.socialWorn&&!me.socialVisual;});
 assert.deepEqual(errors,[]);
 console.log('PASS live quartermaster, private balance, sale, purchase, buyback, range dismissal and fitted social wardrobe');
}finally{await browser?.close();await server.close();}
