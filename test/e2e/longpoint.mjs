// Browser gate: real two-client replication, equipped visual and removal.
// The test fixture grants an existing QL5 item; never adds a public grant command.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const out=path.resolve('longpoint-evidence');await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:null});let browser;const errors=[];
try{
 browser=await launchBrowser();
 async function join(name){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.bringToFront();
  await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
  await page.fill('#name',name);await page.click('.classcard[data-cls="surveyor"]');await page.click('#enter');
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
 p.char.inventory.push('longpoint_emitter');p.char.equipped.weapon='longpoint_emitter';server.game.refreshStats(p);server.game.markDirty(p);
 const mounted=id=>window.__attune.state().ents.some(e=>e.id===id&&e.weaponVisual==='longpoint'&&e.weaponVisible);
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(mounted,p.id);}
 await owner.bringToFront();await owner.evaluate(()=>window.__attune.view({yaw:2.2,pitch:.21,dist:4.5}));
 await capture(owner,'owner-equipped.png');await capture(observer,'observer-equipped.png');
 assert.ok((await liveFixturePlayer(owner,server,'Longpoint Tester'))===p,'Owner must remain connected');
 p.char.equipped.weapon=null;server.game.refreshStats(p);server.game.markDirty(p);
 for(const page of [owner,observer]){await page.bringToFront();await page.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id&&!e.weaponVisual&&!e.weaponVisible),p.id);}
 assert.deepEqual(errors,[]);console.log('PASS: two real clients receive and remove the equipped Longpoint presentation.');
}finally{await browser?.close();await server.close();}
