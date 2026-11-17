// Real browser, single client, isolated temporary server. Teleport is setup only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL } from '../../tools/browser.mjs';

const server = await startServer({ port: 0, dataFile: null });
let browser;
try {
  fs.mkdirSync('preview-evidence', { recursive: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  const url = 'http://127.0.0.1:' + server.port + '/?q=1&qlock=1&nolock=1' + (SOFTWARE_GL ? '&rfps=1' : '');
  await page.goto(url);
  await page.fill('#name', 'Brine Tester');
  await page.click('.classcard[data-cls="surveyor"]');
  await page.click('#enter');
  await page.waitForFunction(() => {
    const s = window.__attune?.state();
    return s?.myId && s.sheet?.cls === 'surveyor' && s.sheet.look === 'brine_surveyor' && s.drawn >= 2 && s.ents.some(e => e.id === s.myId && e.model === 'glb');
  });
  await page.waitForFunction(() => window.__attune.state().world.prototypeArt === 'ready');
  assert.deepEqual(await page.evaluate(() => window.__attune.state().world.prototypeAssets), {survey_tower:'ready',survey_workstation:'ready'});
  assert.ok(await page.evaluate(() => ['survey_tower','survey_workstation'].every(type => {
    const group = window.__attune.gfx.scene.getObjectByName('prototype-art:'+type);
    let meshes = 0; group?.traverse(node => { if (node.isMesh) meshes++; });
    return meshes > 0;
  })));
  await page.screenshot({ path: 'preview-evidence/01-surveyor.png' });
  const p = [...server.game.players.values()].find(x => x.name === 'Brine Tester');
  assert.ok(p);
  assert.equal(p.cls, 'surveyor');
  assert.equal(p.companion, null);
  assert.equal(await page.getByRole('button', { name: 'Fault Scan', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Mending Graft', exact: true }).count(), 0);
  async function moveTo(x, z) {
    p.x = x; p.z = z;
    if (p.companion) { p.companion.x = x+1.5; p.companion.z = z-1.5; }
    await page.waitForFunction(([x,z]) => {
      const pos = window.__attune.state().pos;
      return pos && Math.hypot(pos.x-x,pos.z-z) < 1.5;
    }, [x,z]);
  }
  async function capture(path) {
    const drawn = await page.evaluate(() => window.__attune.state().drawn);
    await page.waitForFunction(n => window.__attune.state().drawn > n, drawn);
    await page.screenshot({ path });
  }
  await moveTo(43, -27);
  await page.evaluate(() => window.__attune.view({yaw: 0, pitch: 0.25, dist: 12, face: Math.PI}));
  await page.waitForFunction(() => document.querySelector('.zone-label')?.textContent.includes('Brineworks Cut'));
  await capture('preview-evidence/02-brineworks.png');
  await page.getByRole('button', { name: 'Field Rig', exact: true }).click();
  await page.waitForFunction(() => window.__attune.state().you.surveyKit.rigMs > 0 && window.__attune.state().ents.some(e => e.row.rig));
  await capture('preview-evidence/02b-field-rig.png');
  await page.waitForFunction(() => window.__attune.state().you.gcd === 0);
  await page.getByRole('button', { name: 'Controlled Blast', exact: true }).click();
  await page.waitForFunction(() => window.__attune.state().you.surveyKit.rigMs === 0);
  assert.equal(p.surveyKit.rig, null);
  await page.locator('#view').focus();
  await moveTo(38, -36.5);
  await page.evaluate(() => window.__attune.view({yaw:0,pitch:0.25,dist:7,face:Math.PI}));
  await capture('preview-evidence/02b-research-station.png');
  await moveTo(39, -30);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'survey_signal'));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.survey === 'signal');
  assert.match(await page.locator('.tracker').last().innerText(), /A Signal Below/);
  await capture('preview-evidence/03-field-evidence.png');
  await moveTo(6.2, -2.6);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'archivist'));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.survey === 'signal_done');
  assert.equal(p.char.quest.step, 0);
  assert.equal(p.char.xp, 35);
  await capture('preview-evidence/04-report.png');
  assert.deepEqual(errors, []);
  await page.close();
  const fallbackPage = await browser.newPage({viewport:{width:850,height:600}});
  fallbackPage.setDefaultTimeout(90000);
  await fallbackPage.route('**/research_workstation.glb', route => route.abort());
  await fallbackPage.goto(url);
  await fallbackPage.waitForFunction(() => window.__attune?.state().world.prototypeArt === 'fallback');
  assert.deepEqual(await fallbackPage.evaluate(() => window.__attune.state().world.prototypeAssets), {survey_tower:'ready',survey_workstation:'fallback'});
  assert.ok(await fallbackPage.evaluate(() => {
    const scene = window.__attune.gfx.scene;
    const holder = scene.getObjectByName('prototype-fallback:survey_workstation');
    return holder?.children.length > 0 && !scene.getObjectByName('prototype-art:survey_workstation');
  }));
  await fallbackPage.close();
  console.log('PASS distinct Surveyor class, no symbiote, live field rig/remote blast, GLB tower and research station, independent missing-model fallback, Brineworks evidence/report');
} finally { await browser?.close(); await server.close(); }
