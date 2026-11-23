// P07 integration: exercise the real Foundry -> Null Annex -> Gate route,
// render all three Annex rooms, and capture proof. Fixture positioning and
// prior boss-credit setup are explicit; they are not a claim of earned progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL, describeGraphics } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';
import { ANNEX_ROOMS } from '../../client/src/annex-interior.js';
import { RIFT_ANNEX, inRiftAnnex } from '../../shared/world.js';

const server = await startServer({ port: 0, dataFile: null });
let browser;
try {
  fs.mkdirSync('annex-evidence', { recursive: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:' + server.port + '/?q=1&qlock=1&nolock=1' + (SOFTWARE_GL ? '&rfps=1' : ''));
  await page.click('#gate-guest-link');
  await page.fill('#name', 'Annex Tester');
  await page.click('.classcard[data-cls="vanguard"]');
  await page.click('#enter');
  await page.waitForFunction(() => {
    const s = window.__attune?.state();
    return s?.myId && s.sheet?.name === 'Annex Tester' && s.drawn >= 2;
  });
  let player = await liveFixturePlayer(page, server, 'Annex Tester');

  const breach = server.game.objects.find((o) => o.type === 'null_breach');
  assert.ok(breach, 'real Foundry Null Breach exists');
  // Explicit server-side fixture: the full Foundry boss progression is covered
  // elsewhere. All F interactions still pass the real authoritative handlers.
  player.char.level = 15;
  player.char.foundryProgress = 3;
  server.game.refreshStats(player);
  server.game.transferPlayer(player, { x: breach.x, z: breach.z + 3.8 });
  await page.waitForFunction(({ x, z }) => {
    const s = window.__attune.state();
    return s.you?.region === 'silent_foundry' && Math.hypot(s.you.x - x, s.you.z - z) < 0.8;
  }, { x: breach.x, z: breach.z + 3.8 }, { polling: 100 });
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'phase_annex', null,
    { timeout: 30000, polling: 100 });
  assert.ok(inRiftAnnex(player.x, player.z), 'authoritative crossing places character inside Annex');
  const arrivalView = await page.evaluate(() => window.__attune.state());
  assert.ok(Math.abs(arrivalView.camYaw - (Math.PI - .68)) < .12,
    'Annex entry must frame away from the return-portal obstruction');
  assert.ok(arrivalView.camWant <= 6.75, 'Annex entry uses a bounded initial camera distance');
  const spawned = server.game.enemies.filter((e) => e.annexEncounter);
  assert.equal(spawned.length, 11, 'Annex has its live enemy and boss roster');
  assert.ok(spawned.some((e) => e.type === 'warden'), 'Null Chamber boss is present');
  await page.waitForFunction(() => {
    const scene = window.__attune.gfx.scene;
    const interior = scene.getObjectByName('annex:enclosed-chambers');
    const portal = scene.getObjectByName('rift:annex-return');
    return interior?.visible && portal?.getObjectByName('rift:foundation')
      && portal?.getObjectByName('rift:interference-membrane');
  }, null, { timeout: 90000, polling: 250 });

  const architecture = await page.evaluate(() => {
    const scene = window.__attune.gfx.scene;
    const root = scene.getObjectByName('annex:enclosed-chambers');
    const portal = scene.getObjectByName('rift:annex-return');
    const rooms = [];
    root.traverse((n) => { if (n.name.startsWith('annex:room:')) rooms.push(n.name); });
    return {
      rooms, roofs: [0, 1, 2].map((i) => !!root.getObjectByName('annex:roof:' + i)),
      upperPartitions: root.children.filter((n) => n.name === 'annex:upper-partition').length,
      hasReturnFoundation: !!portal.getObjectByName('rift:foundation'),
      fallbackHidden: portal.getObjectByName('rift:fallback-frame')?.visible === false,
      stableMembrane: portal.getObjectByName('rift:interference-membrane')?.material.uniforms.uStable.value === 1,
      falseExteriorWarning: !!portal.getObjectByName('rift:persistent-warning'),
      hasNullCache: !!scene.getObjectByName('annex:null-recovery-cache'),
      instrumentDetail: !!root.getObjectByName('annex:architectural-detail'),
      surveyArray: !!root.getObjectByName('annex:arrival-survey-rails'),
      relayBus: !!root.getObjectByName('annex:relay-live-busbars'),
      nullOculus: !!root.getObjectByName('annex:null-oculus-sensor'),
      sealedNullRacks: !!root.getObjectByName('annex:null-containment-busbar'),
      falseNullWallPortals: !!root.getObjectByName('annex:null-containment-arc'),
    };
  });
  assert.equal(architecture.rooms.length, 3);
  assert.ok(architecture.roofs.every(Boolean));
  assert.equal(architecture.upperPartitions, 2,
    'each adjoining chamber must have an enclosed upper wall, not an open ceiling');
  assert.equal(architecture.hasReturnFoundation, true);
  assert.equal(architecture.fallbackHidden, true);
  assert.equal(architecture.stableMembrane, true);
  assert.equal(architecture.falseExteriorWarning, false);
  assert.equal(architecture.hasNullCache, true);
  assert.equal(architecture.sealedNullRacks,true,'Null Chamber containment is instrumented');
  assert.equal(architecture.falseNullWallPortals,false,'non-interactive Null wall rings must not resemble travel portals');
  assert.ok(architecture.instrumentDetail && architecture.surveyArray
    && architecture.relayBus && architecture.nullOculus,
    'the distinct three-chamber instruments must actually load in the playable scene');

  // After verifying actual spawn, suppress encounter AI for repeatable camera
  // evidence and an unimpeded, out-of-combat *real* F return. No production
  // enemy behavior is changed, and the test does not claim to defeat them.
  for (const enemy of spawned) {
    enemy.state = 'dead'; enemy.deadAt = -1e9; enemy.respawnAt = Infinity;
    enemy.threat.clear();
  }
  for (const [i, room] of ANNEX_ROOMS.entries()) {
    player = await liveFixturePlayer(page, server, 'Annex Tester');
    server.game.transferPlayer(player, { x: RIFT_ANNEX.x, z: room.center });
    await page.evaluate(() => window.__attune.view({ yaw: Math.PI - .62, pitch: .20, dist: 6, face: Math.PI }));
    const previous = await page.evaluate(() => window.__attune.state().drawn);
    await page.waitForFunction(({ z, count }) => {
      const s = window.__attune.state();
      return Math.abs(s.you?.z - z) < 0.8 && s.drawn > count
        && window.__attune.gfx.scene.getObjectByName('annex:enclosed-chambers')?.visible;
    }, { z: room.center, count: previous }, { timeout: 90000, polling: 250 });
    await page.screenshot({ path: 'annex-evidence/0' + (i + 1) + '-' + room.name.toLowerCase().replaceAll(' ', '-') + '-1280x800.png' });
  }
  // Large-display evidence from the arrival end of the same chamber route.
  player = await liveFixturePlayer(page, server, 'Annex Tester');
  server.game.transferPlayer(player, { x: RIFT_ANNEX.x, z: RIFT_ANNEX.arrivalZ });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.__attune.view({ yaw: Math.PI - .62, pitch: .20, dist: 6, face: Math.PI }));
  const before = await page.evaluate(() => window.__attune.state().drawn);
  await page.waitForFunction((count) => {
    const s = window.__attune.state();
    return s.you?.region === 'phase_annex' && s.drawn > count
      && Math.abs(s.you.z - 27) < 0.8;
  }, before, { timeout: 90000, polling: 250 });
  const largeScreenshot = await page.screenshot({ path: 'annex-evidence/04-arrival-and-return-1920x1080.png' });
  const imageStats = await sharp(largeScreenshot)
    .extract({ left: 384, top: 230, width: 1152, height: 600 }).stats();
  const sceneContrast = imageStats.channels.slice(0, 3)
    .reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  assert.ok(sceneContrast > 12,
    '1920x1080 camera must show readable chamber detail, not an opaque wall (contrast ' + sceneContrast + ')');
  const viewInside = await page.evaluate(() => {
    const camera = window.__attune.gfx.camera.position;
    return { x: camera.x, z: camera.z };
  });
  assert.ok(Math.abs(viewInside.x - RIFT_ANNEX.x) < RIFT_ANNEX.hw - .3
    && Math.abs(viewInside.z - RIFT_ANNEX.z) < RIFT_ANNEX.hd - .3,
    '1920x1080 capture camera must remain inside enclosed chamber');
  player.combatUntil = 0;
  player.autoOn = false;
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null,
    { timeout: 30000, polling: 100 });
  assert.equal(inRiftAnnex(player.x, player.z), false, 'real F return exits Annex');
  assert.deepEqual(errors, [], 'browser rendering errors');
  console.log('P07_ANNEX ' + JSON.stringify({ architecture, graphics: await describeGraphics(page),
    baseline: 'live Foundry breach + real F return; room positions were staged fixtures' }));
} finally {
  await browser?.close();
  await server.close();
}
