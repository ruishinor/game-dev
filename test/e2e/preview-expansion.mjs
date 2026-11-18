// Real browser, single client, isolated temporary server. Teleport is setup only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { useAbility, dealDamage } from '../../server/sim/combat.js';
import { resetEnemy } from '../../server/sim/ai.js';
import { launchBrowser, SOFTWARE_GL } from '../../tools/browser.mjs';

const server = await startServer({ port: 0, dataFile: null });
let browser;
try {
  fs.mkdirSync('preview-evidence', { recursive: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
  // Hosted Chromium may have no installed local voice. Verify transcript UX
  // independently of machine audio, and do not launch an external speech service.
  await page.addInitScript(()=>localStorage.setItem('attunement.radioVoice','0'));
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
    assert.ok(!p.dead,`Fixture cannot move a defeated player to ${x},${z}`);
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
    assert.ok(!p.dead,`Controlled capture ${path}: the player was defeated`);
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
  await page.locator('.radio-panel[data-source="field"]').waitFor({state:'visible'});
  const recordBox=await page.locator('.field-record').boundingBox(),radioBox=await page.locator('.radio-panel').boundingBox();
  assert.ok(recordBox&&radioBox&&(recordBox.x+recordBox.width<=radioBox.x||radioBox.x+radioBox.width<=recordBox.x||recordBox.y+recordBox.height<=radioBox.y||radioBox.y+radioBox.height<=recordBox.y),'Default desktop radio and field record must not overlap');
  assert.match(await page.locator('.radio-transcript').innerText(),/Return to Archivist Venn/);
  assert.equal(await page.locator('.radio-portrait svg').count(),1);
  assert.equal(await page.locator('.radio-wave i').count(),18);
  assert.ok(await page.locator('.radio-panel').getByRole('button',{name:'Play voice'}).isVisible());
  assert.match(await page.locator('.log').innerText(),/Return to Archivist Venn/);
  await capture('preview-evidence/03-field-radio.png');
  await page.getByRole('button',{name:'Dismiss transmission'}).click();
  await page.locator('#view').focus();
  await capture('preview-evidence/03-field-evidence.png');
  await moveTo(6.2, -2.6);
  await page.waitForFunction(() => window.__attune.state().ents.some(e => e.c === 'archivist'));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__attune.state().sheet.survey === 'signal_done');
  assert.equal(p.char.quest.step, 0);
  assert.equal(p.char.xp, 35);
  await capture('preview-evidence/04-report.png');
  // Exercise the actual NPC dialogue panel, not a detached mock-up.
  await page.locator('.plate[data-npc="archivist"]').click({timeout:30000});
  const npcDialog=page.getByRole('dialog',{name:'NPC interaction'});
  await npcDialog.waitFor({state:'visible'});
  const portraitBox=await npcDialog.locator('.npc-portrait').boundingBox();
  const dialogueBox=await npcDialog.locator('.npc-dialogue').boundingBox();
  const npcBox=await npcDialog.boundingBox();
  assert.ok(portraitBox&&dialogueBox&&npcBox&&portraitBox.width<=61&&dialogueBox.y>=portraitBox.y+portraitBox.height&&npcBox.width<=381,'NPC portrait is compact and dialogue spans the panel');
  for(const name of ['Talk','Info · Codex','Workshop'])assert.ok(await npcDialog.getByRole('button',{name,exact:true}).isVisible());
  await page.screenshot({path:'preview-evidence/04a-npc-dialogue.png'});
  await npcDialog.getByRole('button',{name:'Close NPC interaction'}).click();
  await page.locator('#view').focus();
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
  const workshop=page.getByRole('dialog',{name:'Build Planner and Workshop'});
  await workshop.waitFor();
  const baseline=JSON.stringify({equipped:p.char.equipped,inventory:p.char.inventory,materials:p.char.materials});
  await workshop.locator('.workshop-tutorial').waitFor();
  // innerText is rendered text; the lesson kicker and title are styled uppercase.
  assert.match(await workshop.locator('.workshop-tutorial').innerText(),/Lesson 1 \/ 4/i);
  await workshop.getByRole('button',{name:'Next',exact:true}).click();
  assert.match(await workshop.locator('.workshop-tutorial').innerText(),/Recover components/i);
  await workshop.locator('[data-recipe="coupler"]').click();
  assert.equal(await workshop.locator('.recipe-part [data-art="sentinel_alloy"] svg').count(),1);
  assert.equal(await workshop.locator('.recipe-part [data-art="mire_fibre"] svg').count(),1);
  assert.equal(await workshop.locator('.recipe-result [data-art="kinetic_coupler"] svg').count(),1);
  await workshop.locator('[data-recipe="aegis_rectifier"]').click();
  assert.equal(await workshop.locator('.recipe-part [data-art="field_vector_array"] svg').count(),1);
  assert.equal(await workshop.locator('.recipe-part [data-art="conductive_membrane"] svg').count(),1);
  assert.equal(await workshop.locator('.recipe-result [data-art="aegis_rectifier"] svg').count(),1);
  assert.equal(await workshop.locator('[data-craft="aegis_rectifier"]').isDisabled(),true);
  await capture('preview-evidence/06b-workshop-tutorial.png');
  await workshop.getByRole('button',{name:'Next',exact:true}).click();
  await workshop.getByRole('button',{name:'Next',exact:true}).click();
  await workshop.getByRole('button',{name:'Finish tutorial',exact:true}).click();
  assert.ok(await workshop.getByRole('button',{name:'Open tutorial',exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>localStorage.getItem('attunement.workshopTutorial')),'1');
  assert.equal(JSON.stringify({equipped:p.char.equipped,inventory:p.char.inventory,materials:p.char.materials}),baseline);
  await workshop.getByRole('button',{name:'Close Build'}).click();
  await page.locator('#view').focus();
  // The actual character panel retains one blueprint scale across all five equipment categories.
  await page.keyboard.press('KeyC');
  const character=page.getByRole('dialog',{name:'Character and loadout'});
  await character.waitFor({state:'visible'});
  const tabRows=await character.locator('.doll-tabs button').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().top)));
  assert.equal(tabRows.length,6);
  assert.ok(tabRows[0]===tabRows[1]&&tabRows[1]===tabRows[2]&&tabRows[3]===tabRows[4]&&tabRows[4]===tabRows[5]&&tabRows[0]!==tabRows[3],'Six character tabs form two equal rows');
  let blueprintSize,blueprintSrc;
  for(const tab of ['gear','implants','glyphs','weapons','social']){
    await character.locator('.doll-tabs [data-tab="'+tab+'"]').click();
    const image=character.locator('.equipment-sketch img');
    await image.waitFor({state:'visible'});
    const src=await image.getAttribute('src'),box=await image.boundingBox();
    assert.ok(src&&box?.width>0&&box?.height>0);
    if(!blueprintSize){blueprintSize=box;blueprintSrc=src;}
    assert.ok(src===blueprintSrc&&Math.abs(box.width-blueprintSize.width)<1&&Math.abs(box.height-blueprintSize.height)<1,'Blueprint asset and scale must not vary by equipment category');
    assert.equal(await image.evaluate(el=>getComputedStyle(el).opacity),'0.32');
    const slot=character.locator('.equipment-slot-grid .doll-slot').first();
    await slot.click();
    assert.equal(await slot.getAttribute('aria-pressed'),'true');
    if(tab==='gear'||tab==='glyphs')await page.screenshot({path:'preview-evidence/06c-character-'+tab+'.png'});
  }
  await character.locator('.close').click();
  await page.locator('#view').focus();
  // Art capture fixture: isolate the independently tested autonomous hunt
  // before entering the biome, not after it has already defeated the player.
  const predator=server.game.enemies.find(e=>e.type==='faultstalker');
  assert.ok(predator);
  resetEnemy(server.game,predator);
  predator.x=19;predator.z=60;predator.wanderAt=Infinity;predator.huntReadyAt=Infinity;
  await moveTo(-3, 58.4);
  await page.evaluate(() => window.__attune.view({yaw:Math.PI,pitch:.25,dist:12,face:0}));
  await page.waitForFunction(() => document.querySelector('.zone-label')?.textContent.includes('Sinter Flats'));
  assert.ok(await page.evaluate(() => !!window.__attune.gfx.scene.getObjectByName('sinter-ridge:743')));
  await capture('preview-evidence/04b-sinter-flats.png');
  // Unlock is a fixture; deployment and sample collection use real server rules.
  p.char.inventory.push('glyph_faultline');
  p.char.attunements.push('resonance');
  p.char.equipped.glyph='glyph_faultline';
  server.game.refreshStats(p);
  server.game.markDirty(p);
  await moveTo(-3,58.4);
  await page.waitForFunction(()=>{const s=window.__attune.state();return s.sheet.equipped.glyph==='glyph_faultline'&&s.ents.some(e=>e.c==='sinter_sampler');});
  assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('sinter:interferometer')));
  const beforeSampleXp=p.char.xp;
  // Actual ability; fixture only clears earlier cooldown from Brineworks for slow CI.
  p.cds.field_rig=0;p.gcdUntil=0;
  const deployment=useAbility(server.game,p,'field_rig');
  assert.ok(deployment.ok,JSON.stringify({deployment,dead:p.dead,hp:p.hp,position:{x:p.x,z:p.z},rig:p.surveyKit?.rig,now:server.game.time,combatUntil:p.combatUntil}));
  await page.locator('#view').focus();
  await page.keyboard.press('f');
  await page.waitForFunction(()=>window.__attune.state().sheet.inventory.includes('sinter_laminate'));
  assert.equal(p.char.xp,beforeSampleXp);
  await capture('preview-evidence/04c-strata-interferometer.png');
  // Controlled placement for an art evidence capture; ecology movement,
  // convergence, alarm and maturation are independently tested in Node.
  const herd=server.game.enemies.filter(e=>e.form);
  const spots=[[3,51],[5.5,51.5],[8,51]];
  for(const [i,g] of herd.entries()){
    resetEnemy(server.game,g);
    g.x=spots[i][0];g.z=spots[i][1];g.grown=true;
    g.wanderAt=Infinity;g.alarmUntil=0;g.wildAlarmAt=Infinity;
  }
  await moveTo(5.5,45);
  await page.evaluate(()=>window.__attune.view({yaw:0,pitch:0.17,dist:7,face:0}));
  // Different forms and real material binding on all three rendered creatures.
  await page.waitForFunction(()=>{
    const forms=window.__attune.state().ents.filter(e=>e.c==='sinter_grazer').map(e=>e.form).sort();
    return forms.join(',')==='adult,juvenile,shieldback';
  });
  assert.ok(await page.evaluate(()=>{
    const scene=window.__attune.gfx.scene;
    return ['juvenile','adult','shieldback'].every(form=>{
      const rig=scene.getObjectByName('fauna:grazer-'+form);
      let textured=0;
      rig?.traverse(n=>{if(n.isMesh&&n.material?.map?.name==='sinter:mineral-strata')textured++;});
      return textured>=5;
    });
  }));
  await page.waitForFunction(()=>window.__attune.state().ents.filter(e=>e.c==='sinter_grazer').every(e=>e.row?.grown===1));
  await capture('preview-evidence/05-grazer-life-stages.png');
  assert.ok(await page.evaluate(()=>{
    const scene=window.__attune.gfx.scene;
    return !!scene.getObjectByName('sinter:nursery')&&!!scene.getObjectByName('sinter:mineral-bed');
  }));
  // Controlled snapshot fixture: anatomy, visible mineral phenotype and a
  // real defeat using the authoritative damage call, not a DOM mock.
  const adult=herd.find(g=>g.form==='adult');
  adult.calcified=true;adult.scarred=true;
  await page.waitForFunction(()=>{
    const scene=window.__attune.gfx.scene,rig=scene.getObjectByName('fauna:grazer-adult');
    return rig?.getObjectByName('fauna:calcified')?.visible&&rig?.getObjectByName('fauna:scar')?.visible;
  });
  await capture('preview-evidence/05a-adaptive-grazer.png');
  // The defeated-target capture isolates a single adult. Shieldback's real
  // intervention and predator combat are covered by the ecology simulation suite.
  const shieldback=herd.find(g=>g.form==='shieldback');assert.ok(shieldback);
  shieldback.x=3;shieldback.z=65;
  await moveTo(5.5,48);
  adult.x=5.5;adult.z=51.5;adult.wanderAt=Infinity;
  server.game.setTarget(p,adult.id);
  await page.waitForFunction(id=>window.__attune.state().target===id,adult.id);
  assert.ok(/Neutral/.test(await page.locator('.frame.target .sub').innerText()));
  dealDamage(server.game,p,adult,9999,'fixture');
  await page.waitForFunction(()=>document.querySelector('.frame.target .sub')?.textContent.includes('Defeated'));
  await capture('preview-evidence/05b-defeated-grazer.png');
  await moveTo(-39,-8);
  await page.evaluate(() => window.__attune.view({yaw:-Math.PI/2,pitch:0.16,dist:10,face:-Math.PI/2}));
  await page.waitForFunction(() => document.querySelector('.zone-label')?.textContent.includes('Kestrel Deep'));
  await capture('preview-evidence/06-kestrel-approach.png');
  const custodian=server.game.enemies.find(e=>e.type==='quarantine_custodian');
  assert.ok(custodian);
  // Stage an idle living custodian outside proximity aggro for the interior
  // art capture. Its actual encounter combat is independently tested.
  resetEnemy(server.game,custodian);custodian.x=-60;custodian.z=-10.4;custodian.wanderAt=Infinity;
  p.hp=p.maxHp;
  await moveTo(-53,-8);
  await page.evaluate(() => window.__attune.view({yaw:-Math.PI/2,pitch:0.18,dist:6,face:-Math.PI/2}));
  assert.ok(await page.evaluate(() => {
    const scene=window.__attune.gfx.scene;
    return ['kestrel:roof','kestrel:vessel:1701','kestrel:custodian','kestrel:recorder'].every(n=>scene.getObjectByName(n));
  }));
  // Verify actual mesh vertices fit the authoritative cylindrical envelope.
  assert.ok(await page.evaluate(async () => {
    const {Vector3}=await import('/vendor/three/three.module.js');
    const scene=window.__attune.gfx.scene;
    scene.updateMatrixWorld(true);
    for(const seed of [1701,1702]){
      const group=scene.getObjectByName('kestrel:vessel:'+seed);
      if(!group)return false;
      const origin=group.getWorldPosition(new Vector3()),v=new Vector3();
      let max=0;
      group.traverse(n=>{
        if(!n.isMesh)return;
        const p=n.geometry.attributes.position;
        for(let i=0;i<p.count;i++){
          v.fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).sub(origin);
          max=Math.max(max,Math.hypot(v.x,v.z));
        }
      });
      if(max>1.05+1e-5)return false;
    }
    return true;
  }));
  await capture('preview-evidence/07-kestrel-interior.png');
  // A deterministic kill and cleared linger are setup for the recorder
  // interaction; Node tests independently cover actual encounter rules.
  // The actual damage API is used from the same room, never a wall bypass.
  assert.ok(!p.dead,'The recorder scenario requires a living player');
  custodian.x=-55;custodian.z=-8;
  if(custodian.state!=='dead') {
    custodian.state='combat';
    dealDamage(server.game,p,custodian,9999,'fixture');
  }
  assert.equal(custodian.state,'dead','The setup kill must actually succeed');
  p.combatUntil=0;
  await moveTo(-59,-8);
  await page.keyboard.press('f');
  await page.waitForFunction(()=>window.__attune.state().sheet.inventory.includes('phase_damper'));
  assert.ok(p.char.inventory.includes('sinter_laminate'));
  await page.locator('.radio-panel[data-source="kestrel"]').waitFor({state:'visible'});
  assert.match(await page.locator('.radio-transcript').innerText(),/Kestrel Phase Damper/);
  assert.match(await page.locator('.log').innerText(),/Kestrel Phase Damper/);
  await capture('preview-evidence/08-kestrel-recorder.png');
  await moveTo(-39,-8);
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
  // A starved software-GL page can miss a heartbeat and resume its session;
  // wait for the server-side player to exist rather than sample it once.
  let tank;
  for(let i=0;i<240&&!(tank=[...server.game.players.values()].find(x=>x.name==='Aegis Keeper'));i++)await new Promise(r=>setTimeout(r,250));
  assert.ok(tank,'Aegis Keeper never appeared on the server');
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
