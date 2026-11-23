// Kestrel Deep: inspect the actual world scene with production GLB kits loaded.
// This is visual/integration evidence, NOT a claim of artistic approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL, describeGraphics } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';

const server=await startServer({port:0,dataFile:null});
let browser;
try {
  fs.mkdirSync('kestrel-evidence',{recursive:true});
  browser=await launchBrowser();
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(90000);
  await page.addInitScript(()=>localStorage.setItem('attunement.radioVoice','0'));
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
  await page.click('#gate-guest-link');
  await page.fill('#name','Kestrel Tester');
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(()=>{
    const s=window.__attune?.state();
    return s?.myId&&s.sheet?.cls==='surveyor'&&s.drawn>=2;
  });
  const p=await liveFixturePlayer(page,server,'Kestrel Tester');
  // Test setup only; live traversal, reward and collision contracts are not
  // modified. Avoid combat interruption during image capture.
  for (const enemy of server.game.enemies) {
    if(enemy.annexEncounter)continue;
    enemy.state='dead';enemy.deadAt=-1e9;enemy.respawnAt=Infinity;
    enemy.threat.clear();
  }
  p.x=-53.3;p.z=-8;p.jy=0;p.vy=0;
  await page.waitForFunction(()=>{const s=window.__attune?.state();return s.you&&Math.hypot(s.you.x+53.3,s.you.z+8)<.7;});
  await page.evaluate(()=>window.__attune.view({yaw:-Math.PI/2,pitch:.28,dist:9,face:-Math.PI/2}));
  await page.waitForFunction(()=>window.__attune.gfx.scene.getObjectByName('kestrel:visual-reconstruction')?.visible);
  const evidence=await page.evaluate(()=>{
    const THREE=window.__attune.gfx.scene.constructor;
    const scene=window.__attune.gfx.scene;
    const root=scene.getObjectByName('kestrel:visual-reconstruction');
    const names=[];
    let meshes=0,glb=0,instanced=0;
    root?.traverse(node=>{
      if(node.isMesh){meshes++;if(node.isInstancedMesh)instanced++;}
      if(node.name.startsWith('kestrel:glb:')){glb++;names.push(node.name);}
    });
    const regulator=root?.getObjectByName('kestrel:pressure-regulator-gallery');
    const regulatorInlets=regulator?.children.filter(n=>n.name==='kestrel:regulator-pressure-inlet').length||0;
    const regulatorReturns=regulator?.children.filter(n=>n.name==='kestrel:regulator-roof-relief').length||0;
    const regulatorBatches=regulator?.children.filter(n=>n.isInstancedMesh).length||0;
    const floor=root?.getObjectByName('kestrel:machined-floor-tiles');
    const light=root?.getObjectByName('kestrel:pressure-glow');
    const opening=scene.getObjectByName('kestrel:architecture');
    return {meshes,glb,instanced,kitNames:names,regulatorInlets,regulatorReturns,regulatorBatches,
      floorTiles:floor?.count||0,lightIntensity:light?.intensity,
      hasRoof:!!opening?.getObjectByName('kestrel:roof'),active:root?.visible};
  });
  assert.ok(evidence.active,'Kestrel reconstruction must be rendered');
  assert.ok(evidence.glb>=15,'Existing production GLB machinery must appear');
  assert.ok(evidence.instanced>=7,'Architecture must use batched geometry');
  assert.ok(evidence.floorTiles>=45);
  assert.ok(evidence.hasRoof,'Preserve the existing roof');
  assert.equal(evidence.regulatorInlets,2,'Both vessel feed connections must render');
  assert.equal(evidence.regulatorReturns,2,'Both pressure-relief pipes must render');
  assert.equal(evidence.regulatorBatches,10,'Regulator components must remain instanced');
  assert.ok(evidence.kitNames.includes('kestrel:glb:Prop_Computer'));
  assert.ok(evidence.kitNames.includes('kestrel:glb:Prop_Vent_Big'));
  assert.ok(Number.isFinite(evidence.lightIntensity));
  const graphics=await describeGraphics(page);
  console.log('KESTREL_RENDER '+JSON.stringify({evidence,graphics,viewport:{width:1280,height:800}}));
  // Pause *drawing*, not the actual server or session; the software renderer
  // can otherwise occupy multiple heartbeat intervals during screenshot IO.
  if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
  try{await page.screenshot({path:'kestrel-evidence/kestrel-1280x800.png'});}
  finally{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));}
  // Check layout/readiness at large display sizes without another expensive
  // software-GL encode or inventing a frame-rate measurement.
  for(const [width,height] of [[1920,1080],[2560,1440]]) {
    await page.setViewportSize({width,height});
    const intact=await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('kestrel:visual-reconstruction')?.visible);
    assert.equal(intact,true,'Kestrel props must persist at '+width+'x'+height);
  }
  assert.ok(errors.filter(e=>/kestrel|Uncaught|TypeError|ReferenceError/i.test(e)).length===0,
    'Kestrel render errors: '+errors.join('; '));
} finally {
  await browser?.close();
  await server.close();
}
