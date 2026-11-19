import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});let browser;
try{
 fs.mkdirSync('rift-evidence',{recursive:true});browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
 await page.fill('#name','Rift Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2;});
 const p=await liveFixturePlayer(page,server,'Rift Tester'),f=server.game.rift;assert.ok(f);
 // Verify the actual runtime GLB, not the static asset preview or fallback.
 await page.waitForFunction(()=>{
   const root=window.__attune.gfx.scene.getObjectByName('stillpoint:live');
   let skin=false;root?.traverse(node=>{if(node.isSkinnedMesh&&node.skeleton?.bones.length===10)skin=true;});
   return root&&skin&&Math.hypot(root.position.x,root.position.z)<11;
 });
 await page.waitForFunction(()=>{
   const root=window.__attune.gfx.scene.getObjectByName('stillpoint:live');
   if(!root||root.userData.stillpointClip!=='Walk')return false;
   const first=window.__stillpointFirst??={x:root.position.x,z:root.position.z};
   return Math.hypot(root.position.x-first.x,root.position.z-first.z)>.2;
 });
 // This browser path tests anomaly pulses, interaction, rewards and travel.
 // Suppress unrelated roaming outdoor enemies in the isolated test fixture
 // so their attacks cannot continually refresh the recovery combat lock.
 // Actual anomaly damage, phases and Annex encounters remain active.
 for(const enemy of server.game.enemies){
   if(enemy.annexEncounter)continue;
   enemy.state='dead';enemy.deadAt=-1e9;enemy.respawnAt=Infinity;enemy.threat.clear();
 }
 p.char.level=3;p.char.attunements=['resonance'];server.game.refreshStats(p);server.game.markDirty(p);
 async function move(o,z=1.7){p.x=o.x;p.z=o.z+z;await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[p.x,p.z]);}
 await move(f.indexer);
 await page.evaluate(software=>{
   window.__attune.view({yaw:Math.PI/2,pitch:.22,dist:10,face:Math.PI/2});
   if(software)window.__attune.pause(true);
 },SOFTWARE_GL);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 const phase=await page.evaluate(()=>{
   const observed=[];
   return new Promise(resolve=>{
     const started=performance.now();
     const poll=()=>{
       const phase=window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf;
       if(phase&&observed.at(-1)!==phase)observed.push(phase);
       if(phase==='unstable'||performance.now()-started>25000)resolve(observed);
       else requestAnimationFrame(poll);
     };
     poll();
   });
 });
 assert.ok(phase.includes('opening'),'Expected opening after indexer activation, observed '+phase.join(', '));
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='unstable');
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:interference-membrane')));
 await page.evaluate(()=>window.__attune.pause(false));
 // Keep the fixture outside the hazard and use normal F interaction to stabilize.
 await page.screenshot({path:'rift-evidence/01-open.png'});
 await move(f.regulator);
 await page.waitForFunction(()=>{const a=window.__attune.state().ents.find(e=>e.c==='phase_scar');return a?.row.rf==='unstable'&&a.row.rw===0;});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='stabilized');
 await page.evaluate(()=>window.__attune.view({yaw:-Math.PI/2,pitch:.22,dist:10,face:-Math.PI/2}));
 await page.screenshot({path:'rift-evidence/02-stabilized.png'});
 assert.equal(f.phase,'stabilized');
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.some(q=>q.id==='field:rift_calibration'&&q.progress==='1 / 2 stages'));
 await move(f.core,3.6);
 await page.waitForFunction(()=>{
   const {you,ents,myId}=window.__attune.state();
   const actor=ents.find(e=>e.id===myId);
   return actor&&!actor.dead&&!(actor.row.f&8)&&you&&!you.auto&&['stabilized','cooling','dormant'].includes(ents.find(e=>e.c==='phase_scar')?.row.rf);
 },null,{timeout:12000,polling:100}).catch(error=>{
   throw new Error(`Recovery precondition failed (phase ${f.phase}, HP ${p.hp}, combat ${p.combatUntil-server.game.time}ms)`,{cause:error});
 });
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().sheet.materials.resonance_fragment===1,null,{timeout:12000,polling:100}).catch(error=>{
   throw new Error(`Core recovery failed (phase ${f.phase}, calibration ${p.char.riftCalibration}, credits ${p.char.materials?.resonance_fragment ?? 0}, HP ${p.hp}, combat ${p.combatUntil-server.game.time}ms)`,{cause:error});
 });
 assert.equal(p.char.materials.resonance_fragment,1);
 await page.locator('#view').focus();await page.keyboard.press('KeyL');
 const journal=page.getByRole('dialog',{name:'Quest Journal'});
 await journal.locator('[data-quest="field:rift_calibration"]').click();
 assert.match(await journal.locator('.quest-rewards').innerText(),/Resonance fragment/);
 assert.equal(await journal.locator('[data-quest="field:rift_calibration"]').getAttribute('data-status'),'completed');
 await page.screenshot({path:'rift-evidence/03-calibration.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyL');
 await move(f.core,3.6);
 // The calibrated gate can be used in dormant, cooling or stabilized phases.
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 // Phase Scar -> Severance Expanse: the gate's approach, its real GLB and its server phase.
 await page.waitForFunction(()=>window.__attune.state().you?.region==='severance_expanse',null,{polling:250});
 await page.waitForFunction(()=>window.__attune.state().world.severance?.status==='ready',null,{timeout:120000,polling:500});
 assert.ok(await page.evaluate(()=>{const g=window.__attune.gfx.scene.getObjectByName('severance-gate');let stone=0;g?.traverse(n=>{if(n.isMesh&&/SG_Stone/.test(n.material?.name||''))stone++;});return g?.visible&&stone>=2;}),'Severance Gate GLB rendered in the expanse');
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='severance_gate')?.row.gp==='active',null,{timeout:30000,polling:250});
 await page.waitForFunction(()=>window.__attune.state().world.severance?.phase==='active',null,{polling:250});
 await page.screenshot({path:'rift-evidence/04-severance-expanse.png'});
 assert.ok(!server.game.enemies.some(e=>e.name==='Displaced Sentinel'),'the Annex is not opened by entering the expanse');
 // Walk the last metres into the passage with real input, then use the portal.
 const {gateToWorld}=await import('../../shared/severance-gate.js');
 const landing=gateToWorld(0,-5.5);p.x=landing.x;p.z=landing.z;
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.pos.x-x,s.pos.z-z)<.6;},[landing.x,landing.z],{polling:250});
 await page.evaluate(()=>window.__attune.view({yaw:0,pitch:.1,dist:4,face:0}));
 await page.locator('#view').focus();await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.you&&s.you.z>52.4;},null,{timeout:60000,polling:100});
 await page.keyboard.up('KeyW');
 await page.screenshot({path:'rift-evidence/05-severance-passage.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().you.x>200,null,{polling:250});
 assert.equal(p.char.materials.resonance_fragment,1,'travel must not grant the calibration reward again');
 assert.ok(server.game.enemies.some(e=>e.name==='Displaced Sentinel'));
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:licensed-frame')));
 assert.ok(!server.game.objects.some(o=>o.type==='rift_entry'));
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:annex-deck')));
 assert.ok(await page.evaluate(()=>{
   const cache=window.__attune.gfx.scene.getObjectByName('annex:recovery-cache');
   let count=0;cache?.traverse(node=>{if(node.isMesh)count++});
   return count>0;
 }), 'The Annex cache has rendered geometry after travel');
 await page.screenshot({path:'rift-evidence/06-annex.png'});
 assert.equal(server.game.enemies.filter(e=>e.annexEncounter).length,11);
 assert.ok(await page.evaluate(()=>{let walls=0;window.__attune.gfx.scene.traverse(o=>{if(o.name==='annex:bulkhead')walls++});return walls===4;}));
  assert.equal(await page.evaluate(()=>{let n=0;window.__attune.gfx.scene.traverse(o=>{if(o.name==='annex:mineral-formation')n++});return n;}),10);
 // Stage inside the Annex on the far side of the return gate, away from
 // gallery enemies. Do not reset aggro, buffs or combat timers.
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 try{
  await move(f.exit,1.7);
  await page.waitForFunction(id=>{
   const s=window.__attune.state(),self=s.ents.find(e=>e.id===s.myId);
   if(!self||self.dead||(self.row.f&8)||self.row.b?.includes('root')||!s.you||s.you.auto)return false;
   const eligible=new Set((s.you.lootable??[]).map(e=>e.id));
   const nearest=s.ents.filter(e=>e.row&&(e.k==='o'||(e.k==='e'&&e.dead&&eligible.has(e.id))))
     .map(e=>({id:e.id,d:Math.hypot(e.row.x-s.you.x,e.row.z-s.you.z)}))
     .filter(e=>e.d<=5).sort((a,b)=>a.d-b.d||a.id-b.id)[0];
   return nearest?.id===id;
  },f.exit.id,{timeout:20000,polling:100});
  assert.ok((await liveFixturePlayer(page,server,'Rift Tester'))===p,'Annex return must use the original live player');
  await page.locator('#view').focus();await page.keyboard.press('KeyF');
  // The Annex returns to the foot of the Severance Gate.
  await page.waitForFunction(()=>window.__attune.state().you?.region==='severance_expanse',null,{polling:250});
 }catch(error){
  throw new Error(`Annex return failed (HP ${p.hp}, phase ${f.phase}, combat ${Math.round(p.combatUntil-server.game.time)}ms, auto ${p.autoOn}, root ${p.buffs.some(b=>b.k==='root'&&b.until>server.game.time)}, distance ${Math.hypot(p.x-f.exit.x,p.z-f.exit.z).toFixed(2)})`,{cause:error});
 }finally{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));}
 // The arrival beacon returns to the Reach.
 const beacon=server.game.severance.beacon;await move(beacon,1.6);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().you?.region==='reach',null,{polling:250});
 assert.deepEqual(errors,[]);
 console.log('PASS actual rift interaction, synchronized phases, Severance Gate traversal and return');
}finally{await browser?.close();await server.close();}
