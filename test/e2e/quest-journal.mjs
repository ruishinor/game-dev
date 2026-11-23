import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {checkDirective} from '../../server/sim/progress.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 fs.mkdirSync('quest-evidence',{recursive:true});browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
 await page.click('#gate-guest-link');await page.fill('#name','Journal Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard';});
 const p=await liveFixturePlayer(page,server,'Journal Tester');
 // Render once per evidence capture on software GL; keep client simulation,
 // WebSocket heartbeat and authoritative quest progression running throughout.
 if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 const capture=async path=>{
  if(SOFTWARE_GL){
   await page.evaluate(()=>window.__attune.pause(false));
   const n=await page.evaluate(()=>window.__attune.state().drawn);
   await page.waitForFunction(n=>window.__attune.state().drawn>n,n);
  }
  await page.screenshot({path});
  if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));
 };
 // Exercise the authoritative completion transition with the prerequisite fixture.
 p.char.quest={step:0,progress:3};checkDirective(server.game,p);
 assert.equal(p.char.quest.step,1);
 assert.equal(p.char.directiveReceipts[0].item,'servo_harness');
 // The next historical completion is intentionally without a receipt.
 p.char.quest={step:2,progress:0};p.char.survey='signal';server.game.markDirty(p);
 await page.waitForFunction(()=>window.__attune.state().sheet.quest.step===2&&window.__attune.state().sheet.survey==='signal');
 await page.locator('#view').focus();await page.keyboard.press('KeyL');
 const journal=page.getByRole('dialog',{name:'Quest Journal'});await journal.waitFor({state:'visible'});
 assert.equal(await journal.getByRole('button',{name:'Close Quest Journal'}).evaluate(el=>document.activeElement===el),true,'Opening from the world must focus the Journal close control');
 assert.equal(await journal.locator('[data-quest][data-status="completed"]').count(),2);
 assert.equal(await journal.locator('[data-quest][data-status="active"]').count(),2);
 assert.equal(await journal.getByRole('button',{name:/The Vault Warden/}).count(),0);
 await journal.locator('[data-quest="directive:field_trial"]').click();
 assert.match(await journal.locator('.quest-rewards').innerText(),/Listed quest rewards/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/30 XP/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/Sentinel Servo Harness/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/Received at completion/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/30 XP credited/);
 await journal.locator('[data-quest="directive:calibrate"]').click();
 assert.match(await journal.locator('.quest-rewards').innerText(),/not a historical record of grants/);
 await journal.getByRole('button',{name:'Completed',exact:true}).click();
 assert.equal(await journal.getByRole('button',{name:'Completed',exact:true}).evaluate(el=>document.activeElement===el),true,'Redrawing the filter must retain keyboard focus');
 assert.equal(await journal.locator('[data-quest]').count(),2);
 await journal.getByRole('button',{name:'All',exact:true}).click();
 await journal.locator('[data-quest="brine:investigation"]').click();
 assert.equal(await journal.locator('[data-quest="brine:investigation"]').evaluate(el=>document.activeElement===el),true,'Redrawing the selected quest must retain keyboard focus');
 assert.match(await journal.locator('.quest-journal-detail').innerText(),/return to Archivist Venn/i);
 assert.match(await journal.locator('.quest-rewards').innerText(),/35 XP/);
 assert.equal(await journal.getByRole('button',{name:'Untrack quest'}).count(),1);
 await journal.getByRole('button',{name:'Untrack quest'}).click();
 assert.ok(await page.locator('.quest-tracker-group [data-tracked-id=""]').last().isHidden());
 await journal.getByRole('button',{name:'Track quest',exact:true}).click();
 assert.ok(await page.locator('.quest-tracker-group [data-tracked-id="brine:investigation"]').isVisible());
 await capture('quest-evidence/01-journal.png');
 p.char.survey='signal_done';p.char.brineStage=1;server.game.markDirty(p);
 await journal.locator('[data-quest="brine:commissioning"]').waitFor({state:'visible'});
 assert.equal(await journal.locator('[data-quest="brine:investigation"]').getAttribute('data-status'),'completed');
 await page.keyboard.press('Escape');assert.ok(await journal.isHidden());
 assert.equal(await page.locator('#view').evaluate(el=>document.activeElement===el),true,'Escape must restore focus to the invoking world canvas');
 await page.getByRole('button',{name:'Minimize quest tracker'}).click();assert.ok(await page.locator('.quest-tracker-cards').isHidden());
 await page.getByRole('button',{name:'Expand quest tracker'}).click();assert.ok(await page.locator('.quest-tracker-cards').isVisible());
 // Completed Brineworks must not hide an actionable field service.
 p.char.brineStage=3;p.x=38;p.z=-36.5;server.game.markDirty(p);
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.sheet.brineStage===3&&s.you.workshop==='brine_research';});
 // The network snapshot precedes the HUD's animation-frame update.
 await page.getByRole('button',{name:'Open field Workshop [B]',exact:true}).waitFor({state:'visible'});
 await page.getByRole('button',{name:'Minimize quest tracker'}).click();
 assert.ok(await page.getByRole('button',{name:'Open field Workshop [B]',exact:true}).isVisible());
 await page.getByRole('button',{name:'Expand quest tracker'}).click();
 await page.getByRole('button',{name:'Open field Workshop [B]',exact:true}).click();
 await page.locator('.workshop-window').waitFor({state:'visible'});
 const layoutPanel=page.locator('.workshop-window');
 const beforeLayout=await layoutPanel.boundingBox();
 const moveButton=layoutPanel.getByRole('button',{name:'Move window',exact:true});
 const moveBox=await moveButton.boundingBox();
 await page.mouse.move(moveBox.x+moveBox.width/2,moveBox.y+moveBox.height/2);
 await page.mouse.down();await page.mouse.move(moveBox.x+moveBox.width/2+50,moveBox.y+moveBox.height/2+20,{steps:5});await page.mouse.up();
 assert.ok((await layoutPanel.boundingBox()).x>beforeLayout.x+10);
 const resizeButton=layoutPanel.getByRole('button',{name:'Resize window',exact:true});
 const beforeResize=await layoutPanel.boundingBox();
 await resizeButton.focus();await page.keyboard.press('ArrowLeft');
 assert.ok((await layoutPanel.boundingBox()).width<beforeResize.width);
 await layoutPanel.getByRole('button',{name:'Opacity 100%',exact:true}).click();
 assert.equal(await layoutPanel.evaluate(el=>el.style.getPropertyValue('--window-alpha')),'0.8');
 await layoutPanel.getByRole('button',{name:'Lock layout',exact:true}).click();
 assert.ok(await moveButton.isDisabled()&&await resizeButton.isDisabled());
 const savedLayout=await page.evaluate(()=>JSON.parse(localStorage.getItem('attunement.window.workshop')));
 assert.equal(savedLayout.locked,true);assert.equal(savedLayout.opacity,80);assert.ok(savedLayout.rect);
 await page.locator('#view').focus();await page.keyboard.press('Escape');
 await page.locator('#view').focus();await page.keyboard.press('KeyB');await layoutPanel.waitFor({state:'visible'});
 assert.ok(await layoutPanel.getByRole('button',{name:'Unlock layout',exact:true}).isVisible());
 await layoutPanel.getByRole('button',{name:'Reset layout',exact:true}).click();
 assert.equal(await layoutPanel.getAttribute('data-window-custom'),null);
 await page.locator('#view').focus();await page.keyboard.press('Escape');
 await capture('quest-evidence/02-tracker.png');
 // Eligible setup only. Venn, both field instruments and the final report
 // use the ordinary authoritative interaction path. Existing content remains.
 p.char.level=3;p.char.attunements=['resonance'];p.char.inventory.push('sinter_laminate');server.game.refreshStats(p);server.game.markDirty(p);
 async function moveForQuest(obj,dx=0,dz=1.7){
  const actor=await liveFixturePlayer(page,server,'Journal Tester');assert.equal(actor,p);
  p.x=obj.x+dx;p.z=obj.z+dz;p.combatUntil=0;
  await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1.5;},[p.x,p.z]);
  await page.locator('#view').focus();await page.keyboard.press('KeyF');
 }
 const venn=server.game.objects.find(o=>o.type==='archivist'),sampler=server.game.objects.find(o=>o.type==='sinter_sampler'),recorder=server.game.objects.find(o=>o.type==='deep_console');
 await moveForQuest(venn,2,0);
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.[0]?.status==='active');
 await page.keyboard.press('Escape');
 await page.keyboard.press('KeyL');await journal.waitFor({state:'visible'});
 await journal.locator('[data-quest="field:residual_traces"]').click();
 assert.match(await journal.locator('.quest-journal-detail').innerText(),/0 \/ 2 readings/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/Research allotment/);
 assert.doesNotMatch(await journal.locator('.quest-rewards').innerText(),/Culture matrix|Kinetic coupler/);
 await journal.getByRole('button',{name:'Close Quest Journal'}).click();
 for(const e of server.game.enemies){e.state='dead';e.deadAt=server.game.time;e.respawnAt=Infinity;e.threat.clear();}
 await moveForQuest(sampler,0,1.7);
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.[0]?.progress==='1 / 2 readings');
 await moveForQuest(recorder,2.5,0);
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.[0]?.progress==='2 / 2 readings');
 await moveForQuest(venn,2,0);
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.[0]?.status==='completed');
 assert.equal(p.char.materials.culture_matrix,1);
 await page.keyboard.press('Escape');await page.locator('#view').focus();await page.keyboard.press('KeyL');
 await journal.locator('[data-quest="field:residual_traces"]').click();
 assert.match(await journal.locator('.quest-journal-detail').innerText(),/strata-first/i);
 assert.match(await journal.locator('.quest-rewards').innerText(),/55 XP/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/Culture matrix/i);
 assert.match(await journal.locator('.quest-rewards').innerText(),/Received at completion/);
 assert.match(await journal.locator('.quest-rewards').innerText(),/55 XP credited/);
 await capture('quest-evidence/03-residual-traces.png');
 await journal.getByRole('button',{name:'Close Quest Journal'}).click();
 await page.locator('#view').focus();await page.keyboard.press('KeyJ');
 assert.ok(await page.getByRole('dialog',{name:'Codex',exact:true}).isVisible());
 await page.locator('#view').focus();await page.keyboard.press('Escape');
 // Material fixture only; exercise real Inventory, Codex and Workshop controls.
 p.char.materials.kinetic_coupler=1;server.game.markDirty(p);
 await page.waitForFunction(()=>window.__attune.state().sheet?.materials?.kinetic_coupler===1);
 await page.keyboard.press('KeyI');
 const inventory=page.getByRole('dialog',{name:'Inventory',exact:true});
 await inventory.locator('[data-material="kinetic_coupler"]').click();
 const codex=page.getByRole('dialog',{name:'Codex',exact:true});
 await codex.locator('.material-uses [data-material-recipe="calibrate_servo"]').waitFor({state:'visible'});
 await codex.locator('.material-uses [data-material-recipe="calibrate_servo"]').click();
 const recipe=page.locator('.recipe-detail');
 await recipe.getByRole('heading',{name:'Calibrate servo harness',exact:true}).waitFor({state:'visible'});
 assert.ok(await recipe.getByText('Requirements',{exact:true}).isVisible());
 await page.locator('#view').focus();await page.keyboard.press('Escape');
 if(await inventory.isVisible())await inventory.getByRole('button',{name:'Close inventory'}).click();
 await page.locator('#view').focus();await page.keyboard.press('KeyC');
 // Profession abilities are deliberately collapsed in the compact Character view.
 // Open the real disclosure before exercising its Codex action.
 const professionAbilities=page.locator('details.character-secondary').filter({hasText:'Profession abilities'});
 await professionAbilities.locator('summary').waitFor({state:'visible'});
 if(!await professionAbilities.evaluate(node=>node.open))await professionAbilities.locator('summary').click();
 assert.ok(await professionAbilities.getByRole('button',{name:'[1] Rending Arc',exact:true}).isVisible());
 await professionAbilities.getByRole('button',{name:'[1] Rending Arc',exact:true}).click();
 await codex.getByRole('heading',{name:'Rending Arc',exact:true}).waitFor({state:'visible'});
 assert.match(await codex.locator('.codex-facts').innerText(),/Kinetic Vanguard · key 1/);
 assert.deepEqual(errors,[]);
 console.log('PASS live Quest Journal, progress snapshots, filters, and separate Codex');
}finally{await browser?.close();await server.close();}
