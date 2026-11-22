// Browser gate: real two-client replication, equipped visual and removal.
// The test fixture grants an existing QL5 item; never adds a public grant command.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import {clearCombatSpot} from '../cover-setup.js';
const family=process.env.ATTUNEMENT_RIFLE_TEST_FAMILY||'longpoint';
const ids={longpoint:'longpoint_emitter','relay-carbine':'relay_carbine','bastion-rifle':'bastion_rifle'};
assert.ok(Object.hasOwn(ids,family));
const out=path.resolve('longpoint-evidence',family);await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:null});let browser;const errors=[];
try{
 browser=await launchBrowser();
 async function join(name){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.bringToFront();
  await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
  await page.click('#gate-guest-link');await page.fill('#name',name);await page.click('.classcard[data-cls="surveyor"]');await page.click('#enter');
  await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.sheet?.cls==='surveyor'&&s.drawn>0&&s.draw.triangles>10000;});
  if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
  return page;
 }
 async function capture(page,file){
  await page.bringToFront();
  if(SOFTWARE_GL){
   const before=await page.evaluate(()=>{const n=window.__attune.state().drawn;window.__attune.pause(false);return n;});
   try{await page.waitForFunction(n=>window.__attune.state().drawn>n,before,{timeout:60000,polling:100});}
   finally{await page.evaluate(()=>window.__attune.pause(true));}
  }
  await page.screenshot({path:path.join(out,file)});
 }
 const owner=await join('Longpoint Tester'),p=await liveFixturePlayer(owner,server,'Longpoint Tester'),observer=await join('Longpoint Witness');
 await observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id),p.id);
 p.char.inventory.push(ids[family]);p.char.equipped.ranged=ids[family];server.game.refreshStats(p);server.game.markDirty(p);
 const mounted=({id,family})=>window.__attune.state().ents.some(e=>e.id===id&&e.weaponVisual===family&&e.weaponVisible);
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(mounted,{id:p.id,family});}
 await owner.bringToFront();await owner.evaluate(()=>window.__attune.view({yaw:2.2,pitch:.21,dist:4.5}));
 await capture(owner,'owner-equipped.png');await capture(observer,'observer-equipped.png');
 await owner.bringToFront();await owner.locator('#view').focus();await owner.keyboard.press('KeyZ');
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(({id,family})=>window.__attune.state().ents.some(e=>e.id===id&&e.weaponVisual===family+'-stowed'&&!e.weaponVisible),{id:p.id,family});}
 await capture(owner,'owner-stowed.png');
 await owner.bringToFront();await owner.waitForFunction(()=>!window.__attune.state().you?.weaponSwitchMs);
 await owner.locator('#view').focus();await owner.keyboard.press('KeyZ');
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(mounted,{id:p.id,family});}
 assert.ok((await liveFixturePlayer(owner,server,'Longpoint Tester'))===p,'Owner must remain connected');
 // Real input fires the currently mounted rifle. Fixture only stages distance
 // and isolates other enemies; no damage or animation is injected.
 await owner.bringToFront();
 const enemy=server.game.enemies.find(e=>e.type==='skitter'&&!e.annexEncounter);
 assert.ok(enemy);
 for(const e of server.game.enemies){if(e===enemy)continue;e.state='dead';e.deadAt=-1e9;e.respawnAt=Infinity;e.threat.clear();}
 enemy.maxHp=enemy.hp=Math.max(enemy.maxHp,400);
 const spot=clearCombatSpot(enemy,3,5),yaw=Math.atan2(enemy.x-spot.x,enemy.z-spot.z);
 p.x=spot.x;p.z=spot.z;p.yaw=yaw;
 await owner.waitForFunction(([x,z])=>{const s=window.__attune.state();return s.you&&s.pos&&Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1},[spot.x,spot.z]);
 await owner.evaluate(yaw=>window.__attune.view({yaw,pitch:.24,dist:5.5,face:yaw}),yaw);
 await owner.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&e.inView&&!e.dead),enemy.id);
 await owner.locator('#view').focus();await owner.keyboard.press('Tab');
 await owner.waitForFunction(id=>window.__attune.state().target===id,enemy.id);
 const before=enemy.hp;
 await owner.keyboard.press('KeyR');
 await owner.waitForFunction(()=>{let shots=0;window.__attune.gfx.scene.traverse(o=>{shots+=o.userData.rifleShotCount||0});return shots>0;});
 assert.ok(enemy.hp<before,'authoritative auto attack caused damage');
 await owner.keyboard.press('KeyR');
 await owner.waitForFunction(()=>window.__attune.state().you.auto===0);
 assert.ok((await liveFixturePlayer(owner,server,'Longpoint Tester'))===p,'Firing must preserve original player');
 // Return to the observer's region before checking replicated removal.
 p.x=-2.25;p.z=8.2;
 await owner.waitForFunction(()=>Math.hypot(window.__attune.state().you.x+2.25,window.__attune.state().you.z-8.2)<.5);
 p.char.equipped.ranged=null;server.game.refreshStats(p);server.game.markDirty(p);
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&!e.weaponVisual&&!e.weaponVisible),p.id);}
 assert.deepEqual(errors,[]);console.log('PASS: two real clients receive, fire, stow, draw and remove the equipped rifle:',family);
}finally{await browser?.close();await server.close();}
