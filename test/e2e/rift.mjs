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
 await page.click('#gate-guest-link');await page.fill('#name','Rift Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2;});
 let p=await liveFixturePlayer(page,server,'Rift Tester');const f=server.game.rift;assert.ok(f);
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
 p.char.level=8;p.char.attunements=['resonance'];server.game.refreshStats(p);server.game.markDirty(p);
 async function move(o,z=1.7){const live=await liveFixturePlayer(page,server,'Rift Tester');assert.equal(live.char.id,p.char.id,'Movement fixture retains the same authenticated character');p=live;p.x=o.x;p.z=o.z+z;await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[p.x,p.z]);}
 await move(f.indexer);
 await page.evaluate(software=>{
   window.__attune.view({yaw:Math.PI/2,pitch:.22,dist:10,face:Math.PI/2});
   if(software)window.__attune.pause(true);
 },SOFTWARE_GL);
 // Arm the client-phase observer BEFORE the input. The previous observer
 // started after the browser/keyboard round trip, so under software rendering
 // the short opening phase could elapse before its first sample. Do not waive
 // the opening assertion: record it reliably from actual client snapshots.
 await page.evaluate(()=>{
   const watch={phases:[],last:null};
   const poll=()=>{
     const phase=window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf;
     if(phase&&phase!==watch.last){watch.phases.push(phase);watch.last=phase;}
   };
   watch.interval=setInterval(poll,25);
   poll();
   window.__riftPhaseWatch=watch;
 });
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 const phase=await page.evaluate(()=>new Promise(resolve=>{
   const watch=window.__riftPhaseWatch,started=performance.now();
   const poll=()=>{
     if(watch.phases.includes('unstable')||performance.now()-started>25000){
       clearInterval(watch.interval);
       delete window.__riftPhaseWatch;
       resolve(watch.phases);
     }else setTimeout(poll,25);
   };
   poll();
 }));
 assert.ok(phase.includes('opening'),'Expected opening after indexer activation, observed '+phase.join(', '));
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='unstable');
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:interference-membrane')));
 assert.ok(await page.evaluate(()=>{const r=window.__attune.gfx.scene.getObjectByName('rift:phase-scar');return ['rift:depth-veil','rift:filaments','rift:field-motes','rift:footprint-halo'].every(n=>r?.getObjectByName(n));}),'Reach rift retains enhanced atmosphere');
 await page.evaluate(()=>window.__attune.pause(false));
 // Keep the fixture outside the hazard and use normal F interaction to stabilize.
 await page.screenshot({path:'rift-evidence/01-open.png'});
 // Screenshot encoding and software rendering can consume an entire
 // 22-second live cycle. Keep networking/inputs active, pause only drawing
 // during the timing-sensitive interaction, and restart the real indexer
 // if the photographed cycle expired. No phase or clock mutation.
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 try{
   for(let cycle=0;cycle<3&&f.phase!=='stabilized';cycle++){
     if(f.phase!=='opening'&&f.phase!=='unstable'){
       await move(f.indexer);
       await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='dormant',null,{timeout:45000,polling:100});
       await page.locator('#view').focus();await page.keyboard.press('KeyF');
       await page.waitForFunction(()=>['opening','unstable'].includes(window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf),null,{timeout:10000,polling:100});
     }
     await move(f.regulator);
     await page.locator('#view').focus();
     for(let attempt=0;attempt<4&&['opening','unstable'].includes(f.phase);attempt++){
       const windowSeen=await page.waitForFunction(()=>{const a=window.__attune.state().ents.find(e=>e.c==='phase_scar');return a?.row.rf==='unstable'&&a.row.rw===0;},null,{timeout:8000,polling:100}).then(()=>true,()=>false);
       if(!windowSeen)continue;
       await page.keyboard.press('KeyF');
       const done=await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='stabilized',null,{timeout:6000,polling:100}).then(()=>true,()=>false);
       if(done)break;
     }
   }
   assert.equal(f.phase,'stabilized','regulator must accept a real counterphase interaction');
 }finally{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));}
 // the server holds the stabilized phase (asserted before the slow software screenshot,
 // which can outlast the 15 s stable window on a ~2 s/frame client)
 assert.equal(f.phase,'stabilized');
 await page.evaluate(()=>window.__attune.view({yaw:-Math.PI/2,pitch:.22,dist:10,face:-Math.PI/2}));
 await page.screenshot({path:'rift-evidence/02-stabilized.png'});
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
 // The gate wakes only when someone approaches it (the arrival is ~270 m away).
 const {gateToWorld}=await import('../../shared/severance-gate.js');
 assert.equal(server.game.severance.phase,'dormant','the gate sleeps while travellers are at the distant arrival terrace');
 {const approach=gateToWorld(0,-40);p.x=approach.x;p.z=approach.z;}
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='severance_gate')?.row.gp==='active',null,{timeout:30000,polling:250});
 await page.waitForFunction(()=>window.__attune.state().world.severance?.phase==='active',null,{polling:250});
 await page.screenshot({path:'rift-evidence/04-severance-expanse.png'});
 assert.ok(!server.game.enemies.some(e=>e.name==='Displaced Sentinel'),'the Annex is not opened by entering the expanse');
 // Walk the last metres into the passage with real input, then use the portal.
 const landing=gateToWorld(0,-5.5),inside=gateToWorld(0,0.2).z;p.x=landing.x;p.z=landing.z;
 await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.pos.x-x,s.pos.z-z)<.6;},[landing.x,landing.z],{polling:250});
 await page.evaluate(()=>window.__attune.view({yaw:0,pitch:.1,dist:4,face:0}));
 await page.locator('#view').focus();await page.keyboard.down('KeyW');
 await page.waitForFunction(z=>{const s=window.__attune.state();return s.you&&s.you.z>z;},inside,{timeout:60000,polling:100});
 await page.keyboard.up('KeyW');
 await page.screenshot({path:'rift-evidence/05-severance-passage.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 // Through the gate: the Silent Foundry (the Annex's replacement behind the gate).
 await page.waitForFunction(()=>window.__attune.state().you?.region==='silent_foundry',null,{polling:250});
 assert.equal(p.char.materials.resonance_fragment,1,'travel must not grant the calibration reward again');
 assert.ok(server.game.enemies.some(e=>e.name==='Foundry Overseer'),'the Foundry encounter opened');
 assert.ok(!server.game.objects.some(o=>o.type==='rift_entry'));
 await page.waitForFunction(()=>window.__attune.gfx.scene.getObjectByName('silent-foundry')?.visible===true,null,{polling:250});
 await page.waitForTimeout(1500);
 await page.screenshot({path:'rift-evidence/06-silent-foundry.png'});
 // Return through the Foundry portal, out of combat, with the original live player.
 const foundryExit=server.game.objects.find(o=>o.type==='foundry_return');
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 try{
  const live=await liveFixturePlayer(page,server,'Rift Tester',60000);
  assert.equal(live.char.id,p.char.id,'Foundry return retains the authenticated character');
  p=live;
  for(const e of server.game.enemies)if(e.foundryEncounter)e.threat.clear();
  p.combatUntil=0;
  p.x=foundryExit.x;p.z=foundryExit.z-3.6;
  try{
   await page.waitForFunction(id=>{const s=window.__attune.state(),exit=s.ents.find(e=>e.id===id);return s.you&&!s.you.auto&&exit&&Math.hypot(s.you.x-exit.row.x,s.you.z-exit.row.z)<5;},foundryExit.id,{timeout:20000,polling:100});
  }catch(error){
   const client=await page.evaluate(id=>{const s=window.__attune.state();return {id:s.myId,you:s.you&&{x:s.you.x,z:s.you.z,auto:s.you.auto,region:s.you.region},portal:s.ents.find(e=>e.id===id)?.row??null};},foundryExit.id);
   console.error('[foundry return precondition]',{client,fixture:{id:p.id,live:server.game.players.get(p.id)===p,x:p.x,z:p.z,auto:p.autoOn},exit:{x:foundryExit.x,z:foundryExit.z}});
   throw error;
  }
  await page.locator('#view').focus();await page.keyboard.press('KeyF');
  await page.waitForFunction(()=>window.__attune.state().you?.region==='severance_expanse',null,{polling:250});
 }finally{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));}
 // The arrival rift returns to the Reach. Approach from the actual arrival
 // terrace; render the stable membrane and verify the entity anchor.
 const beacon=server.game.severance.beacon;
 const {SEVERANCE_POCKET}=await import('../../shared/severance-gate.js');
 const {groundHeight}=await import('../../shared/world.js');
 const arrival=SEVERANCE_POCKET.arrival;
 const dx=arrival.x-beacon.x,dz=arrival.z-beacon.z,len=Math.hypot(dx,dz);
 const approach={x:beacon.x+dx/len*7,z:beacon.z+dz/len*7};
 await move(approach,0);
 const yaw=Math.atan2(-dx,-dz);
 await page.evaluate(yaw=>window.__attune.view({yaw,pitch:.17,dist:7,face:yaw}),yaw);
 await page.waitForFunction(({x,y,z})=>{
   const root=window.__attune.gfx.scene.getObjectByName('rift:severance-return');
   if(!root||!root.parent?.visible)return false;
   const membrane=root.getObjectByName('rift:interference-membrane');
   const pos=root.getWorldPosition(root.position.clone());
   return membrane?.material.uniforms.uStable.value===1&&membrane.material.uniforms.uPhase.value>0.5
    &&!root.getObjectByName('rift:persistent-warning')
    &&['rift:depth-veil','rift:filaments','rift:field-motes','rift:footprint-halo'].every(n=>root.getObjectByName(n))
    &&Math.hypot(pos.x-x,pos.y-y,pos.z-z)<.15;
 },{x:beacon.x,y:groundHeight(beacon.x,beacon.z),z:beacon.z},{polling:250});
 await page.screenshot({path:'rift-evidence/06-return-rift-approach.png'});
 await page.locator('#view').focus();
 try{
   await page.keyboard.down('KeyW');
   await page.waitForFunction(({x,z})=>{const p=window.__attune.state().you;const d=Math.hypot(p.x-x,p.z-z);return d>=2.85&&d<4.8;},{x:beacon.x,z:beacon.z},{polling:100,timeout:15000});
 }finally{await page.keyboard.up('KeyW');}
 await page.screenshot({path:'rift-evidence/07-return-rift-grounded.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().you?.region==='reach',null,{polling:250});
 assert.deepEqual(errors,[]);
 console.log('PASS actual rift interaction, synchronized phases, Severance Gate traversal and return');
}finally{await browser?.close();await server.close();}
