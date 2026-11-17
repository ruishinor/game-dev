// Real browser, single client, isolated temporary server. Teleport is setup only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { useAbility } from '../../server/sim/combat.js';
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
  assert.deepEqual(await page.evaluate(() => window.__attune.state().world.prototypeAssets), {survey_tower:'ready',survey_workstation:'ready',survey_engineering:'ready',sinter_colony:'ready'});
  assert.ok(await page.evaluate(() => ['survey_tower','survey_workstation','survey_engineering','sinter_colony'].every(type => {
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
  await moveTo(49, -36.5);
  await capture('preview-evidence/02c-engineering-station.png');
  assert.ok(await page.evaluate(() => window.__attune.gfx.scene.getObjectByName('brineworks-service-deck')?.children.length > 0));
  await moveTo(39, -30);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'survey_signal'));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.survey === 'signal');
  assert.match(await page.locator('.tracker').last().innerText(), /A Signal Below/);
  await page.locator('.field-record').waitFor({state:'visible'});
  await capture('preview-evidence/03-field-evidence.png');
  await moveTo(6.2, -2.6);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'archivist'));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.survey === 'signal_done');
  assert.equal(p.char.quest.step, 0);
  assert.equal(p.char.xp, 35);
  await capture('preview-evidence/04-report.png');
  await moveTo(38,-36.5);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.brineStage === 1);
  await moveTo(49,-36.5);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().you.brineTrial?.ms > 0);
  assert.match(await page.locator('.tracker').last().innerText(),/LIVE TEST/);
  await moveTo(39,-30);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().you.brineTrial?.read === 1);
  await moveTo(47,-30);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.brineStage === 3);
  assert.ok(p.char.inventory.includes('brine_phase_filter'));
  await page.locator('.field-record').waitFor({state:'visible'});
  assert.match(await page.locator('.field-record').innerText(),/SHIFT LEDGER 07/);
  await capture('preview-evidence/06-commissioned.png');
  await moveTo(49,-36.5);
  await page.waitForFunction(()=>window.__attune.state().you.workshop==='brine_engineering');
  await page.getByRole('button',{name:'Open field Workshop [B]',exact:true}).click();
  await page.getByRole('dialog',{name:'Build Planner and Workshop'}).waitFor();
  await page.getByRole('button',{name:'Close Build'}).click();
  await page.locator('#view').focus();
  await moveTo(6, 58);
  await page.evaluate(() => window.__attune.view({yaw:Math.PI,pitch:.25,dist:12,face:0}));
  await page.waitForFunction(() => document.querySelector('.zone-label')?.textContent.includes('Sinter Flats'));
  assert.ok(await page.evaluate(() => !!window.__attune.gfx.scene.getObjectByName('sinter-ridge:743')));
  await capture('preview-evidence/04b-sinter-flats.png');
  assert.deepEqual(errors, []);
  await page.close();
  const fallbackPage = await browser.newPage({viewport:{width:850,height:600}});
  fallbackPage.setDefaultTimeout(90000);
  await fallbackPage.route('**/research_workstation.glb', route => route.abort());
  await fallbackPage.goto(url);
  await fallbackPage.waitForFunction(() => window.__attune?.state().world.prototypeArt === 'fallback');
  assert.deepEqual(await fallbackPage.evaluate(() => window.__attune.state().world.prototypeAssets), {survey_tower:'ready',survey_workstation:'fallback',survey_engineering:'ready',sinter_colony:'ready'});
  assert.ok(await fallbackPage.evaluate(() => {
    const scene = window.__attune.gfx.scene;
    const holder = scene.getObjectByName('prototype-fallback:survey_workstation');
    return holder?.children.length > 0 && !scene.getObjectByName('prototype-art:survey_workstation');
  }));
  await fallbackPage.close();
  const keeper = await browser.newPage({viewport:{width:1000,height:700}});
  keeper.setDefaultTimeout(90000);
  const keeperErrors=[];
  keeper.on('pageerror', e => keeperErrors.push(e.message));
  keeper.on('console', m => { if(m.type()==='error')keeperErrors.push(m.text()); });
  await keeper.goto(url);
  await keeper.fill('#name','Aegis Keeper');
  await keeper.click('.classcard[data-cls="keeper"]');
  await keeper.click('#enter');
  await keeper.waitForFunction(() => {
    const s=window.__attune?.state();
    return s?.myId && s.sheet?.look==='aegis_keeper' && s.ents.some(e=>e.id===s.myId && e.model==='glb') && s.drawn>=2;
  });
  const tank=[...server.game.players.values()].find(x=>x.name==='Aegis Keeper');
  assert.ok(tank);
  assert.ok(await keeper.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('aegis-projector')));
  assert.equal(tank.cls,'keeper');
  assert.equal(tank.companion,null);
  assert.equal(await keeper.getByRole('button',{name:'Rending Arc',exact:true}).count(),0);
  tank.res=100;
  // Fixture invokes the actual authoritative ability; extend only for slow screenshot capture.
  assert.ok(useAbility(server.game,tank,'hinge_field').ok);
  const shield=tank.buffs.find(b=>b.k==='shield');
  assert.ok(shield && shield.v>0);
  shield.until=server.game.time+60000;
  await keeper.waitForFunction(()=>{
    const s=window.__attune.state();
    const g=window.__attune.gfx.scene.getObjectByName('live-aegis:'+s.myId);
    return g?.children.some(m=>m.visible&&m.material.isShaderMaterial);
  });
  await keeper.evaluate(()=>window.__attune.view({yaw:0,pitch:.2,dist:6,face:Math.PI}));
  const drawn=await keeper.evaluate(()=>window.__attune.state().drawn);
  await keeper.waitForFunction(n=>window.__attune.state().drawn>n,drawn);
  await keeper.screenshot({path:'preview-evidence/05-aegis-keeper.png'});
  tank.buffs=tank.buffs.filter(b=>b.k!=='shield');
  await keeper.waitForFunction(()=>!window.__attune.gfx.scene.getObjectByName('live-aegis:'+window.__attune.state().myId));
  assert.deepEqual(keeperErrors,[]);
  await keeper.close();
  console.log('PASS integrated Surveyor, Brineworks commissioning, Sinter Flats, Aegis Keeper and independent asset fallbacks');
} finally { await browser?.close(); await server.close(); }
