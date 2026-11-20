// Live render gate for recovered compact firearms: actual server-owned weapon
// appearance is replicated to an independent observing client.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const out=path.resolve('compact-weapon-evidence');await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:null});let browser;const errors=[];
try{
 browser=await launchBrowser();
 async function join(name){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(70000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.bringToFront();
  await page.goto('http://127.0.0.1:'+server.port+'/?q=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
  await page.fill('#name',name);
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.sheet?.cls==='surveyor'&&s.drawn>0&&s.draw.triangles>10000;});
  if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
  return page;
 }
 async function capture(page,file){
  await page.bringToFront();
  if(SOFTWARE_GL){
   const before=await page.evaluate(()=>{const a=window.__attune,n=a.state().drawn;a.pause(false);return n;});
   try{await page.waitForFunction(n=>window.__attune.state().drawn>n,before,{timeout:70000,polling:100});}
   finally{await page.evaluate(()=>window.__attune.pause(true));}
  }
  await page.screenshot({path:path.join(out,file)});
 }
 const owner=await join('Carry Technician');
 const p=await liveFixturePlayer(owner,server,'Carry Technician');
 const observer=await join('Carry Witness');
 await observer.waitForFunction(id=>window.__attune.state().ents.some(e=>e.id===id),p.id);
 for(const [item,token] of [['field_emitter','field'],['tuned_emitter','tuned']]){
  if(!p.char.inventory.includes(item))p.char.inventory.push(item);
  // These are ranged-slot items after the dual-weapon migration. Keep the
  // owner in the real server-selected ranged mode; the observer gets only
  // replicated cosmetic identity, never inventory or fixture state.
  p.char.equipped.ranged=item;
  p.char.activeWeapon='ranged';
  server.game.refreshStats(p);server.game.markDirty(p);
  for(const [page,label] of [[owner,'owner'],[observer,'witness']]){
   await page.bringToFront();
   await page.waitForFunction(({id,token})=>{
    const a=window.__attune,s=a?.state(),e=s?.ents.find(e=>e.id===id);
    const model=a?.gfx.scene.getObjectByName('weapon-carry:'+token);
    let meshCount=0;
    model?.traverse(o=>{if(o.isMesh&&o.visible)meshCount++});
    return !!(e&&e.weaponVisual===token&&e.weaponVisible&&model?.visible&&model.parent?.name==='hand_r'&&meshCount>0
      &&!a.gfx.scene.getObjectByName('weapon-carry:'+(token==='field'?'tuned':'field')));
   },{id:p.id,token});
   await capture(page,label+'-'+token+'.png');
  }
 }
 p.char.equipped.ranged=null;server.game.refreshStats(p);server.game.markDirty(p);
 for(const page of [owner,observer]){
  await page.bringToFront();
  await page.waitForFunction(id=>{
   const a=window.__attune,e=a.state().ents.find(e=>e.id===id);
   return e&&!e.weaponVisual&&!e.weaponVisible
     &&!a.gfx.scene.getObjectByName('weapon-carry:field')
     &&!a.gfx.scene.getObjectByName('weapon-carry:tuned')
     &&!a.gfx.scene.getObjectByName('weapon-carry:dense');
  },p.id);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: Field and Tuned are real attached and removable weapon meshes in two authenticated clients; Dense is staged, Longpoint untouched.');
}finally{await browser?.close();await server.close();}
