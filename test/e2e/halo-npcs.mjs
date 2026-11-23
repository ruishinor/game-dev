// Live server and browser: the four Sanctum wardens and the Halo Construct
// vendor are the pipeline-produced GLB (not a fallback), stand where the
// shared world says, face outward, and keep animating independently. Writes
// screenshots and measurements to halo-evidence/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { launchBrowser, describeGraphics, SOFTWARE_GL } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';
import { SANCTUM_GUARDS, WORLD, OBJECTS } from '../../shared/world.js';

const OUT = 'halo-evidence';
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
const report = { guards: [], vendor: null, perf: {}, watchSamples: [], pageErrors: [], consoleErrors: [], consoleWarnings: [], rifleSources: [] };
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); else if(m.type()==='warning')report.consoleWarnings.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?q=1&qlock=1&nolock=1${SOFTWARE_GL ? '&rfps=1' : ''}`);
  await page.click('#gate-guest-link');await page.fill('#name', 'Halo Witness');
  await page.click('.classcard[data-cls="vanguard"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.drawn >= 2; });
  // SwiftShader can monopolize the browser main thread during continuous
  // Sanctum rendering, starving WebSocket pongs and invalidating the real
  // authenticated fixture. Keep simulation/networking live; render only when
  // capturing evidence, as in the shared integrated-browser harness.
  if (SOFTWARE_GL) await page.evaluate(() => window.__attune.pause(true));
  report.graphics = await describeGraphics(page);
  // Diagnose HTTP source and decoder failures separately from rig/attachment
  // mismatches; no bypass of the requirement that all wardens visibly equip.
  report.rifleSources = await page.evaluate(async()=>{
    return Promise.all(['carbine','marksman'].map(async id=>{
      const url='/client/assets/sanctum-warden-'+id+'.glb';
      try{
        const res=await fetch(url),raw=await res.arrayBuffer();
        return {id,status:res.status,bytes:raw.byteLength,magic:new TextDecoder().decode(raw.slice(0,4))};
      }catch(error){return {id,error:String(error)}}
    }));
  });
  // Re-resolve the live fixture before every move (play.mjs pattern) and wait
  // for the browser to render the authoritative position.
  const teleport = async (x, z) => {
    const p = await liveFixturePlayer(page, server, 'Halo Witness');
    p.x = x; p.z = z; p.jy = 0; p.vy = 0;
    if (p.companion) { p.companion.x = x + 1.5; p.companion.z = z - 1.5; }
    server.game.markDirty(p);
    await page.waitForFunction(([tx, tz]) => { const s = window.__attune.state(); return !!s.you && Math.hypot(s.you.x - tx, s.you.z - tz) < 1.0; }, [x, z]);
  };

  // --- the server owns exactly four wardens outside the perimeter
  const guards = server.game.objects.filter((o) => o.type === 'sanctum_guard');
  assert.equal(guards.length, 4, 'exactly four Sanctum wardens');
  assert.equal(server.game.objects.filter((o) => o.type === 'quartermaster').length, 1, 'one quartermaster, not duplicated');
  for (const g of guards) assert.ok(Math.hypot(g.x - WORLD.sanctum.x, g.z - WORLD.sanctum.z) > WORLD.sanctum.r, `${g.key} outside the perimeter`);

  // --- walk the fixture player to each warden in turn; the client must draw the Halo GLB facing outward
  for (const def of SANCTUM_GUARDS) {
    const out = Math.hypot(def.x, def.z);
    await teleport(def.x + (def.x / out) * 4.5, def.z + (def.z / out) * 4.5); // outside, in front of the warden
    const ent = await page.waitForFunction((name) => {
      const s = window.__attune.state();
      const near = s.ents.filter((e) => e.c === 'sanctum_guard' && e.halo && e.halo.yaw !== undefined && e.halo.yaw !== null);
      return near.length ? near : null;
    }, def.key);
    const ents = await ent.jsonValue();
    const mine = ents.reduce((best, e) => (Math.hypot(e.x - def.x, e.z - def.z) < Math.hypot(best.x - def.x, best.z - def.z) ? e : best));
    assert.ok(Math.hypot(mine.x - def.x, mine.z - def.z) < 0.05, `${def.key} drawn at its shared position`);
    assert.equal(mine.model, 'glb', `${def.key} is the Halo GLB, not a fallback`);
    assert.equal(mine.halo.role, 'guard');
    const expectedPrimary = mine.halo.variant % 2 === 0 ? 'rifle' : 'combat-rod';
    assert.equal(mine.halo.primary, expectedPrimary, `${def.key} alternating primary weapon`);
    assert.equal(mine.halo.presentation, expectedPrimary,
      `${def.key} must display its assigned primary weapon, not the fallback`);
    assert.ok(mine.halo.meshes.includes('stave'), `${def.key} retains the hidden anchored fallback`);
    if (expectedPrimary === 'rifle') {
      const id = mine.halo.variant === 2 ? 'marksman' : 'carbine';
      assert.ok(mine.halo.meshes.includes('warden-rifle:' + id),
        `${def.key} visibly equips the correct archived rifle`);
      assert.ok(!mine.halo.meshes.includes('warden-combat-rod:energized'),
        `${def.key} must not carry a second primary weapon`);
      assert.equal(mine.halo.fit?.mode,'ready',`${def.key} rifle grips must be fitted`);
      assert.ok(mine.halo.fit.gripError < .035 && mine.halo.fit.supportError < .035,
        `${def.key} both rifle hand-to-grip errors <35mm`);
      assert.equal(mine.halo.fit?.failures,0,`${def.key} no transient rifle-fit failures`);
    } else {
      assert.ok(mine.halo.meshes.includes('warden-combat-rod:energized'),
        `${def.key} must carry the joined combat rod`);
      assert.ok(!mine.halo.meshes.some(n=>n.startsWith('warden-rifle:')),
        `${def.key} must not carry a rifle`);
      assert.equal(mine.halo.fit?.mode,'ready',`${def.key} rod should have a prepared guard pose`);
      assert.ok(mine.halo.fit?.gripError < .015,
        `${def.key} rod must remain attached to the real right palm`);
      assert.ok(mine.halo.fit?.armError < .035,
        `${def.key} rod guard pose must be reachable`);
      assert.equal(mine.halo.fit?.joined,true,`${def.key} rod must be joined`);
      assert.equal(mine.halo.fit?.energized,true,`${def.key} rod must stay powered`);
      assert.equal(mine.halo.fit?.energy,1,`${def.key} must use full energy`);
      assert.equal(mine.halo.fit?.coronaVisible,2,`${def.key} both powered corona sections should show`);
      assert.ok(mine.halo.fit?.shaftVerticality > .2 && mine.halo.fit.shaftVerticality < .65,
        `${def.key} staff must point diagonally away from the head ring`);
      assert.equal(mine.halo.fit?.failures,0,`${def.key} no transient rod pose failure`);
    }
    const fx = Math.sin(mine.halo.yaw), fz = Math.cos(mine.halo.yaw);
    const outward = (fx * def.x + fz * def.z) / Math.hypot(def.x, def.z);
    assert.ok(outward > 0.999, `${def.key} faces away from the Sanctum centre (cos ${outward.toFixed(4)})`);
    // Save a normal third-person frame separately from close inspection
    // views. This is player-camera evidence, not a posed art render.
    const regularDrawn=await page.evaluate(software=>{
      const n=window.__attune.state().drawn;
      if (software) window.__attune.pause(false);
      return n;
    },SOFTWARE_GL);
    await page.waitForFunction(n=>window.__attune.state().drawn>n,regularDrawn);
    if (SOFTWARE_GL) await page.evaluate(()=>window.__attune.pause(true));
    await page.screenshot({path:`${OUT}/${def.key}-gameplay.png`});
    // Earlier 'front' captures actually framed the local player's back and
    // occasionally hid the warden entirely. Position the review camera
    // relative to the drawn Halo world transform, not to the test player.
    // Pause ordinary drawing only during each capture, then restore it.
    for (const [view,azimuth] of [['front',0],['side',Math.PI/2],['rear',Math.PI]]) {
      await page.evaluate(({x,z,azimuth})=>{
        const api=window.__attune,{scene,camera,renderer}=api.gfx;
        api.pause(true);
        let found=null,best=Infinity;
        scene.traverse(o=>{
          if(o.name!=='halo_construct:guard')return;
          const at=o.getWorldPosition(camera.position.clone());
          const d=Math.hypot(at.x-x,at.z-z);
          if(d<best){best=d;found=at;}
        });
        if(!found||best>.5)throw new Error('Cannot locate live Halo model for visual review');
        // This explicitly marks an *inspection* view. Repositioning the
        // browser camera bypasses the normal camera/frustum ordering, so
        // override that entity's prior-frame culling for this render only.
        // Ordinary gameplay evidence is saved separately above.
        const guard=api.state().ents.find(e=>e.c==='sanctum_guard'&&Math.hypot(e.x-x,e.z-z)<.05);
        if(!guard)throw new Error('No authoritative Warden state at capture point');
        const angle=guard.halo.yaw+azimuth;
        camera.position.set(found.x+1.9*Math.sin(angle),found.y+1.35,found.z+1.9*Math.cos(angle));
        camera.lookAt(found.x,found.y+.95,found.z);
        camera.updateMatrixWorld(true);
        const expected=found.clone().add(camera.up.clone().multiplyScalar(1));
        const ndc=expected.project(camera);
        if(!Number.isFinite(ndc.x+ndc.y+ndc.z)||
          Math.abs(ndc.x)>.35||Math.abs(ndc.y)>.35||ndc.z>1||ndc.z< -1)
          throw new Error('Warden is outside the inspection-camera centre');
        // The parent is the live entity holder, not a duplicate art model.
        let parent=scene.getObjectByName('halo_construct:guard');
        // Resolve *this* guard rather than Three's first same-name match.
        scene.traverse(o=>{if(o.name==='halo_construct:guard'&&Math.hypot(o.getWorldPosition(camera.position.clone()).x-x,o.getWorldPosition(camera.position.clone()).z-z)<.5)parent=o;});
        if(!parent)throw new Error('No live guard render group');
        for(let node=parent;node&&node!==scene;node=node.parent)node.visible=true;
        renderer.render(scene,camera);
      },{x:def.x,z:def.z,azimuth});
      await page.screenshot({ path: `${OUT}/${def.key}-${view}.png` });
    }
    if (!SOFTWARE_GL) await page.evaluate(()=>window.__attune.pause(false));
    report.guards.push({ key: def.key, x: def.x, z: def.z, yaw: def.yaw, drawnYaw: mine.halo.yaw, outwardCos: outward, variant: mine.halo.variant, primary: mine.halo.primary, meshes: mine.halo.meshes, presentation: mine.halo.presentation, fit: mine.halo.fit, anim: mine.anim });
    // Follow a whole ten-second guard-watch loop in the actual running scene,
    // not a bind-pose frame. Render stays paused under SwiftShader between
    // captures, while animation, WebSocket and authenticated state remain live.
    // Bone-centre distances are *clearance proxies*, not mesh-penetration proof.
    for(let sampleIndex=1;sampleIndex<=4;sampleIndex++){
      await page.waitForTimeout(2500);
      const sample=await page.evaluate(({x,z})=>{
        const api=window.__attune,st=api.state();
        const guard=st.ents.find(e=>e.c==='sanctum_guard'&&Math.hypot(e.x-x,e.z-z)<.05);
        if(!guard)throw Error('Guard left the authoritative sampled position');
        let inst=null,nearest=Infinity;
        api.gfx.scene.traverse(node=>{
          if(node.name!=='halo_construct:guard')return;
          const p=node.getWorldPosition(node.position.clone());
          const distance=Math.hypot(p.x-x,p.z-z);
          if(distance<nearest){nearest=distance;inst=node;}
        });
        if(!inst||nearest>.5)throw Error('Cannot find skinned guard rig for watch assessment');
        const names=['upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l'];
        const bones=names.map(n=>inst.getObjectByName(n));
        if(bones.some(n=>!n))throw Error('Guard watch rig missing arm joint');
        const world=node=>node.getWorldPosition(inst.position.clone());
        const coords=bones.map(n=>world(n));
        const chest=coords[0].clone().add(coords[3]).multiplyScalar(.5);
        return {primary:guard.halo.primary,presentation:guard.halo.presentation,
          base:guard.anim?.base,fit:guard.halo.fit,
          elbowToShoulder: [coords[1].distanceTo(coords[0]),coords[4].distanceTo(coords[3])],
          elbowToChest: [coords[1].distanceTo(chest),coords[4].distanceTo(chest)],
          wristToChest: [coords[2].distanceTo(chest),coords[5].distanceTo(chest)]};
      },{x:def.x,z:def.z});
      assert.equal(sample.base,'Guard_Watch_Loop',def.key+' must use authored watch clip');
      assert.equal(sample.presentation,expectedPrimary,def.key+' must not lose its equipped weapon during animation');
      assert.equal(sample.fit?.failures,0,def.key+' must not lose a grip mid-watch');
      if(expectedPrimary==='rifle'){
        assert.ok(sample.fit?.gripError<.035&&sample.fit?.supportError<.035,
          def.key+' must preserve both real hand contacts throughout the watch');
        assert.ok(sample.fit?.wristAppliedDeg?.every(v=>Number.isFinite(v)&&v<=16.05),
          def.key+' must not snap either wrist past the bounded pose correction');
      }
      assert.ok([...sample.elbowToShoulder,...sample.elbowToChest,...sample.wristToChest].every(Number.isFinite),
        def.key+' must retain a valid posed skeleton');
      report.watchSamples.push({key:def.key,seconds:sampleIndex*2.5,...sample});
      if(sampleIndex===2||sampleIndex===4){
        const count=await page.evaluate(software=>{
          const n=window.__attune.state().drawn;
          if(software)window.__attune.pause(false);
          return n;
        },SOFTWARE_GL);
        await page.waitForFunction(n=>window.__attune.state().drawn>n,count);
        if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
        await page.screenshot({path:`${OUT}/${def.key}-watch-${sampleIndex*2.5}s.png`});
      }
    }
  }

  // A successful final grip state does not excuse a rifle vanishing at an
  // earlier sampled animation frame. Verify real browser history and warnings.
  assert.deepEqual(report.consoleWarnings.filter(m=>m.includes('[wardens] rifle grips cannot reach')),[],
    'no Warden may temporarily lose the weapon during the watch loop');
  for(const def of SANCTUM_GUARDS){
    const g=report.guards.find(g=>g.key===def.key);
    assert.equal(g?.fit?.failures,0,`${def.key} reported a transient primary-weapon pose failure`);
  }
  // independent animation state per warden
  const animTimes = report.guards.map((g) => JSON.stringify(g.anim));
  assert.equal(new Set(report.guards.map((g) => g.variant)).size, 4, 'four distinct warden variants');
  assert.deepEqual(report.guards.map(g=>g.primary),['rifle','combat-rod','rifle','combat-rod'],
    'the four Warden posts alternate rifle and energized combat rod in world order');

  // --- overview: all four from above the Sanctum
  await teleport(0, 7.5);
  await page.evaluate(() => window.__attune.view({ yaw: Math.PI, pitch: 1.05, dist: 30 }));
  let d0 = await page.evaluate(software => {
    const n=window.__attune.state().drawn;
    if (software) window.__attune.pause(false);
    return n;
  },SOFTWARE_GL);
  await page.waitForFunction((n) => window.__attune.state().drawn > n, d0);
  if (SOFTWARE_GL) await page.evaluate(()=>window.__attune.pause(true));
  await page.screenshot({ path: `${OUT}/overview.png` });
  const st = await page.evaluate(() => { const s = window.__attune.state(); return { draw: s.draw, halo: s.ents.filter((e) => e.halo).map((e) => ({ c: e.c, role: e.halo.role, inView: e.inView })) }; });
  report.perf.overview = st.draw;
  report.overviewHalo = st.halo;

  // --- the vendor: Halo Construct with the sash, at the established quartermaster position
  const qm = server.game.objects.find((o) => o.type === 'quartermaster');
  await teleport(qm.x, qm.z + 2.2);
  const vendor = await (await page.waitForFunction(() => window.__attune.state().ents.find((e) => e.c === 'quartermaster' && e.halo) || null)).jsonValue();
  assert.equal(vendor.model, 'glb');
  assert.equal(vendor.halo.role, 'vendor');
  assert.ok(vendor.halo.meshes.includes('vendor') && vendor.halo.meshes.includes('ring_vertical_paint') && vendor.halo.meshes.includes('body_paint'));
  assert.ok(Math.hypot(vendor.x - qm.x, vendor.z - qm.z) < 0.05, 'vendor at the established quartermaster position');
  await page.evaluate(() => window.__attune.view({ yaw: Math.PI, pitch: 0.16, dist: 4.2, face: Math.PI }));
  d0 = await page.evaluate(software => {
    const n=window.__attune.state().drawn;
    if (software) window.__attune.pause(false);
    return n;
  },SOFTWARE_GL);
  await page.waitForFunction((n) => window.__attune.state().drawn > n, d0);
  if (SOFTWARE_GL) await page.evaluate(()=>window.__attune.pause(true));
  await page.screenshot({ path: `${OUT}/vendor-at-post.png` });
  report.vendor = { x: vendor.x, z: vendor.z, meshes: vendor.halo.meshes, anim: vendor.anim };
  report.perf.vendor = (await page.evaluate(() => window.__attune.state().draw));
  report.assets = await page.evaluate(() => window.__attune.state().assets);
  // Desktop and large-TV presentation: the live scene, renderer and HUD, not
  // an offline render. Record CPU render submission and draw counters. Hosted
  // SwiftShader is NOT an integrated GPU benchmark; 4K checks UI at native
  // viewport with 0.5 pixel ratio to avoid an artificial 8MP software load.
  const desktopAndTv=[
    {name:'desktop-1280x800',width:1280,height:800,ratio:1},
    {name:'desktop-1920x1080',width:1920,height:1080,ratio:1},
    {name:'desktop-2560x1440',width:2560,height:1440,ratio:SOFTWARE_GL?.75:1},
    {name:'tv-3840x2160-layout',width:3840,height:2160,ratio:SOFTWARE_GL?.5:1},
  ];
  report.perf.viewportSamples=[];
  for(const settings of desktopAndTv){
    await page.setViewportSize({width:settings.width,height:settings.height});
    // Allow the real resize handler to update the camera and HUD first.
    await page.waitForTimeout(150);
    const frame=await page.evaluate(({ratio})=>{
      const api=window.__attune,{renderer,scene,camera}=api.gfx;
      api.pause(true);
      renderer.setPixelRatio(ratio);
      renderer.setSize(window.innerWidth,window.innerHeight,false);
      const t=performance.now();
      renderer.render(scene,camera);
      const cpuRenderMs=performance.now()-t;
      const state=api.state();
      return {cpuRenderMs,draw:state.draw,frameMs:state.frameMs,
        backingWidth:renderer.domElement.width,backingHeight:renderer.domElement.height,
        pixelRatio:renderer.getPixelRatio(),rendererKind:state.renderDiagnostics};
    },settings);
    report.perf.viewportSamples.push({...settings,...frame,
      graphics:report.graphics?.renderer,metric:'single CPU render wall time, not GPU frame time'});
    await page.screenshot({path:`${OUT}/viewport-${settings.name}.png`,timeout:120000});
  }
  assert.deepEqual(report.pageErrors, [], 'no page errors');
  report.ok = true;
} catch (err) {
  report.error = String(err.stack || err);
  console.error(err);
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await browser?.close();
  await server.close?.();
  process.exit(report.ok ? 0 : 1);
}
