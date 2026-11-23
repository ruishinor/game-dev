// P05 gameplay-camera profiler. Run on a real GPU with:
//   ATTUNEMENT_GPU=1 ATTUNEMENT_HEADED=1 node tools/profile-combat.mjs
// Use ATTUNEMENT_WIDTH, ATTUNEMENT_HEIGHT, ATTUNEMENT_QUALITY and
// ATTUNEMENT_COMBAT_FRAMES for repeatable desktop/TV comparisons.
// Distinguishes real renderer identity from software WebGL; does not claim
// authoritative damage performance from an artificial static stress test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer} from '../server/index.js';
import {equipItem, selectWeapon, setElectricalRodMode} from '../server/sim/progress.js';
import {activeWeaponSlot} from '../shared/weapons.js';
import {clearCombatSpot} from '../test/cover-setup.js';
import {launchBrowser,describeGraphics,SOFTWARE_GL,activeBrowserPlayer} from './browser.mjs';

const integer=(key,fallback,min,max)=>{
 const n=Number(process.env[key]);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:fallback;
};
const width=integer('ATTUNEMENT_WIDTH',1280,640,3840),height=integer('ATTUNEMENT_HEIGHT',800,480,2160);
const quality=integer('ATTUNEMENT_QUALITY',1,0,2),frames=integer('ATTUNEMENT_COMBAT_FRAMES',120,30,360);
const out=path.resolve('docs/evidence/p05-combat-'+width+'x'+height+'-q'+quality);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={when:new Date().toISOString(),softwareRendering:SOFTWARE_GL,
  viewport:{width,height},quality,frames,graphics:null,scenarios:[],errors:[]};
const save=async()=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'profile.json'),JSON.stringify(report,null,2)+'\n');};
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.setDefaultTimeout(60000);
 page.on('pageerror',err=>report.errors.push(String(err.message).slice(0,250)));
 report.graphics=await describeGraphics(page);
 const label=[report.graphics?.vendor,report.graphics?.renderer].filter(Boolean).join(' ');
 if(!SOFTWARE_GL&&(!label||/swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(label)))
   throw Error('Hardware GPU not verified: '+(label||'unknown renderer'));
 await page.goto('http://127.0.0.1:'+server.port+'/?nolock=1&qlock=1&q='+quality);
 await page.click('#gate-guest-link');await page.fill('#name','P05 GPU Probe');
 await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const x=window.__attune?.state();return x?.myId&&x?.drawn>=2&&x?.sheet?.cls==='vanguard';});
 const p=await activeBrowserPlayer(page,server,'P05 GPU Probe'),g=server.game;
 p.char.inventory.push('electrical_combat_rod','longpoint_emitter');
 assert.ok(equipItem(g,p,'electrical_combat_rod').ok,'equip rod');
 // QL5 rifle requirements may exceed the level-one profiling fixture.
 // Prefer normal equip rules; if the fixture cannot satisfy those requirements,
 // stage only its legitimate owned/equipped test state, as in Longpoint e2e.
 const rifleEquip=equipItem(g,p,'longpoint_emitter');
 if(!rifleEquip.ok){
   p.char.equipped.ranged='longpoint_emitter';
   g.refreshStats(p);g.markDirty(p);
   console.warn('[P05 profile] rifle loadout staged as fixture:',rifleEquip.reason);
 }
 assert.equal(activeWeaponSlot(p.char),'weapon','Vanguard begins in melee mode');
 const enemy=g.enemies.find(e=>e.type==='skitter'&&!e.annexEncounter);
 assert.ok(enemy,'spawn a server-authored hostile');
 for(const e of g.enemies){if(e!==enemy){e.state='dead';e.deadAt=-1e9;e.respawnAt=Infinity;e.threat.clear();}}
 enemy.maxHp=enemy.hp=Math.max(enemy.maxHp,100000);g.aiHold=true;
 const spot=clearCombatSpot(enemy,1.5,1.7),yaw=Math.atan2(enemy.x-spot.x,enemy.z-spot.z);
 p.x=spot.x;p.z=spot.z;p.yaw=yaw;
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return s.pos&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[spot.x,spot.z]);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.22,dist:5.4,face:yaw}),yaw);
 const events=[],emit=g.emitWorldEvent.bind(g);
 g.emitWorldEvent=e=>{if(e.e==='dmg'&&e.s===p.id)events.push({k:e.k,ab:e.ab,time:g.time});return emit(e);};
 for(const scenario of [
  {name:'rod-joined',slot:'weapon',rod:'rod',expected:1},
  {name:'rod-dual',slot:'weapon',rod:'dual',expected:2},
  {name:'longpoint',slot:'ranged',rod:null,expected:null},
 ]){
  p.autoOn=false;p.combatUntil=g.time; // Fixture isolates presentation between scenarios.
  if(scenario.rod){
   const result=setElectricalRodMode(g,p,scenario.rod);
   assert.ok(result.ok,scenario.name+' configuration: '+result.reason);
  } else {
   while(g.time<(p.weaponSwitchReady||0))await sleep(40);
   const result=selectWeapon(g,p,'ranged');
   assert.ok(result.ok,'select Longpoint for benchmark: '+result.reason);
  }
  await page.waitForFunction(({name,expected})=>{
   const a=window.__attune,s=a.state(),me=s.ents.find(e=>e.id===s.myId);
   return name==='longpoint'?me?.weaponVisual==='longpoint':me?.row?.er===expected&&!!a.gfx.scene.getObjectByName('HeldElectricalCombatRod');
  },scenario);
  p.target=enemy.id;p.nextAuto=0;p.autoOn=true;
  const before=events.length,deadline=Date.now()+6000;
  while(events.length===before&&Date.now()<deadline)await sleep(50);
  assert.ok(events.length>before,scenario.name+' must produce a real accepted combat hit');
  const metrics=await page.evaluate(async count=>{
    const stamps=[];
    await new Promise(resolve=>{
      const sample=t=>{stamps.push(t);if(stamps.length>count)resolve();else requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    });
    const sorted=stamps.slice(1).map((v,i)=>v-stamps[i]).sort((a,b)=>a-b);
    const pick=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
    const state=window.__attune.state();
    return {medianMs:pick(.5),p95Ms:pick(.95),worstMs:sorted.at(-1),
      medianFps:1000/pick(.5),cpuFrameMs:state.frameMs,
      drawCalls:state.draw?.calls,triangles:state.draw?.triangles,
      activeEntities:state.ents.filter(e=>e.inView).length,
      equipped:state.ents.find(e=>e.id===state.myId)?.weaponPose??null};
  },frames);
  p.autoOn=false;
  await page.screenshot({path:path.join(out,scenario.name+'.png')});
  report.scenarios.push({name:scenario.name,serverHits:events.length-before,...metrics});
  await save();
 }
 await save();
 console.log(JSON.stringify({output:out,graphics:report.graphics,softwareRendering:SOFTWARE_GL,scenarios:report.scenarios},null,2));
 if(SOFTWARE_GL)console.warn('SOFTWARE WEBGL: do not interpret these FPS numbers as hardware GPU performance.');
} catch(err){
 report.errors.push(String(err.stack||err));
 await save();
 console.error('P05 combat profile incomplete:',String(err));
 process.exitCode=1;
}finally{
 try{await browser?.close();}catch{}
 await server.close();
}
