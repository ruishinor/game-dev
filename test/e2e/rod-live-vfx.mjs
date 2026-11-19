// Live rod visual gate. Fixture supplies ownership and positioning only;
// actual keyboard attack, authoritative damage and rendered VFX use game paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {equipItem} from '../../server/sim/progress.js';
import {clearCombatSpot} from '../cover-setup.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});let browser;
try{
 fs.mkdirSync('rod-live-evidence',{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1&vfxcapture=1&vfxt=.3'+(SOFTWARE_GL?'&rfps=1':''));
 await page.fill('#name','Rod VFX Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2});
 const p=await liveFixturePlayer(page,server,'Rod VFX Tester');
 p.char.inventory.push('electrical_combat_rod');assert.ok(equipItem(server.game,p,'electrical_combat_rod').ok);
 await page.waitForFunction(()=>{const a=window.__attune,r=a.gfx.scene.getObjectByName('HeldElectricalCombatRod');return r?.visible&&[0,1].every(i=>r.getObjectByName('RodCorona'+i)?.visible);});
 await page.evaluate(()=>{window.__attune.view({yaw:2.2,pitch:.21,dist:4.5});});
 await page.evaluate(()=>{window.__attune.pause(true);window.__attune.effects.step(.1);});
 await page.screenshot({path:'rod-live-evidence/01-equipped-idle.png'});
 await page.evaluate(()=>window.__attune.pause(false));
 // Isolate the encounter before moving the fixture, retaining real enemy AI.
 const enemy=server.game.enemies.find(e=>e.type==='skitter'&&!e.annexEncounter);
 assert.ok(enemy);
 for(const e of server.game.enemies){if(e===enemy)continue;e.state='dead';e.deadAt=-1e9;e.respawnAt=Infinity;e.threat.clear();}
 enemy.maxHp=enemy.hp=Math.max(enemy.maxHp,400);
 const spot=clearCombatSpot(enemy,1.5,1.7);
 p.x=spot.x;p.z=spot.z;
 const yaw=Math.atan2(enemy.x-spot.x,enemy.z-spot.z);
 p.yaw=yaw;
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return s.you&&Math.hypot(s.you.x-x,s.you.z-z)<.5&&s.pos&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[spot.x,spot.z]);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.24,dist:5.5,face:yaw}),yaw);
 await page.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.inView&&!e.dead),enemy.id);
 await page.locator('#view').focus();await page.keyboard.press('Tab');
 await page.waitForFunction(id=>window.__attune.state().target===id,enemy.id);
 const before=enemy.hp;
 // Freeze effect ageing only, not simulation or animation; capture a genuine
 // contact event at a reproducible point rather than racing software GL.
 await page.evaluate(()=>window.__attune.pause(true));
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>{const r=window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod');return r?.userData.rodContactCount>0;});
 assert.ok(enemy.hp<before,'real server damage occurred');
 assert.ok((await liveFixturePlayer(page,server,'Rod VFX Tester'))===p);
 await page.evaluate(()=>window.__attune.effects.step(.12));
 const visible=await page.evaluate(()=>{const a=window.__attune,r=a.gfx.scene.getObjectByName('HeldElectricalCombatRod');let ribbons=0;a.gfx.scene.getObjectByName('vfx-engine')?.traverse(o=>{if(o.name==='vfx-ribbon'&&o.visible)ribbons++;});return {ribbons,contact:r?.userData.rodContactCount,quality:a.state().quality};});
 assert.ok(visible.quality===1&&visible.contact>0&&visible.ribbons>0,JSON.stringify(visible));
 await page.screenshot({path:'rod-live-evidence/02-authoritative-contact.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS live rod corona and real damage-triggered VFX at standard quality',visible);
}finally{await browser?.close();await server.close();}
