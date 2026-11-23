// Vanguard main/ranged weapon slots, weapon selection hotkey, Combat Rod
// configuration hotbar action, remapping, focus routing and persistence,
// through the real loadout UI, keyboard and authenticated server.
// The fixture supplies only item ownership, placement and an isolated enemy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import {clearCombatSpot} from '../cover-setup.js';
import {WEAPON_SWITCH} from '../../shared/weapons.js';
import {CLASSES} from '../../shared/content.js';
const OUT='weapon-switch-evidence';
const server=await startServer({port:0,dataFile:null});let browser;
try{
 fs.mkdirSync(OUT,{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message+' @ '+String(e.stack).split('\n').slice(1,3).join(' / ').trim()));
 await page.goto(`http://127.0.0.1:${server.port}/?q=1&qlock=1&nolock=1`+(SOFTWARE_GL?'&rfps=1':''));
 await page.click('#gate-guest-link');await page.fill('#name','Switch Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2;});
 let p=await liveFixturePlayer(page,server,'Switch Tester');
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 // Reconnection temporarily withdraws the server-projected sheet. Wait for a
 // complete authoritative projection, then assert actual equipment as before.
 // A persistent disconnect still fails with an explicit timeout rather than a
 // misleading TypeError from dereferencing the intermediate null sheet.
 const state=async()=>{
  await page.waitForFunction(()=>{const s=window.__attune?.state();return !!(s?.myId&&s.sheet?.equipped&&s.ents?.some(e=>e.id===s.myId));},null,{timeout:15000});
  return page.evaluate(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return {active:s.sheet.activeWeapon??null,weapon:s.sheet.equipped.weapon??null,ranged:s.sheet.equipped.ranged??null,mode:s.sheet.electricalRodMode??null,er:me?.row?.er??null};});
 };
 const until=(fn,arg)=>page.waitForFunction(fn,arg);
 // Software GL: draws are paused throughout (simulation, networking and models
 // continue) so a slow frame cannot stall the connection; resume only to capture.
 const paused=on=>SOFTWARE_GL?page.evaluate(on=>window.__attune.pause(on),on):null;
 const shot=async name=>{await paused(false);const n=await page.evaluate(()=>window.__attune.state().drawn);await until(n=>window.__attune.state().drawn>n,n);await page.screenshot({path:`${OUT}/${name}.png`});await paused(true);};
 // In SwiftShader the evidence frame may take minutes while the independent
 // authoritative simulation keeps ticking. Freeze *only fixture combat* while
 // drawing an already-validated contact, then restore timing in finally.
 // Without this, screenshot time (not a gameplay failure) can kill the player
 // or the fixture enemy before the next real combat assertion.
 const combatShot=async name=>{
  if(!SOFTWARE_GL)return shot(name);
  const actor=await liveFixturePlayer(page,server,'Switch Tester');
  const wasHeld=!!server.game.aiHold,oldNext=actor.nextAuto;
  const combatRemaining=Math.max(0,(actor.combatUntil||0)-server.game.time);
  server.game.aiHold=true;
  actor.nextAuto=server.game.time+15*60*1000;
  try{await shot(name);}
  finally{
   actor.nextAuto=oldNext;
   // The screenshot is observational, not gameplay time: keep the remaining
   // authoritative fixture combat linger unchanged despite slow SwiftShader.
   if(combatRemaining>0)actor.combatUntil=Math.max(actor.combatUntil||0,server.game.time+combatRemaining);
   server.game.aiHold=wasHeld;
  }
 };
 const bar=page.locator('.weaponbar'),switchBtn=bar.locator('[data-action="weapon:switch"]'),configBtn=bar.locator('[data-action="weapon:config"]');
 const view=page.locator('#view');

 // 1. With no weapons: switching melee/ranged is available (innate attacks); rod configuration is unavailable and explained.
 await bar.waitFor({state:'visible'});
 assert.ok(!(await switchBtn.isDisabled()));assert.match(await switchBtn.getAttribute('aria-label'),/Active: melee, Unarmed melee/);
 assert.ok(await configBtn.isDisabled());assert.match(await configBtn.getAttribute('aria-label'),/no rod equipped/);
 assert.equal(await switchBtn.locator('.key').innerText(),'Z');assert.equal(await configBtn.locator('.key').innerText(),'G');

 // 2. Ownership fixture, then equip both through the regular loadout UI.
 // A reconnect can briefly clear the projected sheet. Wait for the complete
 // server-owned equipment state instead of throwing on an intermediate null.
 p.char.inventory.push('electrical_combat_rod','field_emitter');server.game.markDirty(p);
 await until(()=>window.__attune.state().sheet.inventory.includes('field_emitter'));
 await view.focus();await page.keyboard.press('KeyC');
 const loadout=page.getByRole('dialog',{name:'Character and loadout',exact:true});
 await loadout.getByRole('button',{name:'Weapons',exact:true}).click();
 // The Ranged slot is a real, empty slot, not a reserved placeholder.
 await loadout.getByRole('button',{name:'Ranged: Empty',exact:true}).waitFor();
 await loadout.getByRole('button',{name:'Weapon: Empty',exact:true}).waitFor();
 await loadout.locator('.compact-item').filter({hasText:'Electrical Combat Rod'}).getByRole('button',{name:'Equip',exact:true}).click();
 await until(()=>window.__attune.state().sheet?.equipped?.weapon==='electrical_combat_rod');
 await loadout.locator('.compact-item').filter({hasText:'Field Pulse Emitter'}).getByRole('button',{name:'Equip',exact:true}).click();
 await until(()=>window.__attune.state().sheet?.equipped?.ranged==='field_emitter');
 await loadout.getByRole('button',{name:'Weapon: Electrical Combat Rod',exact:true}).waitFor();
 await loadout.getByRole('button',{name:'Ranged: Field Pulse Emitter',exact:true}).waitFor();
 assert.deepEqual({weapon:p.char.equipped.weapon,ranged:p.char.equipped.ranged},{weapon:'electrical_combat_rod',ranged:'field_emitter'});
 assert.equal((await state()).active,'weapon','equipping the emitter does not displace the rod in use');
 await shot('01-loadout-both-slots');
 await loadout.getByRole('button',{name:'Close',exact:true}).click();

 // 3. Idle evidence: joined rod in hand at rest, close camera.
 await page.evaluate(()=>window.__attune.view({yaw:2.2,pitch:.21,dist:3.6}));
 await until(()=>{const r=window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod');return r?.visible&&[0,1].every(i=>r.getObjectByName('RodEmitterGlow'+i)?.material.opacity>.3&&r.getObjectByName('RodPlasmaSheath'+i)?.visible);});
 await shot('02-joined-idle-standing');

 // 4. Rod configuration via the hotbar binding, out of combat, with transform evidence.
 await view.focus();await page.keyboard.press('KeyG');
 await until(()=>{const s=window.__attune.state();return s.sheet.electricalRodMode==='dual'&&s.ents.find(e=>e.id===s.myId)?.row?.er===2;});
 await page.waitForTimeout(450);await shot('03-transform-to-dual');
 assert.equal(await configBtn.getAttribute('data-mode'),'dual');
 await page.waitForTimeout(1500);await shot('04-dual-idle-standing');
 // Hover explains the action, its binding and current state.
 await configBtn.hover();
 const tip=page.locator('.tooltip');await tip.waitFor({state:'visible'});
 assert.match(await tip.innerText(),/Rod configuration \(G\)[\s\S]*Current: Dual batons/);
 // The hotbar button itself also works (pointer path) and returns to joined.
 await configBtn.click();
 await until(()=>window.__attune.state().sheet.electricalRodMode==='rod');
 await view.focus();await page.keyboard.press('KeyG');
 await until(()=>window.__attune.state().sheet.electricalRodMode==='dual');

 // 5. Text entry focus: typing the hotkeys into chat does not fire combat actions.
 await view.focus();await page.keyboard.press('Enter');
 await until(()=>document.activeElement?.tagName==='INPUT');
 await page.keyboard.type('xzxz');
 await page.waitForTimeout(400);
 assert.deepEqual((await state()).active,'weapon');assert.equal(p.char.electricalRodMode,'dual');
 await page.keyboard.press('Escape');

 // 6. Remap in Settings → Keybindings: conflict rejected, then G assigned.
 await view.focus();await page.keyboard.press('KeyO');
 const settings=page.getByRole('dialog',{name:'Settings',exact:true});
 await settings.waitFor({state:'visible'});
 await settings.getByRole('button',{name:'Configure combat and companion hotkeys',exact:true}).click();
 const keys=page.getByRole('dialog',{name:'Combat and companion keybindings',exact:true});
 await keys.waitFor({state:'visible'});
 const change=keys.locator('[data-binding="weapon:switch"]');
 await change.click();await page.keyboard.press('Digit1');
 assert.match(await keys.locator('.keybind-error').innerText(),/Already assigned to ability:1/);
 await change.click();await page.keyboard.press('KeyN');
 assert.match(await keys.locator('.keybind-error').innerText(),/Binding saved/);
 assert.equal(await change.innerText(),'N');
 // While capturing, the key never reached the game: nothing switched.
 assert.equal((await state()).active,'weapon');
 await keys.getByRole('button',{name:'Back to Settings',exact:true}).click();
 await settings.getByRole('button',{name:'Close settings'}).click();
 assert.equal(await switchBtn.locator('.key').innerText(),'N');
 await view.focus();await page.keyboard.press('KeyZ');
 await page.waitForTimeout(500);assert.equal((await state()).active,'weapon','old key unbound');
 await page.keyboard.press('KeyN');
 await until(()=>window.__attune.state().sheet.activeWeapon==='ranged');
 const stowed=await state();
 assert.equal(stowed.er,3);assert.equal(stowed.mode,'dual','configuration retained while stowed');
 await until(()=>{const r=window.__attune.gfx.scene.getObjectByName('StowedElectricalCombatRod');return /^spine_0/.test(r?.parent?.name||'')&&r.visible;});
 // Config is unavailable while the rod is stowed, and says why.
 assert.ok(await configBtn.isDisabled());assert.match(await configBtn.getAttribute('aria-label'),/Select melee to draw the rod first \(N\)/);
 await switchBtn.hover();await tip.waitFor({state:'visible'});
 assert.match(await tip.innerText(),/Switch weapon \(N\)[\s\S]*Active: Ranged — Field Pulse Emitter/);
 await page.keyboard.press('KeyG');await page.waitForTimeout(400);assert.equal(p.char.electricalRodMode,'dual');
 await page.evaluate(()=>window.__attune.view({yaw:Math.PI*.15,pitch:.2,dist:3.4}));
 await shot('05-ranged-active-rod-stowed');
 await view.focus();await page.keyboard.press('KeyO');
 await settings.waitFor({state:'visible'});
 await settings.getByRole('button',{name:'Configure combat and companion hotkeys',exact:true}).click();
 await keys.getByRole('button',{name:'Restore default hotkeys',exact:true}).click();
 await keys.getByRole('button',{name:'Back to Settings',exact:true}).click();
 await settings.getByRole('button',{name:'Close settings'}).click();
 assert.equal(await switchBtn.locator('.key').innerText(),'Z');

 // 7. Combat: isolated enemy; ranged auto-attack from beyond melee reach.
 p.hp=p.maxHp;
 const skitters=server.game.enemies.filter(e=>e.type==='skitter'&&!e.annexEncounter);
 const enemy=skitters[0];assert.ok(enemy);
 // A second, distant skitter for the joined-configuration contact.
 const second=skitters.slice(1).sort((a,b)=>Math.hypot(b.x-enemy.x,b.z-enemy.z)-Math.hypot(a.x-enemy.x,a.z-enemy.z))[0];assert.ok(second);
 for(const e of server.game.enemies){if(e===enemy||e===second)continue;e.state='dead';e.deadAt=-1e9;e.respawnAt=Infinity;e.threat.clear();}
 for(const e of [enemy,second])e.maxHp=e.hp=Math.max(e.maxHp,600);
 // Hold pursuit only while checking initial ranged contact distance.
 // The shot still uses authenticated input and authoritative damage.
 server.game.aiHold=true;
 // Fixture: restore an in-reach real auto-attack after slow software-GL
 // captures. Do not force enemy death or bypass server damage authority.
 const finish=async e=>{
  p=await liveFixturePlayer(page,server,'Switch Tester');
  assert.ok(!p.dead,'finishing player must be alive');
  assert.equal(p.char.activeWeapon,'weapon','the rod remains selected for melee');
  assert.notEqual(e.state,'evade','cannot finish an evading enemy');
  const spot=clearCombatSpot(e,0,1.6);
  p.x=spot.x;p.z=spot.z;p.yaw=Math.atan2(e.x-spot.x,e.z-spot.z);p.target=e.id;
  e.hp=1;e.respawnAt=Infinity;server.game.markDirty(p);
  const held=server.game.aiHold;server.game.aiHold=true;
  try{
   await until(([x,z])=>{const s=window.__attune.state();return s.you&&Math.hypot(s.you.x-x,s.you.z-z)<.5;},[spot.x,spot.z]);
   if(!p.autoOn){
    await view.focus();await page.keyboard.press('KeyR');
    await until(()=>window.__attune.state().you?.auto===1);
   }
   const t=Date.now();while(e.state!=='dead'&&Date.now()-t<30000)await new Promise(r=>setTimeout(r,100));
   assert.equal(e.state,'dead','fight finished by a real server hit');
  }finally{server.game.aiHold=held;}
  e.respawnAt=Infinity;
  await until(()=>{const s=window.__attune.state(),me=s.ents.find(x=>x.id===s.myId);return me&&!(me.row?.f&8)&&!s.you?.auto;});
 };
 const far=clearCombatSpot(enemy,0,10);
 p=await liveFixturePlayer(page,server,'Switch Tester');
 p.x=far.x;p.z=far.z;p.yaw=Math.atan2(enemy.x-far.x,enemy.z-far.z);
 await until(([x,z])=>{const s=window.__attune.state();return s.you&&Math.hypot(s.you.x-x,s.you.z-z)<.5;},[far.x,far.z]);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.22,dist:6,face:yaw}),p.yaw);
 await until(id=>window.__attune.state().ents.some(e=>e.id===id&&e.inView&&!e.dead),enemy.id);
 await view.focus();await page.keyboard.press('Tab');
 await until(id=>window.__attune.state().target===id,enemy.id);
 const hp0=enemy.hp,events=[];const sink=server.game.emitWorldEvent.bind(server.game);
 server.game.emitWorldEvent=e=>{if(e.e==='dmg'&&e.s===p.id)events.push({...e,hitDistance:Math.hypot(p.x-enemy.x,p.z-enemy.z)});return sink(e);};
 await page.keyboard.press('KeyR');
 await until(()=>window.__attune.state().you?.auto===1);
 const t0=Date.now();while(!events.some(e=>e.ab==='auto')&&Date.now()-t0<20000)await new Promise(r=>setTimeout(r,100));
 const shotEvent=events.find(e=>e.ab==='auto');
 assert.ok(shotEvent,'ranged auto-attack fired');assert.equal(shotEvent.k,'bolt');assert.ok(enemy.hp<hp0);
 // The skitter can close on the player after firing. Measure on the same
 // authoritative damage event, rather than after asynchronous browser polling.
 assert.ok(shotEvent.hitDistance>CLASSES.vanguard.auto.range+2,
  'ranged hit must occur beyond melee reach; observed '+shotEvent.hitDistance.toFixed(2)+' m');
 // Hold hostile AI during software-rendered evidence capture; real server attack/damage remains active.
 assert.equal(server.game.aiHold,true,'weapon-switch capture fixture keeps enemy retaliation paused');
 await combatShot('06-ranged-fire');

 // 8. Switch in combat; the next swing is delayed, not advanced (recovery timing is covered by Node tests).
 assert.ok(server.game.time<p.combatUntil,'in combat');
 const nextBefore=p.nextAuto;
 await page.keyboard.press('KeyZ');
 await until(()=>window.__attune.state().sheet.activeWeapon==='weapon');
 assert.ok(p.nextAuto>=nextBefore,'switching never advances the next auto-attack');
 // Config is refused in combat (existing rule) and the hotbar says so.
 await page.keyboard.press('KeyG');await page.waitForTimeout(300);assert.equal(p.char.electricalRodMode,'dual');
 assert.match(await configBtn.getAttribute('aria-label'),/Unavailable in combat|Stop auto-attack/);
 // Close in for melee: the dual configuration strikes with the rod.
 const near=clearCombatSpot(enemy,0,1.6);p.x=near.x;p.z=near.z;p.yaw=Math.atan2(enemy.x-near.x,enemy.z-near.z);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.24,dist:5,face:yaw}),p.yaw);
 const meleeFrom=events.length;
 const t1=Date.now();while(!events.slice(meleeFrom).some(e=>e.ab==='auto'&&e.k==='melee')&&Date.now()-t1<20000)await new Promise(r=>setTimeout(r,100));
 assert.ok(events.slice(meleeFrom).some(e=>e.ab==='auto'&&e.k==='melee'),'rod melee auto-attack');
 await until(()=>(window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod')?.userData.rodContactCount??0)>0);
 await combatShot('07-dual-contact');

 // 9. Finish the fight, rejoin out of combat, then joined contact (most intense).
 await finish(enemy);
 // Fixture: software-GL captures take real seconds while the server keeps
 // simulating; restore health so slow evidence frames cannot decide the fight.
 p.hp=p.maxHp;
 await page.keyboard.press('KeyG');
 await until(()=>window.__attune.state().sheet.electricalRodMode==='rod');
 await page.waitForTimeout(1200);
 const near2=clearCombatSpot(second,0,1.6);p.x=near2.x;p.z=near2.z;p.yaw=Math.atan2(second.x-near2.x,second.z-near2.z);
 await until(([x,z])=>{const s=window.__attune.state();return s.you&&Math.hypot(s.you.x-x,s.you.z-z)<.5;},[near2.x,near2.z]);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.24,dist:5,face:yaw}),p.yaw);
 await until(id=>window.__attune.state().ents.some(e=>e.id===id&&e.inView&&!e.dead),second.id);
 await view.focus();await page.keyboard.press('Tab');
 await until(id=>window.__attune.state().target===id,second.id);
 const contacts=await page.evaluate(()=>window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod')?.userData.rodContactCount??0);
 await page.keyboard.press('Digit1');
 await until(n=>(window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod')?.userData.rodContactCount??0)>n,contacts);
 await combatShot('08-joined-contact');
 await page.waitForTimeout(500);await combatShot('09-joined-residual');

 // 10. Switch to ranged and back (in combat) keeps the rod configuration.
 await page.keyboard.press('KeyZ');await until(()=>window.__attune.state().sheet.activeWeapon==='ranged');
 await page.waitForTimeout(WEAPON_SWITCH.cooldownMs+200);
 await page.keyboard.press('KeyZ');await until(()=>window.__attune.state().sheet.activeWeapon==='weapon');
 assert.equal((await state()).mode,'rod');assert.equal((await state()).er,1);
 p.hp=p.maxHp;await finish(second);

 // 11. Reload: equipped slots, active selection and configuration persist.
 await page.keyboard.press('KeyZ');await until(()=>window.__attune.state().sheet.activeWeapon==='ranged');
 await page.reload();
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2;});
 await paused(true);
 const after=await state();
 assert.deepEqual(after,{active:'ranged',weapon:'electrical_combat_rod',ranged:'field_emitter',mode:'rod',er:3});
 p=await liveFixturePlayer(page,server,'Switch Tester');
 assert.equal(p.char.inventory.filter(id=>id==='electrical_combat_rod').length,1,'no duplicated item state');

 // 12. Empty ranged slot: removing the weapon in use falls back to the rod; switching
 // stays available and selects the class's innate ranged attack.
 await view.focus();await page.keyboard.press('KeyC');
 await loadout.getByRole('button',{name:'Weapons',exact:true}).click();
 await loadout.getByRole('button',{name:'Ranged: Field Pulse Emitter',exact:true}).press('Shift+F10');
 await page.locator('.player-context').getByRole('button',{name:'Unequip',exact:true}).click();
 await until(()=>{const s=window.__attune.state();return !s.sheet.equipped.ranged&&s.sheet.activeWeapon==='weapon';});
 await loadout.getByRole('button',{name:'Close',exact:true}).click();
 assert.ok(!(await switchBtn.isDisabled()));assert.equal((await state()).er,1);
 await view.focus();await page.keyboard.press('KeyZ');
 await until(()=>window.__attune.state().sheet.activeWeapon==='ranged');
 assert.equal((await state()).er,3,'rod stowed while the innate ranged attack is active');
 await page.waitForTimeout(WEAPON_SWITCH.cooldownMs+200);
 await page.keyboard.press('KeyZ');await until(()=>window.__attune.state().sheet.activeWeapon==='weapon');

 // 13. Sit / stand emote (X): seated flag replicated; moving stands up.
 const seated=()=>page.evaluate(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return !!(me?.row?.f&16);});
 assert.equal(await seated(),false,'typing x in chat earlier did not sit');
 await page.keyboard.press('KeyX');await until(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return me?.row?.f&16;});
 await page.waitForTimeout(600);await shot('10-seated');
 await page.keyboard.press('KeyX');await until(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return !(me?.row?.f&16);});
 await page.keyboard.press('KeyX');await until(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return me?.row?.f&16;});
 await page.keyboard.down('KeyW');await until(()=>{const s=window.__attune.state(),me=s.ents.find(e=>e.id===s.myId);return !(me?.row?.f&16);});await page.keyboard.up('KeyW');
 assert.deepEqual(errors,[]);
 console.log('PASS weapon slots, melee/ranged switch (Z), rod configuration (G), sit/stand (X), remap, focus routing and persistence');
}finally{await browser?.close();await server.close();}
