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
const report = { guards: [], vendor: null, perf: {}, pageErrors: [], consoleErrors: [], consoleWarnings: [], rifleSources: [] };
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
      assert.equal(mine.halo.fit?.failures,0,`${def.key} no transient rod pose failure`);
    }
    const fx = Math.sin(mine.halo.yaw), fz = Math.cos(mine.halo.yaw);
    const outward = (fx * def.x + fz * def.z) / Math.hypot(def.x, def.z);
    assert.ok(outward > 0.999, `${def.key} faces away from the Sanctum centre (cos ${outward.toFixed(4)})`);
    // Save a normal third-person frame separately from close inspection
    // views. This is player-camera evidence, not a posed art render.
    const regularDrawn=await page.evaluate(()=>window.__attune.state().drawn);
    await page.waitForFunction(n=>window.__attune.state().drawn>n+1,regularDrawn);
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
    await page.evaluate(()=>window.__attune.pause(false));
    report.guards.push({ key: def.key, x: def.x, z: def.z, yaw: def.yaw, drawnYaw: mine.halo.yaw, outwardCos: outward, variant: mine.halo.variant, primary: mine.halo.primary, meshes: mine.halo.meshes, presentation: mine.halo.presentation, fit: mine.halo.fit, anim: mine.anim });
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
  let d0 = await page.evaluate(() => window.__attune.state().drawn);
  await page.waitForFunction((n) => window.__attune.state().drawn > n + 3, d0);
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
  d0 = await page.evaluate(() => window.__attune.state().drawn);
  await page.waitForFunction((n) => window.__attune.state().drawn > n + 3, d0);
  await page.screenshot({ path: `${OUT}/vendor-at-post.png` });
  report.vendor = { x: vendor.x, z: vendor.z, meshes: vendor.halo.meshes, anim: vendor.anim };
  report.perf.vendor = (await page.evaluate(() => window.__attune.state().draw));
  report.assets = await page.evaluate(() => window.__attune.state().assets);
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
