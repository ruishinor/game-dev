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
    const production=root?.getObjectByName('kestrel:production-machinery');
    const compressors=production?.children.filter(n=>n.name.startsWith('kestrel:compressor-impeller:')).length||0;
    const compressorConnections=production?.children.filter(n=>n.name==='kestrel:compressor-to-feed').length||0;
    const compressorBatchMeshes=production?.children.filter(n=>n.isInstancedMesh).length||0;
    const regulator=root?.getObjectByName('kestrel:pressure-regulator-gallery');
    const regulatorInlets=regulator?.children.filter(n=>n.name==='kestrel:regulator-pressure-inlet').length||0;
    const regulatorReturns=regulator?.children.filter(n=>n.name==='kestrel:regulator-roof-relief').length||0;
    const regulatorBatches=regulator?.children.filter(n=>n.isInstancedMesh).length||0;
    const floor=root?.getObjectByName('kestrel:machined-floor-tiles');
    const light=root?.getObjectByName('kestrel:pressure-glow');
    const opening=scene.getObjectByName('kestrel:architecture');
    return {meshes,glb,instanced,kitNames:names,compressors,compressorConnections,compressorBatchMeshes,regulatorInlets,regulatorReturns,regulatorBatches,
      floorTiles:floor?.count||0,lightIntensity:light?.intensity,
      hasRoof:!!opening?.getObjectByName('kestrel:roof'),active:root?.visible};
  });
  assert.ok(evidence.active,'Kestrel reconstruction must be rendered');
  assert.ok(evidence.glb>=15,'Existing production GLB machinery must appear');
  assert.ok(evidence.instanced>=7,'Architecture must use batched geometry');
  assert.ok(evidence.floorTiles>=45);
  assert.ok(evidence.hasRoof,'Preserve the existing roof');
  assert.equal(evidence.compressors,2,'Paired compressor rotors must render');
  assert.equal(evidence.compressorConnections,2,'Both compressors must connect to the pressure feeds');
  assert.equal(evidence.compressorBatchMeshes,8,'Rebuilt machinery must remain batched');
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
  // Real player-camera views: the original east entrance frame cannot show
  // the west-side process equipment or prove its assembly quality.
  const cameraEvidence=[];
  for(const shot of [
    {name:'central-aisle',x:-56.5,z:-8,dist:4.8},
    {name:'north-pressure-bay',x:-56.2,z:-4.8,dist:4.5},
    {name:'south-pressure-bay',x:-56.2,z:-11.2,dist:4.5},
  ]) {
    p.x=shot.x;p.z=shot.z;p.jy=0;p.vy=0;
    await page.waitForFunction(([x,z])=>{
      const you=window.__attune?.state().you;
      return !!you&&Math.hypot(you.x-x,you.z-z)<.8;
    },[shot.x,shot.z]);
    const startDrawn=await page.evaluate(()=>window.__attune.state().drawn);
    await page.evaluate(dist=>window.__attune.view({
      yaw:-Math.PI/2,pitch:.16,dist,face:-Math.PI/2,
    }),shot.dist);
    await page.waitForFunction(start=>window.__attune?.state().drawn>=start+2,startDrawn);
    const draw=await page.evaluate(()=>{
      const r=window.__attune.gfx.renderer;
      const s=window.__attune.state();
      return {calls:s.draw.calls,triangles:s.draw.triangles,
        geometries:r.info.memory.geometries,textures:r.info.memory.textures,
        drawn:s.drawn};
    });
    cameraEvidence.push({name:shot.name,x:shot.x,z:shot.z,draw});
    if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
    try {
      await page.screenshot({path:'kestrel-evidence/kestrel-'+shot.name+'-1280x800.png'});
    } finally {
      if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));
    }
  }
  // Isolate the incremental scene cost of the rebuilt equipment. These are
  // software-WebGL submitted draw/triangle counts, not physical GPU timings.
  const isolated=await page.evaluate(async()=>{
    const root=window.__attune.gfx.scene.getObjectByName('kestrel:production-machinery');
    const sample=async()=>{
      const start=window.__attune.state().drawn;
      const t0=performance.now();
      while(window.__attune.state().drawn<start+3&&performance.now()-t0<8000)
        await new Promise(resolve=>setTimeout(resolve,80));
      const s=window.__attune.state();
      return {wallMs:Math.round(performance.now()-t0),
        frames:s.drawn-start,calls:s.draw.calls,triangles:s.draw.triangles};
    };
    let enabled,disabled;
    try {
      enabled=await sample();
      root.visible=false;
      disabled=await sample();
    } finally {
      root.visible=true;
    }
    return {enabled,disabled,
      deltaCalls:enabled.calls-disabled.calls,
      deltaTriangles:enabled.triangles-disabled.triangles};
  });
  console.log('KESTREL_PERFORMANCE '+JSON.stringify({
    graphics,viewport:{width:1280,height:800},
    cameraEvidence,isolated,
    qualification:'SwiftShader software rendering; wall time includes browser/server scheduling, not real-GPU frame time',
  }));
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
