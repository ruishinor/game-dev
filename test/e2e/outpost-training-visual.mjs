// Real-browser range/armory captures: two resolutions, day/night, two
// viewpoints per subject; actual server-owned F-key calibration. Hardware
// GPU timings are marked unavailable when the WebGL extension is absent.
// Node: node test/e2e/outpost-training-visual.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../../server/index.js';
import { launchBrowser, describeGraphics, SOFTWARE_GL } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';
import { OUTPOST_TRAINING as R, EXPEDITION_OUTPOST as OP, pocketHeight } from '../../shared/severance-gate.js';
import { hasLineOfSight, resolveCollisions, PLAYER_RADIUS, inSafeZone } from '../../shared/world.js';
import { RANGE_SHOTS } from '../../server/sim/outpost-training.js';

const outDir = path.resolve('outpost-range-evidence');
await fs.mkdir(outDir, { recursive: true });
const result = { protocol: 'server-authenticated guest + fixed camera captures', head: process.env.GITHUB_SHA || null,
  graphics: null, captures: [], interaction: null, failures: [] };
const write = async () => fs.writeFile(path.join(outDir, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
let srv, browser;
const errors = [];
try {
  const origin = { x: R.line.x - .7, z: R.line.z };
  assert.ok(inSafeZone(origin), 'firing line must be protected camp');
  for (const lane of R.lanes)
    assert.ok(hasLineOfSight(origin, lane), 'line-of-sight obstruction at ' + lane.key);
  const beyond = { x: R.backstop.x + 1.6, z: R.backstop.z };
  assert.equal(hasLineOfSight(origin, beyond), false, 'backstop must actually stop traces');
  const blocked = { x: R.backstop.x, z: R.backstop.z, jy: 0, vy: 0 };
  resolveCollisions(blocked, PLAYER_RADIUS);
  assert.ok(Math.abs(blocked.x - R.backstop.x) > R.backstop.hw ||
    Math.abs(blocked.z - R.backstop.z) > R.backstop.hd, 'solid backstop ejects overlapping player');

  srv = await startServer({ port: 0, dataFile: null });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('http://127.0.0.1:' + srv.port + '/?q=2&qlock=1&nolock=1' + (SOFTWARE_GL ? '&rfps=1' : ''));
  await page.waitForFunction(() => !!window.__attune);
  await page.click('#gate-guest-link');
  await page.fill('#name', 'Range Geometry Inspector');
  await page.click('.classcard[data-cls="vanguard"]');
  await page.click('#enter');
  await page.waitForFunction(() => {
    const s = window.__attune?.state();
    return s?.myId && s.sheet && s.drawn >= 2 && s.snaps > 0;
  });
  const p = await liveFixturePlayer(page, srv, 'Range Geometry Inspector');
  const consoleObj = srv.game.objects.find(o => o.type === 'outpost_range_console');
  assert.ok(consoleObj, 'production world has a range console');
  p.hp = p.maxHp;
  p.x = consoleObj.x; p.z = consoleObj.z;
  srv.game.markDirty(p);
  await page.waitForFunction(([x,z]) => {
    const a = window.__attune?.state().pos;
    return a && Math.hypot(a.x-x,a.z-z)<1;
  }, [p.x,p.z]);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'outpost_range_console'));
  const field = page.locator('#view');
  await field.focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !!window.__attune.state().sheet && !!document.querySelector('#view'));
  // The authoritative session is intentionally ephemeral, not a saved skill,
  // and has no economic outputs; verify it from the isolated server fixture.
  for (let i=0; i<100 && !p.outpostTraining?.active; i++) await page.waitForTimeout(100);
  assert.equal(p.outpostTraining?.active, true, 'real F-key started server calibration');
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__attune.state().sheet?.activeWeapon === 'ranged');
  p.x = origin.x; p.z = origin.z; srv.game.markDirty(p);
  await page.waitForFunction(([x,z]) => {
    const a = window.__attune.state().pos;
    return a && Math.hypot(a.x-x,a.z-z)<1;
  }, [origin.x,origin.z]);
  const before = { xp:p.char.xp, credits:p.char.credits, items:[...p.char.inventory] };
  for (let n=0; n<RANGE_SHOTS; n++) {
    await field.focus();
    await page.keyboard.press('KeyF');
    for (let poll=0; poll<100 && (p.outpostTraining?.shots||0)<n+1; poll++) await page.waitForTimeout(100);
    assert.equal(p.outpostTraining?.shots, n+1, 'real input records only one shot, #'+(n+1));
    if (n < RANGE_SHOTS-1) await page.waitForTimeout(750);
  }
  assert.equal(p.outpostTraining?.shots, RANGE_SHOTS, 'five authenticated F interactions registered');
  assert.equal(p.outpostTraining?.active, false, 'session completed server-side');
  assert.deepEqual({ xp:p.char.xp, credits:p.char.credits, items:p.char.inventory }, before,
    'range must not modify account progression or inventory');
  result.interaction = { registeredShots: p.outpostTraining.shots,
    hits: p.outpostTraining.hits, score: p.outpostTraining.score, rewards: 0 };
  result.graphics = await describeGraphics(page);

  await page.waitForFunction(() => {
    const a=window.__attune;
    return !!a?.gfx.scene.getObjectByName('severance-outpost:training');
  });
  // Armory live GLBs must load; a silent fallback is not acceptable evidence.
  await page.waitForFunction(() => {
    const a = window.__attune;
    return ['field-pattern','tuned-pattern','dense-pattern','longpoint'].every(
      name => !!a?.gfx.scene.getObjectByName('outpost-training:weapon-'+name));
  }, null, { timeout: 90000 });
  await page.evaluate(() => { window.__attune.pause(true); window.__attune.severanceClock(true); });

  const pose=(id,ex,ez,eh,tx,tz,th)=>({
    id, eye:[ex,pocketHeight(ex,ez)+eh,ez], target:[tx,pocketHeight(tx,tz)+th,tz],
  });
  const subjects = [
    pose('range-front', R.line.x-1.85, R.line.z-.5, 2.6, R.lanes[0].x, (R.lanes[0].z+R.lanes[1].z)/2, 1.3),
    pose('range-side', R.line.x+.4, R.line.z+4.2, 2.7, R.lanes[0].x,R.line.z,1.2),
    pose('armory-front', R.armory.x,R.armory.z-3.2, 2.0, R.armory.x,R.armory.z-.2,1.3),
    pose('weapon-side', R.armory.x-1.6,R.armory.z-1.95,1.8,R.armory.x,R.armory.z-.3,1.3),
  ];
  // Photographed with the game's actual lighting/materials and actual asset
  // geometry; only camera placement is synthetic for repeatable art review.
  for (const view of [{key:'desktop',width:1280,height:800},{key:'tv',width:1920,height:1080}]) {
    await page.setViewportSize({ width:view.width, height:view.height });
    for (const tod of ['day','night']) {
      await page.evaluate(key => window.__attune.timeOfDay({key}), tod);
      await page.evaluate(() => window.__attune.severanceStep(0.05, false));
      for (const subject of subjects) {
        const evidence = await page.evaluate(({eye,target}) => {
          const a = window.__attune, { renderer, camera, scene } = a.gfx;
          const training = scene.getObjectByName('severance-outpost:training');
          if (!training) throw Error('Training scene disappeared');
          camera.position.set(...eye);
          camera.lookAt(...target);
          camera.updateMatrixWorld(true);
          renderer.info.reset();
          const t0=performance.now();
          renderer.render(scene,camera);
          const frameMs=performance.now()-t0;
          const full={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
            geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};
          // Repeat same frame without station to isolate incremental scene cost;
          // a synthetic ablation, not a second visual acceptance capture.
          training.visible=false;
          try {
            renderer.info.reset();
            renderer.render(scene,camera);
          } finally { training.visible=true; }
          const baseline={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
          renderer.info.reset(); renderer.render(scene,camera);
          const gl=renderer.getContext();
          return { frameMs, full, baseline,
            stationContribution:{calls:full.calls-baseline.calls,triangles:full.triangles-baseline.triangles},
            renderer:gl.getParameter(gl.RENDERER), gpuTimerAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
        }, subject);
        const name=view.key+'-'+tod+'-'+subject.id+'.png';
        await page.screenshot({path:path.join(outDir,name),timeout:120000});
        result.captures.push({file:name,resolution:[view.width,view.height],timeOfDay:tod,
          viewpoint:subject.id,...evidence});
      }
    }
  }
  assert.equal(result.captures.length,16);
  assert.ok(result.captures.every(x => x.full.calls > 0 && x.full.triangles > 0),
    'screenshots must represent rendered geometry');
  assert.ok(result.captures.some(x => x.stationContribution.calls > 0),
    'range and armory must materially contribute draw calls');
  assert.deepEqual(errors, [], 'no page errors in the live range validation');
} catch (error) {
  result.failures.push(String(error?.stack||error));
  throw error;
} finally {
  await write();
  await browser?.close().catch(()=>{});
  await srv?.close().catch(()=>{});
}
console.log('OUTPOST_RANGE_VISUAL_EVIDENCE:',JSON.stringify({captureCount:result.captures.length,
  graphics:result.graphics,interaction:result.interaction,failures:result.failures}));
