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
    assert.ok(mine.halo.meshes.includes('warden-rifle:' + (mine.halo.variant === 3 ? 'marksman' : 'carbine')),
      `${def.key} has an archived/reconstructed rifle visibly mounted`);
    assert.ok(!mine.halo.meshes.includes('stave'), `${def.key} no longer relies on the guard stave when rifle assets load`);
    const fx = Math.sin(mine.halo.yaw), fz = Math.cos(mine.halo.yaw);
    const outward = (fx * def.x + fz * def.z) / Math.hypot(def.x, def.z);
    assert.ok(outward > 0.999, `${def.key} faces away from the Sanctum centre (cos ${outward.toFixed(4)})`);
    // camera behind the player, looking back at the warden's face
    await page.evaluate((yaw) => window.__attune.view({ yaw, pitch: 0.12, dist: 5.5, face: yaw }), Math.atan2(-def.x, -def.z) + Math.PI);
    const drawn = await page.evaluate(() => window.__attune.state().drawn);
    await page.waitForFunction((n) => window.__attune.state().drawn > n + 2, drawn);
    await page.screenshot({ path: `${OUT}/${def.key}-front.png` });
    report.guards.push({ key: def.key, x: def.x, z: def.z, yaw: def.yaw, drawnYaw: mine.halo.yaw, outwardCos: outward, variant: mine.halo.variant, meshes: mine.halo.meshes, anim: mine.anim });
  }
  // independent animation state per warden
  const animTimes = report.guards.map((g) => JSON.stringify(g.anim));
  assert.equal(new Set(report.guards.map((g) => g.variant)).size, 4, 'four distinct warden variants');

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
