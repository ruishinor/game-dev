// Live melee contract: actual keyboard -> authenticated server windup ->
// damage at contact -> different GLB clips, contact VFX, no page exceptions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {equipItem} from '../../server/sim/progress.js';
import {clearCombatSpot} from '../cover-setup.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';

const server=await startServer({port:0,dataFile:null});
let browser;
try{
 fs.mkdirSync('melee-live-evidence',{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
 await page.click('#gate-guest-link');await page.fill('#name','Melee Tester');
 await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2});
 const p=await liveFixturePlayer(page,server,'Melee Tester');
 p.char.inventory.push('electrical_combat_rod');
 assert.ok(equipItem(server.game,p,'electrical_combat_rod').ok);
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.sheet?.equipped.weapon==='electrical_combat_rod'&&!!window.__attune.gfx.scene.getObjectByName('HeldElectricalCombatRod');});
 const enemy=server.game.enemies.find(e=>e.type==='skitter'&&!e.annexEncounter);assert.ok(enemy);
 for(const e of server.game.enemies){if(e===enemy)continue;e.state='dead';e.respawnAt=Infinity;e.deadAt=-1e9;e.threat.clear();}
 enemy.maxHp=enemy.hp=500;server.game.aiHold=true;
 const spot=clearCombatSpot(enemy,1.5,1.7),yaw=Math.atan2(enemy.x-spot.x,enemy.z-spot.z);
 p.x=spot.x;p.z=spot.z;p.yaw=yaw;
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return s.you&&Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[spot.x,spot.z]);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.22,dist:5.4,face:yaw}),yaw);
 await page.locator('#view').focus();await page.keyboard.press('Tab');
 await page.waitForFunction(id=>window.__attune.state().target===id,enemy.id);
 const events=[],sink=server.game.emitWorldEvent.bind(server.game);
 server.game.emitWorldEvent=(e)=>{if(e.s===p.id&&['melee_start','dmg','melee_miss'].includes(e.e))events.push({...e,at:server.game.time});return sink(e);};
 const expectedClips=['Melee_Hook','Punch_Cross','OverhandThrow'];
 let previous=enemy.hp;
 for(let stage=1;stage<=3;stage++){
   const initial=events.length;
   await page.locator('#view').focus();await page.keyboard.press('KeyT');
   const started=Date.now();
   while(!events.slice(initial).some(x=>x.e==='melee_start')&&Date.now()-started<15000)await new Promise(r=>setTimeout(r,40));
   const start=events.slice(initial).find(x=>x.e==='melee_start');
   assert.ok(start,'keyboard command started attack '+stage);
   assert.equal(start.style,String(stage),'correct combo stage');
   await page.waitForFunction(clip=>{const s=window.__attune.state();return s.ents.find(e=>e.id===s.myId)?.anim?.last===clip;},expectedClips[stage-1]);
   const begun=Date.now();
   while(!events.slice(initial).some(x=>x.e==='dmg'&&x.ab==='melee_light')&&Date.now()-begun<15000)await new Promise(r=>setTimeout(r,40));
   const hit=events.slice(initial).find(x=>x.e==='dmg'&&x.ab==='melee_light');
   assert.ok(hit,'authoritative damage was applied');
   assert.ok(hit.at-start.at>=200,'damage not issued at strike-start time');
   assert.equal(hit.mv,String(stage));
   assert.ok(enemy.hp<previous,'target health reduced');
   previous=enemy.hp;
   await page.screenshot({path:'melee-live-evidence/'+stage+'-rod-strike.png'});
   if(stage<3)await page.waitForTimeout(510);
 }
 assert.ok((await liveFixturePlayer(page,server,'Melee Tester'))===p);
 assert.deepEqual(errors,[],'no browser errors');
 console.log('PASS three live intentional melee stages, server windups, distinct GLB clip routing, damage and screenshots');
}finally{await browser?.close();await server.close();}
